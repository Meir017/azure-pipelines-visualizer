/**
 * IFileProvider backed by the in-memory + IndexedDB ZIP cache.
 * This bridges @apv/core's template resolver with the browser-side cache.
 */
import { collapsePath, type IFileProvider } from '@apv/core';
import {
  fetchFileContent,
  getVersionDescriptor,
  normalizeGitRef,
} from './ado-client.js';
import { getFileFromCache } from './zip-cache.js';

export interface ZipFileProviderOptions {
  org: string;
  project: string;
  defaultRepoId: string;
  defaultBranch?: string;
}

/**
 * File provider that reads from the ZIP cache.
 * Falls back to individual file fetch for repos not yet cached.
 */
export class ZipFileProvider implements IFileProvider {
  private readonly org: string;
  private readonly project: string;
  private readonly defaultRepoId: string;
  private readonly defaultBranch?: string;

  constructor(options: ZipFileProviderOptions) {
    this.org = options.org;
    this.project = options.project;
    this.defaultRepoId = options.defaultRepoId;
    this.defaultBranch = options.defaultBranch;
  }

  async getFileContent(
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string> {
    const repoId = repo || this.defaultRepoId;
    const branch = ref || this.defaultBranch;

    const absPath = path.startsWith('/') ? path : `/${path}`;
    const normalizedPath = collapsePath(absPath);

    // Try ZIP cache first
    if (branch) {
      try {
        return await getFileFromCache(
          this.org,
          this.project,
          repoId,
          branch,
          normalizedPath,
        );
      } catch {
        // Fall through to individual fetch
      }
    }

    // Fallback: individual file fetch
    return fetchFileContent(
      this.org,
      this.project,
      repoId,
      normalizedPath,
      branch,
    );
  }
}
