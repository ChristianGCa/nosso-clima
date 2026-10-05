import { type UpstashRestClient, UpstashUnavailable } from './upstash-rest.js';
import type { VisitorIdentity } from './visitor-identity.js';
import { type VisitorGroup, VISITOR_LIMITS } from './visitor-pre-limit.js';

export type SharedVisitorDecision =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'rejected'; scope: 'global' | VisitorGroup; retryAfter: number }>;

export type SharedVisitorLimit = Readonly<{
  check(identity: VisitorIdentity, group?: VisitorGroup): Promise<SharedVisitorDecision>;
}>;

export const SHARED_VISITOR_LIMIT_SCRIPT = `#!lua flags=allow-key-locking
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local currentBucket = math.floor(now / 60000)
local offset = currentBucket - tonumber(ARGV[1])
if offset < -1 or offset > 1 then return {3, 0, 0} end

local index = (offset + 1) * 2 + 1
local globalKey = KEYS[index]
local groupKey = KEYS[index + 1]
local groupLimit = tonumber(ARGV[2])
local remainingMs = (currentBucket + 1) * 60000 - now
local global = tonumber(redis.call('GET', globalKey) or '0')
local group = 0
if groupLimit > 0 then group = tonumber(redis.call('GET', groupKey) or '0') end
if not global or global < 0 or global % 1 ~= 0 or not group or group < 0 or group % 1 ~= 0 then
  return {3, 0, 0}
end
if global >= 60 then return {0, remainingMs, 0} end
if groupLimit > 0 and group >= groupLimit then return {2, remainingMs, 0} end

redis.call('SET', globalKey, global + 1, 'PX', remainingMs)
if groupLimit > 0 then redis.call('SET', groupKey, group + 1, 'PX', remainingMs) end
return {1, remainingMs, 60 - global - 1}`;

export function createSharedVisitorLimit(redis: UpstashRestClient): SharedVisitorLimit {
  return {
    async check(identity, group) {
      const keys = identity.neighborDigests.flatMap((digest) => [
        `nc:visitor-limit:v1:{${digest}}:global`,
        `nc:visitor-limit:v1:{${digest}}:${group ?? 'none'}`,
      ]);
      let result: unknown;
      try {
        result = await redis.eval(SHARED_VISITOR_LIMIT_SCRIPT, keys, [
          String(identity.bucket),
          String(group ? VISITOR_LIMITS[group] : 0),
        ]);
      } catch {
        throw new UpstashUnavailable();
      }
      if (
        !Array.isArray(result) ||
        result.length !== 3 ||
        !result.every((value) => Number.isSafeInteger(value))
      ) {
        throw new UpstashUnavailable();
      }
      const [code, remainingMs] = result as [number, number, number];
      if (code === 1 && remainingMs > 0 && remainingMs <= 60_000) return { kind: 'allowed' };
      if (
        (code === 0 || (code === 2 && group !== undefined)) &&
        remainingMs > 0 &&
        remainingMs <= 60_000
      ) {
        return {
          kind: 'rejected',
          scope: code === 0 ? 'global' : (group as VisitorGroup),
          retryAfter: Math.ceil(remainingMs / 1000),
        };
      }
      throw new UpstashUnavailable();
    },
  };
}
