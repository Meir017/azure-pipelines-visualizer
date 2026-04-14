/**
 * Simple in-memory TTL cache.
 *
 * Used to avoid redundant Azure DevOps API calls for data that changes
 * infrequently (repo metadata, branch→commit resolution).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryTTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private inflight = new Map<string, Promise<T>>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  /**
   * @param ttlSeconds Time-to-live in seconds for each entry.
   * @param maxSize Maximum number of entries before oldest are evicted.
   */
  constructor(ttlSeconds: number, maxSize = 1000) {
    this.ttlMs = ttlSeconds * 1000;
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict oldest entries if at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Get a value from cache, or compute and cache it if missing/expired.
   * Concurrent calls for the same key share a single in-flight fetch.
   */
  async getOrFetch(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = fetcher().then(
      (value) => {
        this.set(key, value);
        this.inflight.delete(key);
        return value;
      },
      (err) => {
        this.inflight.delete(key);
        throw err;
      },
    );

    this.inflight.set(key, promise);
    return promise;
  }

  /** Number of entries currently in the cache. */
  get size(): number {
    return this.store.size;
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }
}
