import { describe, expect, it, vi } from 'vitest';

import {
  createReservedOpenMeteoFetch,
  ProviderAccessFailure,
} from '../../src/infrastructure/reserved-open-meteo-fetch.js';
import type { QuotaReservation } from '../../src/infrastructure/quota-reservation.js';
import type { UpstreamCircuit } from '../../src/infrastructure/upstream-circuit.js';
import { UpstashUnavailable } from '../../src/infrastructure/upstash-rest.js';

const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search?name=Paris');
const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast?latitude=1');
const requestOptions = { redirect: 'error' } as const;

function setup(options: {
  decision?: Awaited<ReturnType<UpstreamCircuit['check']>>;
  reserved?: boolean;
  response?: Response;
  redisFailure?: boolean;
}) {
  const order: string[] = [];
  const reserve = vi.fn<QuotaReservation['reserve']>(async (cost) => {
    order.push(`reserve:${cost}`);
    if (options.redisFailure) throw new UpstashUnavailable();
    return options.reserved ?? true;
  });
  const check = vi.fn<UpstreamCircuit['check']>(async () => {
    order.push('check');
    if (options.redisFailure) throw new UpstashUnavailable();
    return options.decision ?? { kind: 'normal' };
  });
  const trip = vi.fn<UpstreamCircuit['trip']>(async () => {
    order.push('trip');
  });
  const resolveProbe = vi.fn<UpstreamCircuit['resolveProbe']>(async () => {
    order.push('resolve');
  });
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    order.push('fetch');
    return options.response ?? new Response('{}', { status: 200 });
  });
  const circuit = { check, trip, resolveProbe };
  const fetch = createReservedOpenMeteoFetch({
    quota: { reserve },
    circuits: { geocoding: circuit, forecast: circuit },
    costs: { geocoding: 1000, forecast: 2500 },
    fetchImpl,
  });
  return { fetch, order, reserve, check, trip, resolveProbe, fetchImpl };
}

describe('reserved Open-Meteo fetch', () => {
  it.each([
    [geocodingUrl, 1000],
    [forecastUrl, 2500],
  ])('checks circuit and reserves cost %i before one outbound fetch', async (url, cost) => {
    const fixture = setup({});
    await fixture.fetch(url, requestOptions);

    expect(fixture.order).toEqual(['check', `reserve:${cost}`, 'fetch']);
    expect(fixture.reserve).toHaveBeenCalledWith(cost);
    expect(fixture.fetchImpl).toHaveBeenCalledOnce();
    expect(fixture.fetchImpl.mock.calls[0]?.[1]).toEqual({ method: 'GET', redirect: 'error' });
  });

  it('rejects an unsafe destination before any Redis command', async () => {
    const fixture = setup({});
    await expect(
      fixture.fetch(new URL('https://other.example/v1/forecast'), requestOptions),
    ).rejects.toThrow(/^Blocked Open-Meteo request$/);
    expect(fixture.order).toEqual([]);
  });

  it('blocks an open circuit before reservation', async () => {
    const fixture = setup({ decision: { kind: 'blocked' } });
    await expect(fixture.fetch(geocodingUrl, requestOptions)).rejects.toMatchObject({
      kind: 'circuit_open',
    });
    expect(fixture.order).toEqual(['check']);
  });

  it('blocks denied quota and Redis failure before outbound work', async () => {
    const denied = setup({ reserved: false });
    await expect(denied.fetch(geocodingUrl, requestOptions)).rejects.toMatchObject({
      kind: 'quota_denied',
    });
    expect(denied.order).toEqual(['check', 'reserve:1000']);

    const unavailable = setup({ redisFailure: true });
    await expect(unavailable.fetch(geocodingUrl, requestOptions)).rejects.toMatchObject({
      kind: 'redis_unavailable',
    });
    expect(unavailable.order).toEqual(['check']);

    const reserveFailure = setup({});
    reserveFailure.reserve.mockRejectedValueOnce(new UpstashUnavailable());
    await expect(reserveFailure.fetch(geocodingUrl, requestOptions)).rejects.toMatchObject({
      kind: 'redis_unavailable',
    });
    expect(reserveFailure.order).toEqual(['check']);
    expect(reserveFailure.reserve).toHaveBeenCalledWith(1000);
    expect(reserveFailure.fetchImpl).not.toHaveBeenCalled();
  });

  it('does not call Redis or the provider after cancellation and keeps an in-flight reservation consumed', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    const beforeCheck = setup({});
    await expect(
      beforeCheck.fetch(geocodingUrl, { redirect: 'error', signal: cancelled.signal }),
    ).rejects.toThrow();
    expect(beforeCheck.order).toEqual([]);

    const duringReserve = new AbortController();
    const afterReservation = setup({});
    afterReservation.reserve.mockImplementationOnce(async (cost) => {
      afterReservation.order.push(`reserve:${cost}`);
      duringReserve.abort();
      return true;
    });
    await expect(
      afterReservation.fetch(geocodingUrl, { redirect: 'error', signal: duringReserve.signal }),
    ).rejects.toThrow();
    expect(afterReservation.order).toEqual(['check', 'reserve:1000']);
    expect(afterReservation.fetchImpl).not.toHaveBeenCalled();
  });

  it('opens the shared circuit on provider 429 after the consumed reservation', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const fixture = setup({ response: new Response(body, { status: 429 }) });
    await expect(fixture.fetch(geocodingUrl, requestOptions)).rejects.toEqual(
      new ProviderAccessFailure('upstream_rate_limited'),
    );
    expect(fixture.order).toEqual(['check', 'reserve:1000', 'fetch', 'trip']);
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });

  it('resolves a successful probe and trips a failed probe', async () => {
    const probe = setup({ decision: { kind: 'probe', token: 'probe-id' } });
    await probe.fetch(forecastUrl, requestOptions);
    expect(probe.order).toEqual(['check', 'reserve:2500', 'fetch', 'resolve']);
    expect(probe.resolveProbe).toHaveBeenCalledWith('probe-id');

    const failing = setup({ decision: { kind: 'probe', token: 'probe-id' } });
    failing.fetchImpl.mockRejectedValueOnce(new Error('private network detail'));
    await expect(failing.fetch(forecastUrl, requestOptions)).rejects.toThrow();
    expect(failing.order).toEqual(['check', 'reserve:2500', 'trip']);
  });
});
