import { afterEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildRepoFileCacheKey,
  fetchRepoFileWithCache,
} from './repo-file-cache.js';

const cacheRoot = resolve(import.meta.dir, '__cache__');

afterEach(() => {
  rmSync(cacheRoot, { recursive: true, force: true });
});

describe('buildRepoFileCacheKey', () => {
  test('changes when requested ref changes', () => {
    const base = {
      org: 'microsoft',
      project: 'WDATP',
      repoId: '123',
      repoName: 'Repo',
      path: '/pipelines/main.yml',
      normalizedRef: 'refs/heads/main',
      refType: 'branch' as const,
      commitSha: 'aaaaaaaa',
    };

    const mainKey = buildRepoFileCacheKey({
      ...base,
      requestedRef: 'refs/heads/main',
    });
    const releaseKey = buildRepoFileCacheKey({
      ...base,
      requestedRef: 'refs/heads/release',
    });

    expect(mainKey).not.toBe(releaseKey);
  });

  test('changes when commit SHA changes', () => {
    const base = {
      org: 'microsoft',
      project: 'WDATP',
      repoId: '123',
      repoName: 'Repo',
      path: '/pipelines/main.yml',
      requestedRef: 'refs/heads/main',
      normalizedRef: 'refs/heads/main',
      refType: 'branch' as const,
    };

    const firstKey = buildRepoFileCacheKey({
      ...base,
      commitSha: 'aaaaaaaa',
    });
    const secondKey = buildRepoFileCacheKey({
      ...base,
      commitSha: 'bbbbbbbb',
    });

    expect(firstKey).not.toBe(secondKey);
  });
});

describe('fetchRepoFileWithCache', () => {
  test('writes a cache entry and reuses it for the same ref and commit SHA', async () => {
    let fetchCalls = 0;
    let resolveCalls = 0;

    const first = await fetchRepoFileWithCache({
      org: 'microsoft',
      project: 'WDATP',
      repoId: '123',
      repoName: 'Repo',
      path: '/pipelines/main.yml',
      ref: 'refs/heads/main',
      cacheRoot,
      resolveCommitShaFn: async () => {
        resolveCalls += 1;
        return 'deadbeef';
      },
      fetchFileContentFn: async () => {
        fetchCalls += 1;
        return 'steps:\n- script: echo hi';
      },
    });

    const second = await fetchRepoFileWithCache({
      org: 'microsoft',
      project: 'WDATP',
      repoId: '123',
      repoName: 'Repo',
      path: '/pipelines/main.yml',
      ref: 'refs/heads/main',
      cacheRoot,
      resolveCommitShaFn: async () => {
        resolveCalls += 1;
        return 'deadbeef';
      },
      fetchFileContentFn: async () => {
        fetchCalls += 1;
        return 'steps:\n- script: echo hi';
      },
    });

    expect(first.cache).toBe('miss');
    expect(second.cache).toBe('hit');
    expect(first.commitSha).toBe('deadbeef');
    expect(second.commitSha).toBe('deadbeef');
    expect(fetchCalls).toBe(1);
    expect(resolveCalls).toBe(2);
  });

  test('misses cache when the same ref resolves to a new commit SHA', async () => {
    let fetchCalls = 0;
    const commits = ['deadbeef', 'cafebabe'];

    const first = await fetchRepoFileWithCache({
      org: 'microsoft',
      project: 'WDATP',
      repoId: '123',
      repoName: 'Repo',
      path: '/pipelines/main.yml',
      ref: 'refs/heads/main',
      cacheRoot,
      resolveCommitShaFn: async () => commits[0],
      fetchFileContentFn: async () => {
        fetchCalls += 1;
        return 'first';
      },
    });

    const second = await fetchRepoFileWithCache({
      org: 'microsoft',
      project: 'WDATP',
      repoId: '123',
      repoName: 'Repo',
      path: '/pipelines/main.yml',
      ref: 'refs/heads/main',
      cacheRoot,
      resolveCommitShaFn: async () => commits[1],
      fetchFileContentFn: async () => {
        fetchCalls += 1;
        return 'second';
      },
    });

    expect(first.cache).toBe('miss');
    expect(second.cache).toBe('miss');
    expect(first.commitSha).toBe('deadbeef');
    expect(second.commitSha).toBe('cafebabe');
    expect(fetchCalls).toBe(2);
  });
});
