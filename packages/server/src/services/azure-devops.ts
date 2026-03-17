import type { IFileProvider } from '@apv/core';
import { getAzureDevOpsToken } from '../auth.js';

const API_VERSION = '7.1';

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

async function adoFetch(url: string): Promise<Response> {
  const token = await getAzureDevOpsToken();
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Azure DevOps API error (${response.status}): ${text}`);
  }
  return response;
}

function baseUrl(org: string, project: string): string {
  return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis`;
}

export async function listPipelines(org: string, project: string): Promise<PipelineInfo[]> {
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

export async function getFileContent(
  org: string,
  project: string,
  repoId: string,
  path: string,
  branch?: string,
): Promise<string> {
  let url = `${baseUrl(org, project)}/git/repositories/${encodeURIComponent(repoId)}/items?scopePath=${encodeURIComponent(path)}&api-version=${API_VERSION}&$format=text`;
  if (branch) {
    const cleanBranch = branch.replace(/^refs\/heads\//, '');
    url += `&versionDescriptor.version=${encodeURIComponent(cleanBranch)}&versionDescriptor.versionType=branch`;
  }
  const resp = await adoFetch(url);
  return resp.text();
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

  async getFileContent(repo: string, path: string, ref?: string): Promise<string> {
    const repoId = repo || this.defaultRepoId;
    const branch = ref || this.defaultBranch;
    return getFileContent(this.org, this.project, repoId, path, branch);
  }
}
