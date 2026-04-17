import * as directAdo from './direct-ado-client.js';

const API_BASE = '/api';

/** True when running inside a Chrome extension page (no server available). */
const isExtensionPage =
  typeof window !== 'undefined' &&
  window.location?.protocol === 'chrome-extension:';

export interface PipelineInfo {
  id: number;
  name: string;
  folder: string;
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

export interface PipelineYamlResponse {
  definition: PipelineDefinition;
  yaml: string;
}

export interface FileContentResponse {
  content: string;
  path: string;
  repoId: string;
  branch?: string;
}

async function apiFetch<T>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API error (${resp.status}): ${body}`);
  }
  return resp.json();
}

export function fetchPipelines(
  org: string,
  project: string,
): Promise<PipelineInfo[]> {
  if (isExtensionPage) return directAdo.fetchPipelines(org, project);
  return apiFetch(`/${org}/${project}/pipelines`);
}

export function fetchPipelineYaml(
  org: string,
  project: string,
  pipelineId: number,
): Promise<PipelineYamlResponse> {
  if (isExtensionPage)
    return directAdo.fetchPipelineYaml(org, project, pipelineId);
  return apiFetch(`/${org}/${project}/pipelines/${pipelineId}/yaml`);
}

export interface FileByRepoNameResponse extends FileContentResponse {
  repoName: string;
}

export function fetchFileByRepoName(
  org: string,
  project: string,
  repoName: string,
  path: string,
  branch?: string,
): Promise<FileByRepoNameResponse> {
  if (isExtensionPage)
    return directAdo.fetchFileByRepoName(org, project, repoName, path, branch);
  const params = new URLSearchParams({ repo: repoName, path });
  if (branch) params.set('branch', branch);
  return apiFetch(`/${org}/${project}/file-by-repo-name?${params}`);
}

export interface TaskDocsConfig {
  customTaskDocs: Record<string, string>;
}

export function fetchTaskDocsConfig(): Promise<TaskDocsConfig> {
  if (isExtensionPage) return directAdo.fetchTaskDocsConfig();
  return apiFetch('/config/task-docs');
}

export interface TaskSchemaEntry {
  name: string;
  description: string;
  version: number;
  inputs: { name: string; description: string; required: boolean }[];
}

export interface TaskSchemaResponse {
  tasks: TaskSchemaEntry[];
  cached: boolean;
}

export type { BuildDefinitionRef, BuildInfo } from './build-types.js';

export function fetchTaskSchema(org: string): Promise<TaskSchemaResponse> {
  if (isExtensionPage) return directAdo.fetchTaskSchema(org);
  return apiFetch(`/${org}/schema/tasks`);
}

export function fetchBuildsForCommit(
  org: string,
  project: string,
  repoName: string,
  commitSha: string,
): Promise<BuildInfo[]> {
  if (isExtensionPage)
    return directAdo.fetchBuildsForCommit(org, project, repoName, commitSha);
  const params = new URLSearchParams({ repoName, commitSha });
  return apiFetch(`/${org}/${project}/builds?${params}`);
}

export function fetchCommitFlowGraph(
  org: string,
  project: string,
  repoName: string,
  commitSha: string,
): Promise<BuildInfo[]> {
  if (isExtensionPage)
    return directAdo.fetchBuildsForCommit(org, project, repoName, commitSha);
  const params = new URLSearchParams({ repoName, commitSha });
  return apiFetch(`/${org}/${project}/commit-flow?${params}`);
}

/**
 * Stream commit flow graph via SSE — calls onBatch with each new batch of builds.
 * Returns an AbortController to cancel the stream.
 */
export function streamCommitFlowGraph(
  org: string,
  project: string,
  repoName: string,
  commitSha: string,
  onBatch: (builds: BuildInfo[]) => void,
  onDone: () => void,
  onError: (err: string) => void,
): AbortController {
  const controller = new AbortController();

  if (isExtensionPage) {
    // Extension mode: fall back to single fetch
    directAdo
      .fetchBuildsForCommit(org, project, repoName, commitSha)
      .then((builds) => {
        onBatch(builds);
        onDone();
      })
      .catch((err) =>
        onError(err instanceof Error ? err.message : String(err)),
      );
    return controller;
  }

  const params = new URLSearchParams({ repoName, commitSha });
  const url = `${API_BASE}/${org}/${project}/commit-flow/stream?${params}`;
  const eventSource = new EventSource(url);

  controller.signal.addEventListener('abort', () => eventSource.close());

  eventSource.addEventListener('builds', (e) => {
    try {
      const builds: BuildInfo[] = JSON.parse(e.data);
      onBatch(builds);
    } catch {
      // ignore parse errors
    }
  });

  eventSource.addEventListener('done', () => {
    eventSource.close();
    onDone();
  });

  eventSource.addEventListener('error', (e) => {
    eventSource.close();
    const msg =
      e instanceof MessageEvent && e.data
        ? JSON.parse(e.data).error
        : 'Connection lost';
    onError(msg);
  });

  return controller;
}

export function fetchBuild(
  org: string,
  project: string,
  buildId: number,
): Promise<BuildInfo> {
  if (isExtensionPage) return directAdo.fetchBuild(org, project, buildId);
  return apiFetch(`/${org}/${project}/builds/${buildId}`);
}

export interface BuildArtifact {
  id: number;
  name: string;
  resource: {
    type: string;
    data: string;
    url: string;
    downloadUrl: string;
  };
}

export function fetchBuildArtifacts(
  org: string,
  project: string,
  buildId: number,
): Promise<BuildArtifact[]> {
  return apiFetch(`/${org}/${project}/builds/${buildId}/artifacts`);
}
