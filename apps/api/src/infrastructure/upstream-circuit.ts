import { randomUUID } from 'node:crypto';

import { type UpstashRestClient, UpstashUnavailable } from './upstash-rest.js';

const KEYS = {
  geocoding: 'nc:circuit:v1:{open-meteo}:geocoding',
  forecast: 'nc:circuit:v1:{open-meteo}:forecast',
} as const;

export type UpstreamService = keyof typeof KEYS;
export type CircuitDecision =
  | Readonly<{ kind: 'blocked' | 'normal' }>
  | Readonly<{ kind: 'probe'; token: string }>;

export const CHECK_CIRCUIT_SCRIPT = `local state = redis.call('GET', KEYS[1])
if not state or state == 'closed' then return 1 end

local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local openUntil = string.match(state, '^open:(%d+)$')
if openUntil and now < tonumber(openUntil) then return 0 end

local probeUntil = string.match(state, '^probe:[%w%-]+:(%d+)$')
if probeUntil and now < tonumber(probeUntil) then return 0 end
if not openUntil and not probeUntil then return 0 end

redis.call('SET', KEYS[1], 'probe:' .. ARGV[1] .. ':' .. tostring(now + tonumber(ARGV[2])))
return 2`;

export const TRIP_CIRCUIT_SCRIPT = `local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('SET', KEYS[1], 'open:' .. tostring(now + tonumber(ARGV[1])))
return 1`;

export const RESOLVE_PROBE_SCRIPT = `local state = redis.call('GET', KEYS[1])
local prefix = 'probe:' .. ARGV[1] .. ':'
if state and string.sub(state, 1, #prefix) == prefix then
  redis.call('SET', KEYS[1], 'closed')
  return 1
end
return 0`;

export type UpstreamCircuit = Readonly<{
  check(): Promise<CircuitDecision>;
  trip(): Promise<void>;
  resolveProbe(token: string): Promise<void>;
}>;

export function createUpstreamCircuit(
  redis: UpstashRestClient,
  service: UpstreamService,
  options: Readonly<{
    cooldownMs: number;
    probeMs: number;
    createProbeId?: () => string;
  }>,
): UpstreamCircuit {
  if (
    !Number.isSafeInteger(options.cooldownMs) ||
    options.cooldownMs <= 0 ||
    !Number.isSafeInteger(options.probeMs) ||
    options.probeMs <= 0
  ) {
    throw new Error('Invalid circuit timing');
  }
  const key = KEYS[service];
  if (!key) throw new Error('Invalid upstream service');
  const createProbeId = options.createProbeId ?? randomUUID;

  return {
    async check() {
      const token = createProbeId();
      const result = await redis.eval(
        CHECK_CIRCUIT_SCRIPT,
        [key],
        [token, String(options.probeMs)],
      );
      if (result === 0) return { kind: 'blocked' };
      if (result === 1) return { kind: 'normal' };
      if (result === 2) return { kind: 'probe', token };
      throw new UpstashUnavailable();
    },
    async trip() {
      const result = await redis.eval(TRIP_CIRCUIT_SCRIPT, [key], [String(options.cooldownMs)]);
      if (result !== 1) throw new UpstashUnavailable();
    },
    async resolveProbe(token) {
      const result = await redis.eval(RESOLVE_PROBE_SCRIPT, [key], [token]);
      if (result !== 0 && result !== 1) throw new UpstashUnavailable();
    },
  };
}
