import { afterEach, describe, expect, test } from 'bun:test';
import { MemoryTTLCache } from './memory-cache.js';

describe('MemoryTTLCache', () => {
  test('returns undefined for missing key', () => {
    const cache = new MemoryTTLCache<string>(60);
    expect(cache.get('missing')).toBeUndefined();
  });

  test('stores and retrieves a value', () => {
    const cache = new MemoryTTLCache<string>(60);
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  test('expires entries after TTL', async () => {
    // 0.05 second TTL
    const cache = new MemoryTTLCache<string>(0.05);
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');

    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('key')).toBeUndefined();
  });

  test('evicts oldest entry when at maxSize', () => {
    const cache = new MemoryTTLCache<string>(60, 2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3'); // should evict 'a'

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
    expect(cache.size).toBe(2);
  });

  test('getOrFetch returns cached value without calling fetcher', async () => {
    const cache = new MemoryTTLCache<string>(60);
    cache.set('key', 'cached');

    let fetchCalls = 0;
    const result = await cache.getOrFetch('key', async () => {
      fetchCalls++;
      return 'fetched';
    });

    expect(result).toBe('cached');
    expect(fetchCalls).toBe(0);
  });

  test('getOrFetch calls fetcher on miss and caches result', async () => {
    const cache = new MemoryTTLCache<string>(60);

    let fetchCalls = 0;
    const result1 = await cache.getOrFetch('key', async () => {
      fetchCalls++;
      return 'fetched';
    });
    const result2 = await cache.getOrFetch('key', async () => {
      fetchCalls++;
      return 'fetched-again';
    });

    expect(result1).toBe('fetched');
    expect(result2).toBe('fetched');
    expect(fetchCalls).toBe(1);
  });

  test('clear removes all entries', () => {
    const cache = new MemoryTTLCache<string>(60);
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  test('getOrFetch deduplicates concurrent calls for the same key', async () => {
    const cache = new MemoryTTLCache<string>(60);

    let fetchCalls = 0;
    let resolveFirst!: (v: string) => void;
    const blocker = new Promise<string>((r) => {
      resolveFirst = r;
    });

    const fetcher = async () => {
      fetchCalls++;
      return blocker;
    };

    // Launch two concurrent fetches for the same key
    const p1 = cache.getOrFetch('key', fetcher);
    const p2 = cache.getOrFetch('key', fetcher);

    // Only one fetcher should have been called
    expect(fetchCalls).toBe(1);

    resolveFirst('shared-value');

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('shared-value');
    expect(r2).toBe('shared-value');
  });

  test('getOrFetch clears inflight on error so retry works', async () => {
    const cache = new MemoryTTLCache<string>(60);

    let calls = 0;
    const failFetcher = async () => {
      calls++;
      throw new Error('boom');
    };

    await expect(cache.getOrFetch('key', failFetcher)).rejects.toThrow('boom');
    expect(calls).toBe(1);

    // After failure, a new fetch should be attempted (not stuck on old promise)
    const result = await cache.getOrFetch('key', async () => {
      calls++;
      return 'recovered';
    });
    expect(result).toBe('recovered');
    expect(calls).toBe(2);
  });

  test('keys are case-sensitive by default (callers lowercase for case-insensitive behavior)', () => {
    const cache = new MemoryTTLCache<string>(60);
    cache.set('Microsoft/WDATP/Repo', 'upper');
    expect(cache.get('Microsoft/WDATP/Repo')).toBe('upper');
    expect(cache.get('microsoft/wdatp/repo')).toBeUndefined();

    // Callers should lowercase keys for case-insensitive matching
    const ciCache = new MemoryTTLCache<string>(60);
    ciCache.set('microsoft/wdatp/repo', 'value');
    expect(ciCache.get('microsoft/wdatp/repo')).toBe('value');
  });
});
