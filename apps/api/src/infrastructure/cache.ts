import { LRUCache } from 'lru-cache';

export type CacheSetOptions = Readonly<{
  ttlMs: number;
}>;

export interface Cache<Key, Value> {
  get(key: Key, logger?: CacheLogger): Value | undefined;
  set(key: Key, value: Value, options: CacheSetOptions): void;
  delete(key: Key): boolean;
  clear(): void;
  readonly size: number;
}

type CacheLog = Readonly<{
  event: 'cache_hit' | 'cache_miss';
}>;

export type CacheLogger = Readonly<{
  info(bindings: CacheLog, message: string): void;
}>;

export type CacheOptions = Readonly<{
  maxEntries: number;
  now?: () => number;
  logger?: CacheLogger;
}>;

type CacheEntry<Value> = Readonly<{
  value: Value;
}>;

export function createCache<Key, Value>(options: CacheOptions): Cache<Key, Value> {
  assertPositiveInteger(options.maxEntries, 'maxEntries');

  const sourceNow = options.now ?? (() => performance.now());
  const clockOrigin = sourceNow();
  const cache = new LRUCache<Key & {}, CacheEntry<Value>>({
    max: options.maxEntries,
    // lru-cache reserves zero as the sentinel for entries without a TTL.
    perf: { now: () => sourceNow() - clockOrigin + 1 },
    ttlResolution: 0,
  });

  return {
    get(key, logger = options.logger): Value | undefined {
      const entry = cache.get(toLruKey(key));
      if (entry === undefined) {
        logger?.info({ event: 'cache_miss' }, 'cache miss');
        return undefined;
      }

      logger?.info({ event: 'cache_hit' }, 'cache hit');
      return entry.value;
    },
    set(key, value, setOptions): void {
      assertPositiveNumber(setOptions.ttlMs, 'ttlMs');
      cache.set(toLruKey(key), { value }, { ttl: setOptions.ttlMs });
    },
    delete(key): boolean {
      return cache.delete(toLruKey(key));
    },
    clear(): void {
      cache.clear();
    },
    get size(): number {
      return cache.size;
    },
  };
}

function toLruKey<Key>(key: Key): Key & {} {
  return key as Key & {};
}

function assertPositiveInteger(value: number, optionName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${optionName} must be a positive integer`);
  }
}

function assertPositiveNumber(value: number, optionName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${optionName} must be a positive finite number`);
  }
}
