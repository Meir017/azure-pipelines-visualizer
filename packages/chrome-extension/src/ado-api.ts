import { type BuildInfo, toBuildInfo } from './build-types.js';

const API_VERSION = '7.1';
const MAX_DEPTH = 5;
const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes

function baseUrl(org: string, project: string): string {
  return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis`;
}

async function adoFetch(url: string, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(url, { credentials: 'include' });
    if (resp.ok) return resp;
    if (attempt < retries && (resp.status === 429 || resp.status >= 500)) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
      continue;
    }
    const text = await resp.text();
    throw new Error(`ADO API error (${resp.status}): ${text}`);
  }
}

export async function fetchBuild(
  org: string,
  project: string,
  buildId: number,
): Promise<BuildInfo> {
  const url = `${baseUrl(org, project)}/build/builds/${buildId}?api-version=${API_VERSION}`;
  const resp = await adoFetch(url);
  const data = await resp.json();
  return toBuildInfo(data);
}

/** Search a single project for builds triggered by a specific parent build. */
async function searchProjectForTriggers(
  org: string,
  project: string,
  parentBuildId: number,
  parentProjectId: string | null,
  parentFinishTime: string,
): Promise<BuildInfo[]> {
  const refMs = new Date(parentFinishTime).getTime();
  const results: BuildInfo[] = [];

  for (const reason of ['buildCompletion', 'resourceTrigger']) {
    const params = new URLSearchParams({
      'api-version': API_VERSION,
      reasonFilter: reason,
      queryOrder: 'queueTimeAscending',
      $top: '200',
      minTime: new Date(refMs - 10 * 60 * 1000).toISOString(),
      maxTime: new Date(refMs + 60 * 60 * 1000).toISOString(),
    });

    const url = `${baseUrl(org, project)}/build/builds?${params}`;
    const resp = await adoFetch(url);
    const data = await resp.json();
    const builds = ((data.value ?? []) as Record<string, unknown>[]).map(
      toBuildInfo,
    );
    for (const b of builds) {
      if (b.upstreamBuildId !== parentBuildId) continue;

      // For cross-project resource triggers, verify projectId matches the parent
      if (
        parentProjectId &&
        b.reason === 'resourceTrigger' &&
        b.triggerInfo.projectId &&
        b.triggerInfo.projectId !== parentProjectId
      ) {
        continue;
      }

      results.push(b);
    }
  }

  return results;
}

/**
 * Find builds triggered by a specific build, searching the primary project
 * and optionally related projects. Fails soft on related project errors.
 */
async function listBuildsTriggeredBy(
  org: string,
  projects: string[],
  parentBuildId: number,
  parentProjectId: string | null,
  parentFinishTime: string,
): Promise<BuildInfo[]> {
  if (projects.length === 0) return [];

  const [primary, ...related] = projects;

  // Primary project: hard fail on error
  const primaryResults = await searchProjectForTriggers(
    org,
    primary,
    parentBuildId,
    parentProjectId,
    parentFinishTime,
  );

  if (related.length === 0) return primaryResults;

  // Related projects: fail soft (ignore 401/403/404 errors)
  const relatedResults = await Promise.allSettled(
    related.map((proj) =>
      searchProjectForTriggers(
        org,
        proj,
        parentBuildId,
        parentProjectId,
        parentFinishTime,
      ),
    ),
  );

  const allResults = [...primaryResults];
  for (const result of relatedResults) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    }
  }

  return allResults;
}

/**
 * Build full trigger chain with polling for in-progress builds.
 * Supports cross-project discovery: pass multiple project names in `projects`.
 */
export async function buildTriggerChain(
  org: string,
  projects: string[],
  rootBuild: BuildInfo,
  onBatch: (builds: BuildInfo[]) => void,
  signal?: AbortSignal,
): Promise<BuildInfo[]> {
  const visited = new Map<number, BuildInfo>();
  visited.set(rootBuild.id, rootBuild);
  onBatch([rootBuild]);

  const buildDepth = new Map<number, number>();
  buildDepth.set(rootBuild.id, 0);

  const pendingExpansion: BuildInfo[] = [];
  const inProgress = new Map<number, BuildInfo>();

  if (rootBuild.status === 'completed' && rootBuild.finishTime) {
    pendingExpansion.push(rootBuild);
  } else {
    inProgress.set(rootBuild.id, rootBuild);
  }

  const startTime = Date.now();

  while (
    (pendingExpansion.length > 0 || inProgress.size > 0) &&
    Date.now() - startTime < MAX_POLL_TIME_MS
  ) {
    if (signal?.aborted) break;

    while (pendingExpansion.length > 0) {
      const batch = pendingExpansion.splice(0);
      const expandable = batch.filter(
        (b) => (buildDepth.get(b.id) ?? 0) < MAX_DEPTH,
      );
      if (expandable.length === 0) break;

      const childResults = await Promise.all(
        expandable.map((parent) =>
          listBuildsTriggeredBy(
            org,
            projects,
            parent.id,
            parent.project.id || null,
            parent.finishTime!,
          ),
        ),
      );

      const newBuilds: BuildInfo[] = [];
      for (let i = 0; i < expandable.length; i++) {
        const parentDepth = buildDepth.get(expandable[i].id) ?? 0;
        for (const child of childResults[i]) {
          if (!visited.has(child.id)) {
            visited.set(child.id, child);
            buildDepth.set(child.id, parentDepth + 1);
            newBuilds.push(child);

            if (child.status === 'completed' && child.finishTime) {
              pendingExpansion.push(child);
            } else {
              inProgress.set(child.id, child);
            }
          }
        }
      }

      if (newBuilds.length > 0) {
        onBatch(newBuilds);
      }
    }

    if (inProgress.size === 0) break;

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (signal?.aborted) break;

    // Poll in-progress builds from their actual project (may be cross-project)
    const pollEntries = [...inProgress.values()];
    const refreshed = await Promise.allSettled(
      pollEntries.map((b) =>
        fetchBuild(org, b.project.name || projects[0], b.id),
      ),
    );

    for (const result of refreshed) {
      if (result.status !== 'fulfilled') continue;
      const build = result.value;
      visited.set(build.id, build);

      if (build.status === 'completed' && build.finishTime) {
        inProgress.delete(build.id);
        pendingExpansion.push(build);
        onBatch([]);
      }
    }
  }

  return [...visited.values()];
}
