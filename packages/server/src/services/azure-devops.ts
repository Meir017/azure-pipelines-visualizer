import type { IFileProvider } from '@meirblachman/azure-pipelines-visualizer-core';
import { collapsePath } from '@meirblachman/azure-pipelines-visualizer-core';
import { getAzureDevOpsToken } from '../auth.js';
import { MemoryTTLCache } from './memory-cache.js';

const API_VERSION = '7.1';

// In-memory caches to avoid redundant ADO API round-trips.
// Repo metadata rarely changes — cache for 10 minutes.
const repoCache = new MemoryTTLCache<RepositoryInfo>(600);
// Branch→commit resolution — cache for 2 minutes (balances freshness vs speed).
const commitShaCache = new MemoryTTLCache<string>(120);

export interface BuildDefinitionRef {
  id: number;
  name: string;
}

export interface BuildInfo {
  id: number;
  buildNumber: string;
  definition: BuildDefinitionRef;
  status: string;
  result: string | null;
  reason: string;
  startTime: string | null;
  finishTime: string | null;
  queueTime: string;
  sourceBranch: string;
  sourceVersion: string;
  project: { id: string; name: string };
  requestedFor: { displayName: string; uniqueName: string } | null;
  triggerInfo: Record<string, string>;
  triggeredByBuild: {
    id: number;
    buildNumber: string;
    definition: BuildDefinitionRef;
  } | null;
  /** Normalized upstream build ID: from triggeredByBuild.id or triggerInfo.pipelineId */
  upstreamBuildId: number | null;
  tags: string[];
  url: string;
  _links: { web: { href: string } } | null;
}

export interface PipelineInfo {
  id: number;
  name: string;
  folder: string;
  revision: number;
}

export interface PipelineDefinition {
  id: number;
  name: string;
  path: string;
  repository: {
    id: string;
    name: string;
    type: string;
    defaultBranch: string;
  };
}

export interface RepositoryInfo {
  id: string;
  name: string;
  defaultBranch: string;
  project: { id: string; name: string };
}

interface VersionDescriptor {
  version: string;
  versionType: 'branch' | 'tag' | 'commit';
}

const COMMIT_SHA_RE = /^[0-9a-f]{7,40}$/i;

async function adoFetch(url: string, retries = 2): Promise<Response> {
  const token = await getAzureDevOpsToken();
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (response.status === 429 || response.status >= 500) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Azure DevOps API error (${response.status}): ${text}`);
    }
    return response;
  }
  throw new Error('Azure DevOps API: max retries exceeded');
}

function baseUrl(org: string, project: string): string {
  return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis`;
}

export function normalizeGitRef(ref: string): string {
  if (ref.startsWith('refs/')) {
    return ref;
  }

  if (COMMIT_SHA_RE.test(ref)) {
    return ref;
  }

  return `refs/heads/${ref}`;
}

export function getVersionDescriptor(ref: string): VersionDescriptor {
  const normalizedRef = normalizeGitRef(ref);

  if (normalizedRef.startsWith('refs/heads/')) {
    return {
      version: normalizedRef.slice('refs/heads/'.length),
      versionType: 'branch',
    };
  }

  if (normalizedRef.startsWith('refs/tags/')) {
    return {
      version: normalizedRef.slice('refs/tags/'.length),
      versionType: 'tag',
    };
  }

  return {
    version: normalizedRef,
    versionType: 'commit',
  };
}

export async function resolveCommitSha(
  org: string,
  project: string,
  repoId: string,
  ref: string,
): Promise<string> {
  const normalizedRef = normalizeGitRef(ref);
  const descriptor = getVersionDescriptor(normalizedRef);

  if (descriptor.versionType === 'commit') {
    return descriptor.version;
  }

  const cacheKey = `${org}/${project}/${repoId}/${normalizedRef}`.toLowerCase();
  return commitShaCache.getOrFetch(cacheKey, async () => {
    const filter = normalizedRef.replace(/^refs\//, '');
    const url = `${baseUrl(org, project)}/git/repositories/${encodeURIComponent(repoId)}/refs?filter=${encodeURIComponent(filter)}&api-version=${API_VERSION}`;
    const resp = await adoFetch(url);
    const data = (await resp.json()) as {
      value?: Array<{ name?: string; objectId?: string }>;
    };
    const match = data.value?.find((item) => item.name === normalizedRef);

    if (!match?.objectId) {
      throw new Error(`Git ref not found: ${normalizedRef}`);
    }

    return match.objectId;
  });
}

export async function listPipelines(
  org: string,
  project: string,
): Promise<PipelineInfo[]> {
  const url = `${baseUrl(org, project)}/pipelines?api-version=${API_VERSION}`;
  const resp = await adoFetch(url);
  const data = await resp.json();
  return data.value;
}

export async function getPipelineDefinition(
  org: string,
  project: string,
  definitionId: number,
): Promise<PipelineDefinition> {
  const url = `${baseUrl(org, project)}/build/definitions/${definitionId}?api-version=${API_VERSION}`;
  const resp = await adoFetch(url);
  const data = await resp.json();
  return {
    id: data.id,
    name: data.name,
    path: data.process?.yamlFilename ?? data.path,
    repository: {
      id: data.repository?.id,
      name: data.repository?.name,
      type: data.repository?.type,
      defaultBranch: data.repository?.defaultBranch,
    },
  };
}

export async function listRepositories(
  org: string,
  project: string,
): Promise<RepositoryInfo[]> {
  const url = `${baseUrl(org, project)}/git/repositories?api-version=${API_VERSION}`;
  const resp = await adoFetch(url);
  const data = await resp.json();
  return data.value;
}

export async function getRepository(
  org: string,
  project: string,
  repoName: string,
): Promise<RepositoryInfo> {
  const cacheKey = `${org}/${project}/${repoName}`.toLowerCase();
  return repoCache.getOrFetch(cacheKey, async () => {
    const url = `${baseUrl(org, project)}/git/repositories/${encodeURIComponent(repoName)}?api-version=${API_VERSION}`;
    const resp = await adoFetch(url);
    return resp.json();
  });
}

export async function getFileContent(
  org: string,
  project: string,
  repoId: string,
  path: string,
  branch?: string,
): Promise<string> {
  // Normalize: ensure absolute and collapse any '..' segments
  const absPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedPath = collapsePath(absPath);
  let url = `${baseUrl(org, project)}/git/repositories/${encodeURIComponent(repoId)}/items?scopePath=${encodeURIComponent(normalizedPath)}&api-version=${API_VERSION}&$format=text`;
  if (branch) {
    const descriptor = getVersionDescriptor(branch);
    url += `&versionDescriptor.version=${encodeURIComponent(descriptor.version)}&versionDescriptor.versionType=${descriptor.versionType}`;
  }
  const resp = await adoFetch(url);
  return resp.text();
}

function toBuildInfo(data: Record<string, unknown>): BuildInfo {
  const def = data.definition as Record<string, unknown> | undefined;
  const reqFor = data.requestedFor as Record<string, unknown> | undefined;
  const triggered = data.triggeredByBuild as
    | Record<string, unknown>
    | undefined;
  const triggeredDef = triggered?.definition as
    | Record<string, unknown>
    | undefined;
  const links = data._links as Record<string, unknown> | undefined;
  const web = links?.web as Record<string, unknown> | undefined;
  const proj = data.project as Record<string, unknown> | undefined;
  const triggerInfo = (data.triggerInfo as Record<string, string>) ?? {};

  const triggeredById = triggered ? (triggered.id as number) : null;
  const pipelineIdStr = triggerInfo.pipelineId;
  const upstreamBuildId =
    triggeredById ?? (pipelineIdStr ? Number(pipelineIdStr) : null);

  return {
    id: data.id as number,
    buildNumber: data.buildNumber as string,
    definition: {
      id: (def?.id as number) ?? 0,
      name: (def?.name as string) ?? '',
    },
    status: data.status as string,
    result: (data.result as string) ?? null,
    reason: (data.reason as string) ?? '',
    startTime: (data.startTime as string) ?? null,
    finishTime: (data.finishTime as string) ?? null,
    queueTime: data.queueTime as string,
    sourceBranch: data.sourceBranch as string,
    sourceVersion: data.sourceVersion as string,
    project: {
      id: (proj?.id as string) ?? '',
      name: (proj?.name as string) ?? '',
    },
    requestedFor: reqFor
      ? {
          displayName: reqFor.displayName as string,
          uniqueName: reqFor.uniqueName as string,
        }
      : null,
    triggerInfo,
    triggeredByBuild: triggered
      ? {
          id: triggered.id as number,
          buildNumber: triggered.buildNumber as string,
          definition: {
            id: (triggeredDef?.id as number) ?? 0,
            name: (triggeredDef?.name as string) ?? '',
          },
        }
      : null,
    upstreamBuildId,
    tags: (data.tags as string[]) ?? [],
    url: data.url as string,
    _links: web ? { web: { href: web.href as string } } : null,
  };
}

export async function listBuildsForCommit(
  org: string,
  project: string,
  repositoryId: string,
  commitSha: string,
): Promise<BuildInfo[]> {
  // ADO API does NOT support sourceVersion as a query filter —
  // we must fetch builds for the repo and filter client-side.
  const params = new URLSearchParams({
    'api-version': API_VERSION,
    repositoryId,
    repositoryType: 'TfsGit',
    queryOrder: 'queueTimeDescending',
    $top: '500',
  });

  const url = `${baseUrl(org, project)}/build/builds?${params}`;
  const resp = await adoFetch(url);
  const data = await resp.json();
  const all = ((data.value ?? []) as Record<string, unknown>[]).map(
    toBuildInfo,
  );
  return all.filter((b) => b.sourceVersion === commitSha);
}

/** Find builds triggered (directly or via pipeline completion) by a specific build. */
export async function listBuildsTriggeredBy(
  org: string,
  projects: string[],
  parentBuildId: number,
  parentProjectId: string,
  parentFinishTime: string | null,
  parentQueueTime: string,
): Promise<BuildInfo[]> {
  // Use finishTime if available, otherwise fall back to queueTime
  const refTime = parentFinishTime ?? parentQueueTime;
  const refMs = new Date(refTime).getTime();

  const searchProject = async (project: string): Promise<BuildInfo[]> => {
    const results: BuildInfo[] = [];
    // Query for buildCompletion and resourceTrigger reasons separately
    for (const reason of ['buildCompletion', 'resourceTrigger']) {
      const params = new URLSearchParams({
        'api-version': API_VERSION,
        reasonFilter: reason,
        queryOrder: 'queueTimeAscending',
        $top: '200',
        // Triggered builds usually queue within minutes of the parent finishing
        minTime: new Date(refMs - 10 * 60 * 1000).toISOString(),
        maxTime: new Date(refMs + 60 * 60 * 1000).toISOString(),
      });

      const url = `${baseUrl(org, project)}/build/builds?${params}`;
      const resp = await adoFetch(url);
      const data = await resp.json();
      const builds = ((data.value ?? []) as Record<string, unknown>[]).map(
        toBuildInfo,
      );
      // Filter to builds whose upstream is the parent
      for (const b of builds) {
        if (b.upstreamBuildId !== parentBuildId) continue;
        // For resource triggers from other projects, verify the projectId matches
        if (
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
  };

  if (projects.length <= 1) {
    return searchProject(projects[0]);
  }

  // Search all projects in parallel; soft-fail related (non-primary) projects
  const results = await Promise.allSettled(projects.map(searchProject));
  const all: BuildInfo[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      all.push(...r.value);
    } else if (i === 0) {
      throw r.reason; // primary project must succeed
    } else {
      console.warn(`Cross-project search failed for ${projects[i]}:`, r.reason);
    }
  }
  return all;
}

/**
 * Build the full commit flow graph: root builds + recursively triggered builds.
 * Yields builds progressively as they are discovered (BFS).
 * Searches related projects for cross-project trigger chains.
 */
export async function* streamCommitFlowGraph(
  org: string,
  projects: string[],
  repositoryId: string,
  commitSha: string,
): AsyncGenerator<BuildInfo[]> {
  const rootBuilds = await listBuildsForCommit(
    org,
    projects[0],
    repositoryId,
    commitSha,
  );
  const visited = new Map<number, BuildInfo>();
  for (const b of rootBuilds) visited.set(b.id, b);

  if (rootBuilds.length > 0) {
    yield rootBuilds;
  }

  // BFS to find downstream triggered builds (max depth 5)
  let frontier = [...rootBuilds];
  for (let depth = 0; depth < 5 && frontier.length > 0; depth++) {
    const nextFrontier: BuildInfo[] = [];
    // Parallelize queries for all parents in the frontier
    const childResults = await Promise.all(
      frontier.map((parent) =>
        listBuildsTriggeredBy(
          org,
          projects,
          parent.id,
          parent.project.id,
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
          nextFrontier.push(child);
          newBuilds.push(child);
        }
      }
    }
    if (newBuilds.length > 0) {
      yield newBuilds;
    }
    frontier = nextFrontier;
  }
}

/**
 * Build the full commit flow graph (non-streaming).
 * Returns a flat array of all builds in the trigger chain.
 */
export async function getCommitFlowGraph(
  org: string,
  projects: string[],
  repositoryId: string,
  commitSha: string,
): Promise<BuildInfo[]> {
  const all: BuildInfo[] = [];
  for await (const batch of streamCommitFlowGraph(
    org,
    projects,
    repositoryId,
    commitSha,
  )) {
    all.push(...batch);
  }
  return all;
}

export async function listTestRunsForBuild(
  org: string,
  project: string,
  buildId: number,
) {
  const url = `${baseUrl(org, project)}/test/runs?buildUri=vstfs:///Build/Build/${buildId}&api-version=${API_VERSION}`;
  const resp = await adoFetch(url);
  const data = await resp.json();
  return data.value;
}

export async function getTestRunResults(
  org: string,
  project: string,
  runId: number,
  top = 1000,
) {
  const url = `${baseUrl(org, project)}/test/runs/${runId}/results?$top=${top}&api-version=${API_VERSION}`;
  const resp = await adoFetch(url);
  const data = await resp.json();
  return data.value;
}

export async function getBuild(
  org: string,
  project: string,
  buildId: number,
): Promise<BuildInfo> {
  const url = `${baseUrl(org, project)}/build/builds/${buildId}?api-version=${API_VERSION}`;
  const resp = await adoFetch(url);
  const data = await resp.json();
  return toBuildInfo(data);
}

/**
 * IFileProvider implementation backed by the Azure DevOps REST API.
 * The `repo` parameter is the repo name (or "org/project/repoName" for cross-project).
 */
export class AzureDevOpsFileProvider implements IFileProvider {
  constructor(
    private readonly org: string,
    private readonly project: string,
    private readonly defaultRepoId: string,
    private readonly defaultBranch?: string,
  ) {}

  async getFileContent(
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string> {
    const repoId = repo || this.defaultRepoId;
    const branch = ref || this.defaultBranch;
    return getFileContent(this.org, this.project, repoId, path, branch);
  }
}
