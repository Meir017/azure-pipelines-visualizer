import type { IFileProvider } from '@apv/core';
import { collapsePath } from '@apv/core';
import { getAzureDevOpsToken } from '../auth.js';
import { MemoryTTLCache } from './memory-cache.js';

const API_VERSION = '7.1';

// In-memory caches to avoid redundant ADO API round-trips.
// Repo metadata rarely changes — cache for 10 minutes.
const repoCache = new MemoryTTLCache<RepositoryInfo>(600);
// Branch→commit resolution — cache for 2 minutes (balances freshness vs speed).
const commitShaCache = new MemoryTTLCache<string>(120);

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
    const data = await resp.json() as { value?: Array<{ name?: string; objectId?: string }> };
    const match = data.value?.find((item) => item.name === normalizedRef);

    if (!match?.objectId) {
      throw new Error(`Git ref not found: ${normalizedRef}`);
    }

    return match.objectId;
  });
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
