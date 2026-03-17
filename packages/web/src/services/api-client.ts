const API_BASE = '/api';

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

export interface RepositoryInfo {
  id: string;
  name: string;
  defaultBranch: string;
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

export function fetchPipelines(org: string, project: string): Promise<PipelineInfo[]> {
  return apiFetch(`/${org}/${project}/pipelines`);
}

export function fetchPipelineYaml(
  org: string,
  project: string,
  pipelineId: number,
): Promise<PipelineYamlResponse> {
  return apiFetch(`/${org}/${project}/pipelines/${pipelineId}/yaml`);
}

export function fetchRepositories(org: string, project: string): Promise<RepositoryInfo[]> {
  return apiFetch(`/${org}/${project}/repos`);
}

export function fetchFileContent(
  org: string,
  project: string,
  repoId: string,
  path: string,
  branch?: string,
): Promise<FileContentResponse> {
  const params = new URLSearchParams({ path });
  if (branch) params.set('branch', branch);
  return apiFetch(`/${org}/${project}/repos/${repoId}/file?${params}`);
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
  const params = new URLSearchParams({ repo: repoName, path });
  if (branch) params.set('branch', branch);
  return apiFetch(`/${org}/${project}/file-by-repo-name?${params}`);
}

export interface TaskDocsConfig {
  customTaskDocs: Record<string, string>;
}

export function fetchTaskDocsConfig(): Promise<TaskDocsConfig> {
  return apiFetch('/config/task-docs');
}
