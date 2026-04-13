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
});
