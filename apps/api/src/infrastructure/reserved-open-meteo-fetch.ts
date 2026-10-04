import type { ProviderPolicy } from '../config/provider-policy.js';
import { createOpenMeteoTransport } from './open-meteo-transport.js';
import type { QuotaReservation } from './quota-reservation.js';
import type { UpstreamCircuit, UpstreamService } from './upstream-circuit.js';

export type ProviderAccessFailureKind =
  | 'circuit_open'
  | 'quota_denied'
  | 'redis_unavailable'
  | 'upstream_rate_limited';

export class ProviderAccessFailure extends Error {
  readonly kind: ProviderAccessFailureKind;

  constructor(kind: ProviderAccessFailureKind) {
    super('Provider request unavailable');
    this.name = 'ProviderAccessFailure';
    this.kind = kind;
  }
}

export function createReservedOpenMeteoFetch(
  options: Readonly<{
    quota: QuotaReservation;
    circuits: Readonly<Record<UpstreamService, UpstreamCircuit>>;
    costs: ProviderPolicy['costs'];
    fetchImpl?: typeof fetch;
  }>,
): typeof fetch {
  const fetchImpl = options.fetchImpl ?? fetch;

  return createOpenMeteoTransport(async (input, init) => {
    // createOpenMeteoTransport has already checked the URL and rebuilt the options.
    if (!(input instanceof URL)) throw new Error('Blocked Open-Meteo request');
    if (init?.signal?.aborted) throw new Error('Provider request cancelled');
    const service: UpstreamService =
      input.hostname === 'geocoding-api.open-meteo.com' ? 'geocoding' : 'forecast';
    const circuit = options.circuits[service];
    let decision: Awaited<ReturnType<UpstreamCircuit['check']>>;
    try {
      decision = await circuit.check();
    } catch {
      throw new ProviderAccessFailure('redis_unavailable');
    }
    if (decision.kind === 'blocked') throw new ProviderAccessFailure('circuit_open');
    if (init?.signal?.aborted) throw new Error('Provider request cancelled');

    let reserved: boolean;
    try {
      reserved = await options.quota.reserve(options.costs[service]);
    } catch {
      throw new ProviderAccessFailure('redis_unavailable');
    }
    if (!reserved) throw new ProviderAccessFailure('quota_denied');
    if (init?.signal?.aborted) throw new Error('Provider request cancelled');

    let response: Response;
    try {
      response = await fetchImpl(input, init);
    } catch (failure) {
      if (decision.kind === 'probe') {
        try {
          await circuit.trip();
        } catch {
          throw new ProviderAccessFailure('redis_unavailable');
        }
      }
      throw failure;
    }

    if (response.status === 429) {
      void response.body?.cancel().catch(() => undefined);
      try {
        await circuit.trip();
      } catch {
        throw new ProviderAccessFailure('redis_unavailable');
      }
      throw new ProviderAccessFailure('upstream_rate_limited');
    }
    if (decision.kind === 'probe') {
      try {
        await circuit.resolveProbe(decision.token);
      } catch {
        throw new ProviderAccessFailure('redis_unavailable');
      }
    }
    return response;
  });
}
