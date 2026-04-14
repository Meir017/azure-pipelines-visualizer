/**
 * In-memory + IndexedDB ZIP cache for browser-side repo caching.
 *
 * Flow:
 * 1. Resolve branch→commit SHA (with short TTL memory cache)
 * 2. Check in-memory cache for extracted files
 * 3. Check IndexedDB for persisted ZIP data
 * 4. Download ZIP, decompress with fflate, cache everywhere
 */
import { unzipSync } from 'fflate';
import {
  downloadRepoZip,
  normalizeGitRef,
  resolveCommitSha,
} from './ado-client.js';

/** Map of file path → text content extracted from a repo ZIP. */
export type ExtractedFiles = Map<string, string>;

interface CacheEntry {
  files: ExtractedFiles;
  timestamp: number;
}

interface CommitShaCacheEntry {
  sha: string;
  expiresAt: number;
}

// Branch→commit SHA resolution cache (2 min TTL)
const commitShaCache = new Map<string, CommitShaCacheEntry>();
const COMMIT_SHA_TTL_MS = 2 * 60 * 1000;

// In-memory cache: org/project/repo/commitSha → extracted files
const memoryCache = new Map<string, CacheEntry>();

// In-flight deduplication
const inflightDownloads = new Map<string, Promise<ExtractedFiles>>();

// IndexedDB database name and store
const DB_NAME = 'apv-embed-cache';
const STORE_NAME = 'repo-zips';
const DB_VERSION = 1;

/** Max age for IndexedDB entries (7 days). */
const IDB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(
  org: string,
  project: string,
  repoId: string,
  commitSha: string,
): string {
  return `${org}/${project}/${repoId}/${commitSha}`.toLowerCase();
}

function commitShaCacheKey(
  org: string,
  project: string,
  repoId: string,
  ref: string,
): string {
  return `${org}/${project}/${repoId}/${ref}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function idbGet(
  key: string,
): Promise<{ files: [string, string][]; timestamp: number } | undefined> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbPut(
  key: string,
  files: ExtractedFiles,
  timestamp: number,
): Promise<void> {
  try {
    const db = await openDB();
    const serialized = {
      files: Array.from(files.entries()),
      timestamp,
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(serialized, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silently fail — memory cache still works
  }
}

/** Remove expired entries from IndexedDB. */
async function idbCleanup(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const entry = cursor.value as { timestamp: number } | undefined;
      if (entry && Date.now() - entry.timestamp > IDB_MAX_AGE_MS) {
        cursor.delete();
      }
      cursor.continue();
    };
  } catch {
    // Ignore cleanup errors
  }
}

// Run cleanup on first load
if (typeof indexedDB !== 'undefined') {
  setTimeout(() => idbCleanup(), 5000);
}

// ---------------------------------------------------------------------------
// Commit SHA resolution with caching
// ---------------------------------------------------------------------------

async function resolveCommitShaCached(
  org: string,
  project: string,
  repoId: string,
  ref: string,
): Promise<string> {
  const normalized = normalizeGitRef(ref);
  const key = commitShaCacheKey(org, project, repoId, normalized);

  const cached = commitShaCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.sha;
  }

  const sha = await resolveCommitSha(org, project, repoId, normalized);
  commitShaCache.set(key, {
    sha,
    expiresAt: Date.now() + COMMIT_SHA_TTL_MS,
  });
  return sha;
}

// ---------------------------------------------------------------------------
// ZIP extraction
// ---------------------------------------------------------------------------

/** Extract a ZIP ArrayBuffer into a Map of path→text content. */
export function extractZip(zipBuffer: ArrayBuffer): ExtractedFiles {
  const files: ExtractedFiles = new Map();
  const decompressed = unzipSync(new Uint8Array(zipBuffer));
  const decoder = new TextDecoder();

  for (const [path, data] of Object.entries(decompressed)) {
    // Skip directories (they end with /)
    if (path.endsWith('/')) continue;

    // ADO zips often have a single top-level directory — strip it
    const normalized = stripTopLevelDir(path);
    const content = decoder.decode(data);
    files.set(normalized, content);
  }

  return files;
}

/**
 * Strip the single top-level directory from a zip path if all files share one.
 * e.g. "reponame-abc123/src/file.yml" → "/src/file.yml"
 */
function stripTopLevelDir(path: string): string {
  const firstSlash = path.indexOf('/');
  if (firstSlash === -1) return `/${path}`;
  return `/${path.slice(firstSlash + 1)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Ensure a repo is downloaded and cached. Returns the extracted files map. */
export async function ensureRepoCached(
  org: string,
  project: string,
  repoId: string,
  ref: string,
): Promise<{ files: ExtractedFiles; commitSha: string }> {
  const commitSha = await resolveCommitShaCached(org, project, repoId, ref);
  const key = cacheKey(org, project, repoId, commitSha);

  // 1. Check memory cache
  const memCached = memoryCache.get(key);
  if (memCached) {
    return { files: memCached.files, commitSha };
  }

  // 2. Check in-flight downloads
  const inflight = inflightDownloads.get(key);
  if (inflight) {
    const files = await inflight;
    return { files, commitSha };
  }

  // 3. Check IndexedDB
  const idbEntry = await idbGet(key);
  if (idbEntry && Date.now() - idbEntry.timestamp < IDB_MAX_AGE_MS) {
    const files = new Map(idbEntry.files);
    memoryCache.set(key, { files, timestamp: idbEntry.timestamp });
    return { files, commitSha };
  }

  // 4. Download and extract
  const promise = (async () => {
    const zipBuffer = await downloadRepoZip(org, project, repoId, ref);
    const files = extractZip(zipBuffer);
    const now = Date.now();

    memoryCache.set(key, { files, timestamp: now });
    inflightDownloads.delete(key);

    // Persist to IndexedDB in background
    idbPut(key, files, now);

    return files;
  })();

  inflightDownloads.set(key, promise);

  try {
    const files = await promise;
    return { files, commitSha };
  } catch (err) {
    inflightDownloads.delete(key);
    throw err;
  }
}

/** Get a file from a cached (or freshly downloaded) repo ZIP. */
export async function getFileFromCache(
  org: string,
  project: string,
  repoId: string,
  ref: string,
  filePath: string,
): Promise<string> {
  const { files } = await ensureRepoCached(org, project, repoId, ref);

  // Normalize path: convert backslashes, ensure leading slash
  let normalized = filePath.replace(/\\/g, '/');
  normalized = normalized.startsWith('/') ? normalized : `/${normalized}`;

  const content = files.get(normalized);
  if (content !== undefined) return content;

  // Try case-insensitive match
  const lowerNormalized = normalized.toLowerCase();
  for (const [key, value] of files) {
    if (key.toLowerCase() === lowerNormalized) return value;
  }

  throw new Error(`File not found in cached repo: ${filePath}`);
}

/** Clear all caches (memory + IndexedDB). */
export async function clearCache(): Promise<void> {
  memoryCache.clear();
  commitShaCache.clear();
  inflightDownloads.clear();

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch {
    // Ignore
  }
}
