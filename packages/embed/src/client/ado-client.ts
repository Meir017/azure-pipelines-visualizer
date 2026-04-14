/**
 * Browser-based Azure DevOps REST API client.
 * Uses `credentials: 'include'` for cookie-based auth
 * (works in Chrome extensions with ADO session cookies).
 */
import { collapsePath } from '@apv/core';

const API_VERSION = '7.1';

function baseUrl(org: string, project: string): string {
  return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis`;
}

interface VersionDescriptor {
  version: string;
  versionType: string;
}

const COMMIT_SHA_RE = /^[0-9a-f]{7,40}$/i;

export function normalizeGitRef(ref: string): string {
  if (ref.startsWith('refs/')) return ref;
  if (COMMIT_SHA_RE.test(ref)) return ref;
  return `refs/heads/${ref}`;
}

export function getVersionDescriptor(ref: string): VersionDescriptor {
  const normalized = normalizeGitRef(ref);
  if (normalized.startsWith('refs/heads/')) {
    return {
      version: normalized.slice('refs/heads/'.length),
      versionType: 'branch',
    };
  }
  if (normalized.startsWith('refs/tags/')) {
    return {
      version: normalized.slice('refs/tags/'.length),
      versionType: 'tag',
    };
  }
  return { version: normalized, versionType: 'commit' };
}

async function adoFetch(url: string): Promise<Response> {
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ADO API error (${resp.status}): ${text}`);
  }
  return resp;
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

export interface PipelineInfo {
  id: number;
  name: string;
  folder: string;
}

export async function fetchPipelines(
  org: string,
  project: string,
): Promise<PipelineInfo[]> {
  const url = `${baseUrl(org, project)}/pipelines?api-version=${API_VERSION}`;
  const resp = await adoFetch(url);
  const data = await resp.json();
  return data.value;
}

export async function fetchPipelineDefinition(
  org: string,
  project: string,
  pipelineId: number,
): Promise<PipelineDefinition> {
  const url = `${baseUrl(org, project)}/build/definitions/${pipelineId}?api-version=${API_VERSION}`;
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

/** Download a repo as a ZIP archive. Returns raw ArrayBuffer. */
export async function downloadRepoZip(
  org: string,
  project: string,
  repoId: string,
  ref: string,
): Promise<ArrayBuffer> {
  const descriptor = getVersionDescriptor(ref);
  const url =
    `${baseUrl(org, project)}/git/repositories/${encodeURIComponent(repoId)}/items` +
    `?scopePath=/&download=true&$format=zip` +
    `&versionDescriptor.version=${encodeURIComponent(descriptor.version)}` +
    `&versionDescriptor.versionType=${descriptor.versionType}` +
    `&api-version=${API_VERSION}`;

  const resp = await adoFetch(url);
  return resp.arrayBuffer();
}

/** Resolve a git ref to its commit SHA. */
export async function resolveCommitSha(
  org: string,
  project: string,
  repoId: string,
  ref: string,
): Promise<string> {
  const normalized = normalizeGitRef(ref);
  const descriptor = getVersionDescriptor(normalized);

  if (descriptor.versionType === 'commit') {
    return descriptor.version;
  }

  const filter = normalized.replace(/^refs\//, '');
  const url = `${baseUrl(org, project)}/git/repositories/${encodeURIComponent(repoId)}/refs?filter=${encodeURIComponent(filter)}&api-version=${API_VERSION}`;
  const resp = await adoFetch(url);
  const data = (await resp.json()) as {
    value?: Array<{ name?: string; objectId?: string }>;
  };
  const match = data.value?.find((item) => item.name === normalized);

  if (!match?.objectId) {
    throw new Error(`Git ref not found: ${normalized}`);
  }
  return match.objectId;
}

/** Fetch a single file's content from ADO (used as fallback when zip isn't available). */
export async function fetchFileContent(
  org: string,
  project: string,
  repoNameOrId: string,
  path: string,
  branch?: string,
): Promise<string> {
  const absPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedPath = collapsePath(absPath);
  let url = `${baseUrl(org, project)}/git/repositories/${encodeURIComponent(repoNameOrId)}/items?path=${encodeURIComponent(normalizedPath)}&api-version=${API_VERSION}&includeContent=true&$format=text`;
  if (branch) {
    const desc = getVersionDescriptor(branch);
    url += `&versionDescriptor.version=${encodeURIComponent(desc.version)}&versionDescriptor.versionType=${desc.versionType}`;
  }
  const resp = await adoFetch(url);
  return resp.text();
}
