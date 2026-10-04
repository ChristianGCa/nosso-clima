import { createHmac, randomUUID } from 'node:crypto';

import type { CacheLogger, CacheSetOptions } from './cache.js';
import { type UpstashRestClient, UpstashUnavailable } from './upstash-rest.js';

const MAX_TTL_MS = {
  'location-search': 86_400_000,
  'weather-forecast': 600_000,
} as const;
const MAX_VALUE_BYTES = 24_576;
const LOCK_TTL_MS = 12_000;
const WAIT_STEPS_MS = [100, 200, 400, 800, 1_600, 3_200] as const;

export type RedisCacheNamespace = keyof typeof MAX_TTL_MS;

export type RedisCache<Value> = Readonly<{
  get(key: string, logger?: CacheLogger): Promise<Value | undefined>;
  set(key: string, value: Value, options: CacheSetOptions): Promise<void>;
  getOrLoad(
    key: string,
    ttlMs: number,
    load: () => Promise<Value>,
    logger?: CacheLogger,
  ): Promise<Value>;
}>;

export const READ_CACHE_SCRIPT = `local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return nil end
return redis.call('GET', KEYS[1])`;

export const WRITE_CACHE_SCRIPT = `return redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])`;

export const ACQUIRE_CACHE_LOCK_SCRIPT = `local acquired = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2])
if acquired then return 1 end
return 0`;

export const RELEASE_CACHE_LOCK_SCRIPT = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1`;

export function createRedisCache<Value>(options: {
  redis: UpstashRestClient;
  namespace: RedisCacheNamespace;
  secret: string;
  isValue(value: unknown): value is Value;
  wait?: (ms: number) => Promise<void>;
}): RedisCache<Value> {
  if (!/^[0-9a-f]{64}$/i.test(options.secret)) {
    throw new Error('Invalid cache secret');
  }
  const secret = Buffer.from(options.secret, 'hex');
  const maxTtlMs = MAX_TTL_MS[options.namespace];
  if (!maxTtlMs) throw new Error('Invalid cache namespace');
  const digest = (key: string) => createHmac('sha256', secret).update(key).digest('hex');
  const storageKey = (key: string) => `nc:cache:v1:${options.namespace}:${digest(key)}`;
  const lockKey = (key: string) => `nc:cache-lock:v1:${options.namespace}:${digest(key)}`;
  const wait =
    options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const assertTtl = (ttlMs: number) => {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > maxTtlMs) {
      throw new Error('Invalid cache TTL');
    }
  };
  const acquire = async (key: string, token: string) => {
    try {
      const result = await options.redis.eval(
        ACQUIRE_CACHE_LOCK_SCRIPT,
        [lockKey(key)],
        [token, String(LOCK_TTL_MS)],
      );
      if (result === 1) return true;
      if (result === 0) return false;
      throw new UpstashUnavailable();
    } catch {
      throw new UpstashUnavailable();
    }
  };
  const release = async (key: string, token: string) => {
    try {
      const result = await options.redis.eval(RELEASE_CACHE_LOCK_SCRIPT, [lockKey(key)], [token]);
      if (result !== 0 && result !== 1) throw new UpstashUnavailable();
    } catch {
      throw new UpstashUnavailable();
    }
  };

  const cache: RedisCache<Value> = {
    async get(key, logger) {
      let raw: unknown;
      try {
        raw = await options.redis.eval(READ_CACHE_SCRIPT, [storageKey(key)], []);
      } catch {
        throw new UpstashUnavailable();
      }
      if (raw === null) {
        logger?.info({ event: 'cache_miss' }, 'cache miss');
        return undefined;
      }
      if (typeof raw !== 'string') throw new UpstashUnavailable();
      try {
        const value: unknown = JSON.parse(raw);
        if (!options.isValue(value)) throw new UpstashUnavailable();
        logger?.info({ event: 'cache_hit' }, 'cache hit');
        return value;
      } catch {
        throw new UpstashUnavailable();
      }
    },
    async set(key, value, setOptions) {
      assertTtl(setOptions.ttlMs);
      if (!options.isValue(value)) throw new Error('Invalid cache value');
      let encoded: string;
      try {
        encoded = JSON.stringify(value);
      } catch {
        throw new Error('Invalid cache value');
      }
      if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > MAX_VALUE_BYTES) {
        throw new Error('Invalid cache value');
      }
      try {
        const result = await options.redis.eval(
          WRITE_CACHE_SCRIPT,
          [storageKey(key)],
          [encoded, String(setOptions.ttlMs)],
        );
        if (result !== 'OK') throw new UpstashUnavailable();
      } catch {
        throw new UpstashUnavailable();
      }
    },
    async getOrLoad(key, ttlMs, load, logger) {
      assertTtl(ttlMs);
      const cached = await cache.get(key, logger);
      if (cached !== undefined) return cached;

      const token = randomUUID();
      const loadWithLock = async () => {
        try {
          const rechecked = await cache.get(key);
          if (rechecked !== undefined) return rechecked;
          const value = await load();
          await cache.set(key, value, { ttlMs });
          return value;
        } finally {
          await release(key, token);
        }
      };
      if (await acquire(key, token)) return loadWithLock();

      for (const delayMs of WAIT_STEPS_MS) {
        await wait(delayMs);
        const afterWait = await cache.get(key);
        if (afterWait !== undefined) return afterWait;
        if (await acquire(key, token)) return loadWithLock();
      }

      // A bounded wait avoids tying a request to a crashed holder. The caller's
      // loader must reserve quota before each actual outbound request.
      const value = await load();
      await cache.set(key, value, { ttlMs });
      return value;
    },
  };
  return cache;
}
