import { type BuildInfo, toBuildInfo } from './build-types.js';

const API_VERSION = '7.1';

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
  parentFinishTime: string | null,
  parentQueueTime: string,
): Promise<BuildInfo[]> {
  const refTime = parentFinishTime ?? parentQueueTime;
  const refMs = new Date(refTime).getTime();
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
 * BFS to build full trigger chain starting from a single build.
 * Calls onBatch with each new level of discovered builds.
 */
export async function buildTriggerChain(
  org: string,
  project: string,
  rootBuild: BuildInfo,
  onBatch: (builds: BuildInfo[]) => void,
): Promise<BuildInfo[]> {
  const visited = new Map<number, BuildInfo>();
  visited.set(rootBuild.id, rootBuild);
  onBatch([rootBuild]);

  let frontier = [rootBuild];
  for (let depth = 0; depth < 5 && frontier.length > 0; depth++) {
    const childResults = await Promise.all(
      frontier.map((parent) =>
        listBuildsTriggeredBy(
          org,
          project,
          parent.id,
          parent.finishTime,
          parent.queueTime,
        ),
      ),
    );
    const newBuilds: BuildInfo[] = [];
    for (const children of childResults) {
      for (const child of children) {
        if (!visited.has(child.id)) {
          visited.set(child.id, child);
          newBuilds.push(child);
        }
      }
    }
    if (newBuilds.length > 0) {
      onBatch(newBuilds);
    }
    frontier = newBuilds;
  }

  return [...visited.values()];
}
