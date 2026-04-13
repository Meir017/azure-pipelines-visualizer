/**
 * Direct Azure DevOps REST API client.
 * Used when the web app runs inside a Chrome extension page (no server needed).
 * Auth comes from the browser's existing ADO session cookies.
 */
import { collapsePath } from '@apv/core';
import type {
  FileByRepoNameResponse,
  PipelineInfo,
  PipelineYamlResponse,
  TaskDocsConfig,
  TaskSchemaResponse,
} from './api-client.js';

const API_VERSION = '7.1';

function baseUrl(org: string, project: string): string {
  return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis`;
}

function getVersionDescriptor(ref: string): {
  version: string;
  versionType: string;
} {
  if (ref.startsWith('refs/heads/')) {
    return { version: ref.slice('refs/heads/'.length), versionType: 'branch' };
  }
  if (ref.startsWith('refs/tags/')) {
    return { version: ref.slice('refs/tags/'.length), versionType: 'tag' };
  }
  if (/^[0-9a-f]{40}$/i.test(ref)) {
    return { version: ref, versionType: 'commit' };
  }
  return { version: ref, versionType: 'branch' };
}

async function adoFetch(url: string): Promise<Response> {
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ADO API error (${resp.status}): ${text}`);
  }
  return resp;
}

async function fetchFileContent(
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

// --- Exported API (same signatures as api-client.ts) ---

export async function fetchPipelines(
  org: string,
  project: string,
): Promise<PipelineInfo[]> {
  const url = `${baseUrl(org, project)}/pipelines?api-version=${API_VERSION}`;
  const resp = await adoFetch(url);
  const data = await resp.json();
  return data.value;
}

export async function fetchPipelineYaml(
  org: string,
  project: string,
  pipelineId: number,
): Promise<PipelineYamlResponse> {
  const defUrl = `${baseUrl(org, project)}/build/definitions/${pipelineId}?api-version=${API_VERSION}`;
  const defResp = await adoFetch(defUrl);
  const data = await defResp.json();

  const definition = {
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

  const yaml = await fetchFileContent(
    org,
    project,
    definition.repository.id,
    definition.path,
    definition.repository.defaultBranch,
  );

  return { definition, yaml };
}

export async function fetchFileByRepoName(
  org: string,
  project: string,
  repoName: string,
  path: string,
  branch?: string,
): Promise<FileByRepoNameResponse> {
  const content = await fetchFileContent(org, project, repoName, path, branch);
  return { content, path, repoId: repoName, repoName, branch: branch || '' };
}

export async function fetchTaskDocsConfig(): Promise<TaskDocsConfig> {
  // No server config available in extension mode
  return { customTaskDocs: {} };
}

export async function fetchTaskSchema(
  _org: string,
): Promise<TaskSchemaResponse> {
  // Task schema not available without the server
  return { tasks: [], cached: false };
}
