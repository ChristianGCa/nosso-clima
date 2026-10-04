import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { type AppConfig, type EnvironmentInput, parseEnvironment } from './config/env.js';
import { type ProviderPolicy, parseProviderPolicy } from './config/provider-policy.js';
import { assertServerlessCredentials } from './config/serverless-credentials.js';
import { createQuotaReservation } from './infrastructure/quota-reservation.js';
import { createReservedOpenMeteoFetch } from './infrastructure/reserved-open-meteo-fetch.js';
import { createUpstashRestClient, type UpstashRestClient } from './infrastructure/upstash-rest.js';
import { createUpstreamCircuit } from './infrastructure/upstream-circuit.js';

export type VercelAppDependencies = Readonly<{
  redis?: UpstashRestClient;
  providerFetch?: typeof fetch;
}>;

export function createVercelApp(
  environment: EnvironmentInput,
  dependencies: VercelAppDependencies = {},
): FastifyInstance {
  let config: AppConfig;
  let policy: ProviderPolicy;
  try {
    if (!environment.NODE_ENV) {
      throw new Error('NODE_ENV is required');
    }
    config = parseEnvironment(environment);
    assertServerlessCredentials(environment);
    policy = parseProviderPolicy(environment);
  } catch {
    throw new Error('Invalid API configuration');
  }

  const redis =
    dependencies.redis ??
    createUpstashRestClient({
      endpoint: environment.UPSTASH_REDIS_REST_URL ?? '',
      token: environment.UPSTASH_REDIS_REST_TOKEN ?? '',
    });
  const quota = createQuotaReservation(redis, policy.limits);
  const circuits = {
    geocoding: createUpstreamCircuit(redis, 'geocoding', policy.circuit),
    forecast: createUpstreamCircuit(redis, 'forecast', policy.circuit),
  };
  const fetchImpl = createReservedOpenMeteoFetch({
    quota,
    circuits,
    costs: policy.costs,
    ...(dependencies.providerFetch ? { fetchImpl: dependencies.providerFetch } : {}),
  });

  return buildApp({
    config,
    fetchImpl,
    logger: { level: config.logLevel },
  });
}
