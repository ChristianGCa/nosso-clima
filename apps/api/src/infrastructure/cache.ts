import { LRUCache } from 'lru-cache';

export type CacheSetOptions = Readonly<{
  ttlMs: number;
}>;

export interface Cache<Key, Value> {
  get(key: Key): Value | undefined;
  set(key: Key, value: Value, options: CacheSetOptions): void;
  delete(key: Key): boolean;
  clear(): void;
  readonly size: number;
}

export type CacheOptions = Readonly<{
  maxEntries: number;
  now?: () => number;
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
    get(key): Value | undefined {
      return cache.get(toLruKey(key))?.value;
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
