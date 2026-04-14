import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ensureRepoCached,
  fetchFileFromZipCache,
  getRepoCachePath,
  getZipCacheRoot,
  isRepoCached,
} from './repo-zip-cache.js';

const cacheRoot = resolve(import.meta.dir, '__zip-cache-test__');

afterEach(() => {
  rmSync(cacheRoot, { recursive: true, force: true });
});

describe('getRepoCachePath', () => {
  test('builds a path from org/project/repoId/commitSha', () => {
    const result = getRepoCachePath(
      '/cache',
      'Microsoft',
      'WDATP',
      'repo-123',
      'DEADBEEF',
    );
    expect(result).toContain('microsoft');
    expect(result).toContain('wdatp');
    expect(result).toContain('repo-123');
    expect(result).toContain('deadbeef');
  });

  test('lowercases all segments for case-insensitive dedup', () => {
    const a = getRepoCachePath('/cache', 'Org', 'Proj', 'Repo', 'ABC');
    const b = getRepoCachePath('/cache', 'org', 'proj', 'repo', 'abc');
    expect(a).toBe(b);
  });
});

describe('isRepoCached', () => {
  test('returns false when no cache exists', () => {
    expect(isRepoCached(cacheRoot, 'org', 'proj', 'repo', 'abc123')).toBe(
      false,
    );
  });

  test('returns true when marker file exists', () => {
    const dir = getRepoCachePath(cacheRoot, 'org', 'proj', 'repo', 'abc123');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.zip-cache-complete'), '', 'utf-8');
    expect(isRepoCached(cacheRoot, 'org', 'proj', 'repo', 'abc123')).toBe(
      true,
    );
  });
});

describe('getZipCacheRoot', () => {
  test('uses provided cacheRoot when given', () => {
    const result = getZipCacheRoot('/my/cache');
    expect(result).toContain('my');
    expect(result).toContain('cache');
  });
});

/**
 * Helper: pre-populate the cache directory with extracted files so we can
 * test fetchFileFromZipCache without requiring real ZIP extraction.
 */
function seedCachedRepo(
  org: string,
  project: string,
  repoId: string,
  commitSha: string,
  files: Record<string, string>,
): void {
  const dir = getRepoCachePath(cacheRoot, org, project, repoId, commitSha);
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(dir, filePath);
    mkdirSync(resolve(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }
  // Write markers
  writeFileSync(join(dir, '.zip-cache-complete'), '', 'utf-8');
  // Persist extractedRoot so cache hits don't rely on readdir heuristic
  writeFileSync(join(dir, '.zip-cache-root'), dir, 'utf-8');
}

describe('fetchFileFromZipCache', () => {
  test('returns file content from a pre-cached repo (cache hit)', async () => {
    seedCachedRepo('microsoft', 'WDATP', 'repo-1', 'deadbeef', {
      '.pipelines/onebranch.official.pkg.yml': 'trigger: none\nsteps: []',
      'src/main.ts': 'console.log("hello")',
    });

    const result = await fetchFileFromZipCache({
      org: 'microsoft',
      project: 'WDATP',
      repoId: 'repo-1',
      ref: 'refs/heads/main',
      path: '/.pipelines/onebranch.official.pkg.yml',
      cacheRoot,
      resolveCommitShaFn: async () => 'deadbeef',
    });

    expect(result.content).toBe('trigger: none\nsteps: []');
    expect(result.cache).toBe('hit');
    expect(result.commitSha).toBe('deadbeef');
  });

  test('returns files from different paths in the same cached repo', async () => {
    seedCachedRepo('microsoft', 'WDATP', 'repo-1', 'deadbeef', {
      'file-a.yml': 'content-a',
      'dir/file-b.yml': 'content-b',
    });

    const a = await fetchFileFromZipCache({
      org: 'microsoft',
      project: 'WDATP',
      repoId: 'repo-1',
      ref: 'main',
      path: '/file-a.yml',
      cacheRoot,
      resolveCommitShaFn: async () => 'deadbeef',
    });

    const b = await fetchFileFromZipCache({
      org: 'microsoft',
      project: 'WDATP',
      repoId: 'repo-1',
      ref: 'main',
      path: '/dir/file-b.yml',
      cacheRoot,
      resolveCommitShaFn: async () => 'deadbeef',
    });

    expect(a.content).toBe('content-a');
    expect(b.content).toBe('content-b');
  });

  test('throws on path traversal attempt', async () => {
    seedCachedRepo('microsoft', 'WDATP', 'repo-1', 'deadbeef', {
      'file.yml': 'content',
    });

    await expect(
      fetchFileFromZipCache({
        org: 'microsoft',
        project: 'WDATP',
        repoId: 'repo-1',
        ref: 'main',
        path: '/../../../etc/passwd',
        cacheRoot,
        resolveCommitShaFn: async () => 'deadbeef',
      }),
    ).rejects.toThrow('Path traversal attempt');
  });

  test('throws when file does not exist in cached repo', async () => {
    seedCachedRepo('microsoft', 'WDATP', 'repo-1', 'deadbeef', {
      'file.yml': 'content',
    });

    await expect(
      fetchFileFromZipCache({
        org: 'microsoft',
        project: 'WDATP',
        repoId: 'repo-1',
        ref: 'main',
        path: '/nonexistent.yml',
        cacheRoot,
        resolveCommitShaFn: async () => 'deadbeef',
      }),
    ).rejects.toThrow('File not found in cached repo');
  });
});

describe('ensureRepoCached', () => {
  test('downloads and extracts zip on cache miss', async () => {
    let downloadCalls = 0;

    // Create a fake zip that will be "extracted" - we simulate the extraction
    // by a mock that seeds the cache directory instead
    const result = await ensureRepoCached({
      org: 'microsoft',
      project: 'WDATP',
      repoId: 'repo-1',
      ref: 'refs/heads/main',
      cacheRoot,
      resolveCommitShaFn: async () => 'deadbeef',
      downloadZipFn: async () => {
        downloadCalls += 1;
        // Create a minimal valid ZIP (empty archive)
        // PK\x05\x06 followed by 18 zero bytes = empty zip directory
        const emptyZip = Buffer.alloc(22);
        emptyZip[0] = 0x50; // P
        emptyZip[1] = 0x4b; // K
        emptyZip[2] = 0x05;
        emptyZip[3] = 0x06;
        return emptyZip;
      },
    });

    expect(downloadCalls).toBe(1);
    expect(result.commitSha).toBe('deadbeef');
    expect(result.cache).toBe('miss');
  });

  test('returns hit when repo is already cached', async () => {
    let downloadCalls = 0;

    seedCachedRepo('microsoft', 'WDATP', 'repo-1', 'deadbeef', {
      'file.yml': 'content',
    });

    const result = await ensureRepoCached({
      org: 'microsoft',
      project: 'WDATP',
      repoId: 'repo-1',
      ref: 'refs/heads/main',
      cacheRoot,
      resolveCommitShaFn: async () => 'deadbeef',
      downloadZipFn: async () => {
        downloadCalls += 1;
        return Buffer.alloc(0);
      },
    });

    expect(downloadCalls).toBe(0);
    expect(result.cache).toBe('hit');
    expect(result.commitSha).toBe('deadbeef');
  });

  test('downloads again when commit SHA changes', async () => {
    let downloadCalls = 0;

    // Pre-cache with old commit
    seedCachedRepo('microsoft', 'WDATP', 'repo-1', 'oldcommit', {
      'file.yml': 'old content',
    });

    const result = await ensureRepoCached({
      org: 'microsoft',
      project: 'WDATP',
      repoId: 'repo-1',
      ref: 'refs/heads/main',
      cacheRoot,
      resolveCommitShaFn: async () => 'newcommit',
      downloadZipFn: async () => {
        downloadCalls += 1;
        // Empty valid zip
        const emptyZip = Buffer.alloc(22);
        emptyZip[0] = 0x50;
        emptyZip[1] = 0x4b;
        emptyZip[2] = 0x05;
        emptyZip[3] = 0x06;
        return emptyZip;
      },
    });

    expect(downloadCalls).toBe(1);
    expect(result.cache).toBe('miss');
    expect(result.commitSha).toBe('newcommit');
  });
});
