import { describe, expect, it } from 'vitest';

import {
  createUpstreamCircuit,
  type CircuitDecision,
} from '../../src/infrastructure/upstream-circuit.js';
import {
  UpstashUnavailable,
  type UpstashRestClient,
} from '../../src/infrastructure/upstash-rest.js';

describe('shared upstream circuit', () => {
  it.each(['geocoding', 'forecast'] as const)('uses a versioned key for %s', async (service) => {
    const calls: Array<{ keys: readonly string[]; args: readonly string[] }> = [];
    const redis: UpstashRestClient = {
      async eval(_script, keys, args) {
        calls.push({ keys, args });
        return 1;
      },
    };
    const circuit = createUpstreamCircuit(redis, service, {
      cooldownMs: 60_000,
      probeMs: 10_000,
      createProbeId: () => 'fixed-probe-id',
    });

    await expect(circuit.check()).resolves.toEqual({ kind: 'normal' });
    await expect(circuit.trip()).resolves.toBeUndefined();
    await expect(circuit.resolveProbe('fixed-probe-id')).resolves.toBeUndefined();
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.keys[0] === `nc:circuit:v1:{open-meteo}:${service}`)).toBe(
      true,
    );
    expect(calls[0]?.args).toEqual(['fixed-probe-id', '10000']);
    expect(calls[1]?.args).toEqual(['60000']);
    expect(calls[2]?.args).toEqual(['fixed-probe-id']);
  });

  it.each([
    [0, { kind: 'blocked' }],
    [1, { kind: 'normal' }],
    [2, { kind: 'probe', token: 'fixed-probe-id' }],
  ] satisfies Array<[number, CircuitDecision]>)('maps decision %i', async (result, expected) => {
    const redis: UpstashRestClient = { eval: async () => result };
    const circuit = createUpstreamCircuit(redis, 'forecast', {
      cooldownMs: 60_000,
      probeMs: 10_000,
      createProbeId: () => 'fixed-probe-id',
    });
    await expect(circuit.check()).resolves.toEqual(expected);
  });

  it('fails closed for Redis failures and malformed decisions', async () => {
    const redis: UpstashRestClient = { eval: async () => 'allow' };
    const circuit = createUpstreamCircuit(redis, 'forecast', {
      cooldownMs: 60_000,
      probeMs: 10_000,
    });
    await expect(circuit.check()).rejects.toEqual(new UpstashUnavailable());
    await expect(circuit.trip()).rejects.toEqual(new UpstashUnavailable());
    await expect(circuit.resolveProbe('probe')).rejects.toEqual(new UpstashUnavailable());
    expect(() =>
      createUpstreamCircuit(redis, 'forecast', { cooldownMs: 0, probeMs: 10_000 }),
    ).toThrow(/^Invalid circuit timing$/);
  });
});
