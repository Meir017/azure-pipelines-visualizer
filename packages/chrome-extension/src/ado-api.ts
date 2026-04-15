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

/** Find builds triggered (directly or via pipeline completion) by a specific build. */
async function listBuildsTriggeredBy(
  org: string,
  project: string,
  parentBuildId: number,
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
      if (b.upstreamBuildId === parentBuildId) {
        results.push(b);
      }
    }
  }

  return results;
}

/**
 * Build full trigger chain with polling for in-progress builds.
 * Calls onBatch with each new set of discovered builds, and onUpdate
 * when an existing build's status changes. Polls in-progress builds
 * until they complete, then searches for their triggered children.
 */
export async function buildTriggerChain(
  org: string,
  project: string,
  rootBuild: BuildInfo,
  onBatch: (builds: BuildInfo[]) => void,
  signal?: AbortSignal,
): Promise<BuildInfo[]> {
  const visited = new Map<number, BuildInfo>();
  visited.set(rootBuild.id, rootBuild);
  onBatch([rootBuild]);

  // Track builds at each depth for the depth limit
  const buildDepth = new Map<number, number>();
  buildDepth.set(rootBuild.id, 0);

  // Pending: completed builds whose children we haven't searched yet
  const pendingExpansion: BuildInfo[] = [];
  // In-progress builds we need to poll
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

    // Expand all completed builds whose children we haven't found yet
    while (pendingExpansion.length > 0) {
      const batch = pendingExpansion.splice(0);
      // Only expand builds within the depth limit
      const expandable = batch.filter(
        (b) => (buildDepth.get(b.id) ?? 0) < MAX_DEPTH,
      );
      if (expandable.length === 0) break;

      const childResults = await Promise.all(
        expandable.map((parent) =>
          listBuildsTriggeredBy(org, project, parent.id, parent.finishTime!),
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

    // If no in-progress builds left, we're done
    if (inProgress.size === 0) break;

    // Poll in-progress builds
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (signal?.aborted) break;

    const pollIds = [...inProgress.keys()];
    const refreshed = await Promise.all(
      pollIds.map((id) => fetchBuild(org, project, id)),
    );

    for (const build of refreshed) {
      // Update the build info in visited map
      visited.set(build.id, build);

      if (build.status === 'completed' && build.finishTime) {
        inProgress.delete(build.id);
        pendingExpansion.push(build);
        // Notify that this build's status changed
        onBatch([]);
      }
    }
  }

  return [...visited.values()];
}
