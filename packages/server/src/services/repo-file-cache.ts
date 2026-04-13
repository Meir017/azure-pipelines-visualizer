import { collapsePath } from '@apv/core';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getConfig } from '../config.js';
import {
  getFileContent,
  getVersionDescriptor,
  normalizeGitRef,
  resolveCommitSha,
} from './azure-devops.js';

export interface FetchRepoFileWithCacheOptions {
  org: string;
  project: string;
  repoId: string;
  repoName: string;
  path: string;
  ref: string;
  cacheRoot?: string;
  resolveCommitShaFn?: typeof resolveCommitSha;
  fetchFileContentFn?: typeof getFileContent;
}

export interface RepoFileCacheMetadata {
  org: string;
  project: string;
  repoId: string;
  repoName: string;
  path: string;
  requestedRef: string;
  normalizedRef: string;
  refType: 'branch' | 'tag' | 'commit';
  commitSha: string;
  fetchedAt: string;
}

export interface CachedRepoFileResult {
  content: string;
  path: string;
  repoId: string;
  repoName: string;
  requestedRef: string;
  normalizedRef: string;
  refType: 'branch' | 'tag' | 'commit';
  commitSha: string;
  cache: 'hit' | 'miss';
}

interface CacheEntryPaths {
  dir: string;
  metadataPath: string;
  contentPath: string;
}

export function getRepoFileCacheRoot(cacheRoot?: string): string {
  if (cacheRoot) {
    return resolve(cacheRoot);
  }

  const configured = getConfig().cacheDir;
  if (configured) {
    return resolve(configured);
  }

  return resolve(import.meta.dir, '..', '..', '..', '.cache', 'ado-file-cache');
}

export function buildRepoFileCacheKey(metadata: Omit<RepoFileCacheMetadata, 'fetchedAt'>): string {
  return createHash('sha256')
    .update(JSON.stringify(metadata))
    .digest('hex');
}

function getCacheEntryPaths(cacheRoot: string, cacheKey: string): CacheEntryPaths {
  const dir = resolve(cacheRoot, cacheKey.slice(0, 2), cacheKey.slice(2, 4), cacheKey);
  return {
    dir,
    metadataPath: resolve(dir, 'metadata.json'),
    contentPath: resolve(dir, 'content.txt'),
  };
}

async function readCachedEntry(paths: CacheEntryPaths): Promise<{ metadata: RepoFileCacheMetadata; content: string } | null> {
  if (!existsSync(paths.metadataPath) || !existsSync(paths.contentPath)) {
    return null;
  }

  const [metadataRaw, content] = await Promise.all([
    readFile(paths.metadataPath, 'utf-8'),
    readFile(paths.contentPath, 'utf-8'),
  ]);

  return {
    metadata: JSON.parse(metadataRaw) as RepoFileCacheMetadata,
    content,
  };
}

async function writeCachedEntry(
  paths: CacheEntryPaths,
  metadata: RepoFileCacheMetadata,
  content: string,
): Promise<void> {
  await mkdir(paths.dir, { recursive: true });
  await Promise.all([
    writeFile(paths.metadataPath, JSON.stringify(metadata, null, 2), 'utf-8'),
    writeFile(paths.contentPath, content, 'utf-8'),
  ]);
}

export async function fetchRepoFileWithCache(
  options: FetchRepoFileWithCacheOptions,
): Promise<CachedRepoFileResult> {
  const normalizedPath = collapsePath(options.path.startsWith('/') ? options.path : `/${options.path}`);
  const normalizedRef = normalizeGitRef(options.ref);
  const refType = getVersionDescriptor(normalizedRef).versionType;
  const cacheRoot = getRepoFileCacheRoot(options.cacheRoot);
  const resolveCommitShaFn = options.resolveCommitShaFn ?? resolveCommitSha;
  const fetchFileContentFn = options.fetchFileContentFn ?? getFileContent;

  const commitSha = await resolveCommitShaFn(
    options.org,
    options.project,
    options.repoId,
    normalizedRef,
  );

  const metadataBase = {
    org: options.org,
    project: options.project,
    repoId: options.repoId,
    repoName: options.repoName,
    path: normalizedPath,
    requestedRef: options.ref,
    normalizedRef,
    refType,
    commitSha,
  } satisfies Omit<RepoFileCacheMetadata, 'fetchedAt'>;

  const cacheKey = buildRepoFileCacheKey(metadataBase);
  const cachePaths = getCacheEntryPaths(cacheRoot, cacheKey);
  const cached = await readCachedEntry(cachePaths);

  if (cached) {
    return {
      content: cached.content,
      path: normalizedPath,
      repoId: options.repoId,
      repoName: options.repoName,
      requestedRef: cached.metadata.requestedRef,
      normalizedRef: cached.metadata.normalizedRef,
      refType: cached.metadata.refType,
      commitSha: cached.metadata.commitSha,
      cache: 'hit',
    };
  }

  const content = await fetchFileContentFn(
    options.org,
    options.project,
    options.repoId,
    normalizedPath,
    commitSha,
  );

  const metadata: RepoFileCacheMetadata = {
    ...metadataBase,
    fetchedAt: new Date().toISOString(),
  };
  await writeCachedEntry(cachePaths, metadata, content);

  return {
    content,
    path: normalizedPath,
    repoId: options.repoId,
    repoName: options.repoName,
    requestedRef: options.ref,
    normalizedRef,
    refType,
    commitSha,
    cache: 'miss',
  };
}