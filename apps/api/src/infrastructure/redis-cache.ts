import { createHmac } from 'node:crypto';

import type { CacheLogger, CacheSetOptions } from './cache.js';
import { type UpstashRestClient, UpstashUnavailable } from './upstash-rest.js';

const MAX_TTL_MS = {
  'location-search': 86_400_000,
  'weather-forecast': 600_000,
} as const;
const MAX_VALUE_BYTES = 4_096;

export type RedisCacheNamespace = keyof typeof MAX_TTL_MS;

export type RedisCache<Value> = Readonly<{
  get(key: string, logger?: CacheLogger): Promise<Value | undefined>;
  set(key: string, value: Value, options: CacheSetOptions): Promise<void>;
}>;

export const READ_CACHE_SCRIPT = `local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return nil end
return redis.call('GET', KEYS[1])`;

export const WRITE_CACHE_SCRIPT = `return redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])`;

export function createRedisCache<Value>(options: {
  redis: UpstashRestClient;
  namespace: RedisCacheNamespace;
  secret: string;
  isValue(value: unknown): value is Value;
}): RedisCache<Value> {
  if (!/^[0-9a-f]{64}$/i.test(options.secret)) {
    throw new Error('Invalid cache secret');
  }
  const secret = Buffer.from(options.secret, 'hex');
  const maxTtlMs = MAX_TTL_MS[options.namespace];
  if (!maxTtlMs) throw new Error('Invalid cache namespace');
  const storageKey = (key: string) =>
    `nc:cache:v1:${options.namespace}:${createHmac('sha256', secret).update(key).digest('hex')}`;

  return {
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
      if (
        !Number.isSafeInteger(setOptions.ttlMs) ||
        setOptions.ttlMs <= 0 ||
        setOptions.ttlMs > maxTtlMs ||
        !options.isValue(value)
      ) {
        throw new Error('Invalid cache value or TTL');
      }
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
  };
}
