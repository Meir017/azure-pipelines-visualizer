import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, normalize, resolve } from 'node:path';
import { getAzureDevOpsToken } from '../auth.js';
import { getConfig } from '../config.js';
import {
  getVersionDescriptor,
  normalizeGitRef,
  resolveCommitSha,
} from './azure-devops.js';

const API_VERSION = '7.1';

export interface RepoZipCacheOptions {
  org: string;
  project: string;
  repoId: string;
  ref: string;
  cacheRoot?: string;
  resolveCommitShaFn?: typeof resolveCommitSha;
  downloadZipFn?: typeof downloadRepoZip;
  extractZipFn?: (zipBuffer: Buffer, destDir: string) => Promise<void>;
}

export interface RepoZipCacheResult {
  content: string;
  cache: 'hit' | 'miss';
  commitSha: string;
}

/**
 * Download a repo as a ZIP archive from the ADO API.
 * Returns the raw ZIP buffer.
 */
export async function downloadRepoZip(
  org: string,
  project: string,
  repoId: string,
  ref: string,
): Promise<Buffer> {
  const token = await getAzureDevOpsToken();
  const descriptor = getVersionDescriptor(ref);
  const url =
    `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repoId)}/items` +
    `?scopePath=/&download=true&$format=zip` +
    `&versionDescriptor.version=${encodeURIComponent(descriptor.version)}` +
    `&versionDescriptor.versionType=${descriptor.versionType}` +
    `&api-version=${API_VERSION}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to download repo ZIP (${resp.status}): ${text}`);
  }

  return Buffer.from(await resp.arrayBuffer());
}

export function getZipCacheRoot(cacheRoot?: string): string {
  if (cacheRoot) {
    return resolve(cacheRoot);
  }
  const configured = getConfig().cacheDir;
  if (configured) {
    return resolve(configured, 'ado-zip-cache');
  }
  return resolve(homedir(), '.apv', 'cache', 'ado-zip-cache');
}

/**
 * Build the path for a cached repo extraction.
 * Layout: <cacheRoot>/<org>/<project>/<repoId>/<commitSha>/
 */
export function getRepoCachePath(
  cacheRoot: string,
  org: string,
  project: string,
  repoId: string,
  commitSha: string,
): string {
  return resolve(
    cacheRoot,
    org.toLowerCase(),
    project.toLowerCase(),
    repoId.toLowerCase(),
    commitSha.toLowerCase(),
  );
}

/**
 * Check whether a repo+commit is already cached on disk.
 */
export function isRepoCached(
  cacheRoot: string,
  org: string,
  project: string,
  repoId: string,
  commitSha: string,
): boolean {
  const dir = getRepoCachePath(cacheRoot, org, project, repoId, commitSha);
  return existsSync(join(dir, '.zip-cache-complete'));
}

/**
 * Extract a ZIP buffer into the cache directory.
 * Uses the built-in Bun / Node approach with the lightweight `fflate` approach
 * but since we want zero extra deps, we shell out to the platform unzip or
 * use the built-in decompress in Bun.
 *
 * We use a simple approach: write the zip, extract via Bun's native unzip support.
 */
async function extractZipToCache(
  zipBuffer: Buffer,
  destDir: string,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const zipPath = join(destDir, '__repo.zip');
  await writeFile(zipPath, zipBuffer);

  // Use Bun's built-in unzip or fall back to Node's built-in support
  const proc = Bun.spawn(['tar', '-xf', zipPath, '-C', destDir], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    // tar may not handle zip on all platforms — try PowerShell on Windows or unzip
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      const psProc = Bun.spawn(
        [
          'powershell',
          '-NoProfile',
          '-Command',
          `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      const psExit = await psProc.exited;
      if (psExit !== 0) {
        const stderr = await new Response(psProc.stderr).text();
        throw new Error(`Failed to extract ZIP: ${stderr}`);
      }
    } else {
      const unzipProc = Bun.spawn(['unzip', '-o', zipPath, '-d', destDir], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const unzipExit = await unzipProc.exited;
      if (unzipExit !== 0) {
        const stderr = await new Response(unzipProc.stderr).text();
        throw new Error(`Failed to extract ZIP: ${stderr}`);
      }
    }
  }

  // Write marker file
  await writeFile(join(destDir, '.zip-cache-complete'), '', 'utf-8');
}

/**
 * Find the actual root inside the extracted zip.
 * ADO zips often have a single top-level directory; we need to detect that.
 */
async function findExtractedRoot(destDir: string): Promise<string> {
  const entries = await readdir(destDir, { withFileTypes: true });
  const dirs = entries.filter(
    (e) => e.isDirectory() && e.name !== '__MACOSX' && !e.name.startsWith('.'),
  );
  const files = entries.filter(
    (e) =>
      e.isFile() && e.name !== '__repo.zip' && e.name !== '.zip-cache-complete',
  );

  // If there's exactly one directory and no other files, that's the root
  if (dirs.length === 1 && files.length === 0) {
    return join(destDir, dirs[0].name);
  }

  return destDir;
}

/**
 * Read the persisted extracted root from cache. Falls back to findExtractedRoot
 * if the marker doesn't exist (e.g. for caches seeded by tests).
 */
async function readCachedRoot(destDir: string): Promise<string> {
  const markerPath = join(destDir, '.zip-cache-root');
  if (existsSync(markerPath)) {
    const root = (await readFile(markerPath, 'utf-8')).trim();
    if (root && existsSync(root)) {
      return root;
    }
  }
  return findExtractedRoot(destDir);
}

// In-flight deduplication for concurrent ensureRepoCached calls.
// Keyed by org/project/repoId/ref (lowercased) so multiple requests
// for the same repo share a single ZIP download.
const inflightRepoCaches = new Map<
  string,
  Promise<{ repoDir: string; commitSha: string; cache: 'hit' | 'miss' }>
>();

/**
 * Ensure a repo is downloaded and cached. Returns the local extraction path.
 * Concurrent calls for the same repo+ref share a single download.
 */
export async function ensureRepoCached(
  options: RepoZipCacheOptions,
): Promise<{ repoDir: string; commitSha: string; cache: 'hit' | 'miss' }> {
  const normalizedRef = normalizeGitRef(options.ref);
  const dedupeKey =
    `${options.org}/${options.project}/${options.repoId}/${normalizedRef}`.toLowerCase();

  const existing = inflightRepoCaches.get(dedupeKey);
  if (existing) return existing;

  const promise = ensureRepoCachedImpl(options).then(
    (result) => {
      inflightRepoCaches.delete(dedupeKey);
      return result;
    },
    (err) => {
      inflightRepoCaches.delete(dedupeKey);
      throw err;
    },
  );

  inflightRepoCaches.set(dedupeKey, promise);
  return promise;
}

async function ensureRepoCachedImpl(
  options: RepoZipCacheOptions,
): Promise<{ repoDir: string; commitSha: string; cache: 'hit' | 'miss' }> {
  const cacheRoot = getZipCacheRoot(options.cacheRoot);
  const normalizedRef = normalizeGitRef(options.ref);
  const resolveCommitShaFn = options.resolveCommitShaFn ?? resolveCommitSha;
  const downloadZipFn = options.downloadZipFn ?? downloadRepoZip;

  const commitSha = await resolveCommitShaFn(
    options.org,
    options.project,
    options.repoId,
    normalizedRef,
  );

  const destDir = getRepoCachePath(
    cacheRoot,
    options.org,
    options.project,
    options.repoId,
    commitSha,
  );

  if (
    isRepoCached(
      cacheRoot,
      options.org,
      options.project,
      options.repoId,
      commitSha,
    )
  ) {
    const repoDir = await readCachedRoot(destDir);
    return { repoDir, commitSha, cache: 'hit' };
  }

  const zipBuffer = await downloadZipFn(
    options.org,
    options.project,
    options.repoId,
    normalizedRef,
  );

  const extractFn = options.extractZipFn ?? extractZipToCache;
  await extractFn(zipBuffer, destDir);
  const repoDir = await findExtractedRoot(destDir);

  // Persist the discovered root so cache hits don't need the heuristic
  await writeFile(join(destDir, '.zip-cache-root'), repoDir, 'utf-8');

  return { repoDir, commitSha, cache: 'miss' };
}

/**
 * Fetch a file from a cached repo zip. Downloads the repo zip first if needed.
 */
export async function fetchFileFromZipCache(
  options: RepoZipCacheOptions & { path: string },
): Promise<RepoZipCacheResult> {
  const { repoDir, commitSha, cache } = await ensureRepoCached(options);

  const cleanPath = options.path.replace(/\\/g, '/').replace(/^\/+/, '');
  const fullPath = normalize(join(repoDir, cleanPath));

  // Security: ensure the resolved path is under the repo dir
  const normalizedRepoDir = normalize(repoDir);
  if (!fullPath.startsWith(normalizedRepoDir)) {
    throw new Error(`Path traversal attempt: ${options.path}`);
  }

  if (!existsSync(fullPath)) {
    throw new Error(`File not found in cached repo: ${cleanPath}`);
  }

  const content = await readFile(fullPath, 'utf-8');
  return { content, cache, commitSha };
}
