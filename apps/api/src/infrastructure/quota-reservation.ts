import { type UpstashRestClient, UpstashUnavailable } from './upstash-rest.js';

export type QuotaLimits = Readonly<{
  minute: number;
  hour: number;
  day: number;
  month: number;
}>;

const EVENTS_KEY = 'nc:quota:v1:{open-meteo}:events';
const BASE_KEY = 'nc:quota:v1:{open-meteo}:base';

// Each member is a zero-padded cumulative credit total. Its score is Redis server time in ms.
// The cumulative difference at a cutoff gives exact weighted use without scanning every event.
export const RESERVE_QUOTA_SCRIPT = `local cost = tonumber(ARGV[1])
local limits = {tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])}
-- The 31-day rolling window also bounds any calendar month.
local durations = {60000, 3600000, 86400000, 2678400000}
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local base = tonumber(redis.call('GET', KEYS[2]) or '0')
local latestMember = redis.call('ZREVRANGE', KEYS[1], 0, 0)
local latest = base
if #latestMember > 0 then latest = tonumber(latestMember[1]) end
if latest + cost > 9007199254740991 then return 0 end

for index = 1, 4 do
  local expired = redis.call('ZREVRANGEBYSCORE', KEYS[1], now - durations[index], '-inf', 'LIMIT', 0, 1)
  local prior = base
  if #expired > 0 then prior = tonumber(expired[1]) end
  if latest - prior + cost > limits[index] then return 0 end
end

local old = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now - durations[4], 'WITHSCORES', 'LIMIT', 0, 500)
if #old > 0 then
  local lastScore = old[#old]
  local lastAtScore = redis.call('ZREVRANGEBYSCORE', KEYS[1], lastScore, lastScore, 'LIMIT', 0, 1)
  redis.call('SET', KEYS[2], lastAtScore[1])
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', lastScore)
end

redis.call('ZADD', KEYS[1], now, string.format('%020.0f', latest + cost))
return 1`;

export type QuotaReservation = Readonly<{
  reserve(cost: number): Promise<boolean>;
}>;

export function createQuotaReservation(
  redis: UpstashRestClient,
  limits: QuotaLimits,
): QuotaReservation {
  if (
    ![limits.minute, limits.hour, limits.day, limits.month].every(
      (limit) => Number.isSafeInteger(limit) && limit > 0,
    )
  ) {
    throw new Error('Invalid quota limits');
  }

  return {
    async reserve(cost) {
      if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error('Invalid reservation cost');
      const result = await redis.eval(
        RESERVE_QUOTA_SCRIPT,
        [EVENTS_KEY, BASE_KEY],
        [
          String(cost),
          String(limits.minute),
          String(limits.hour),
          String(limits.day),
          String(limits.month),
        ],
      );
      if (result === 1) return true;
      if (result === 0) return false;
      throw new UpstashUnavailable();
    },
  };
}
