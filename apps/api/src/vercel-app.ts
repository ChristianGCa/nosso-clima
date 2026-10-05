import type { FastifyInstance } from 'fastify';
import type { Writable } from 'node:stream';

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
  loggerStream?: Writable;
}>;

export function createVercelApp(
  environment: EnvironmentInput,
  dependencies: VercelAppDependencies = {},
): FastifyInstance {
  const runtimeEnvironment =
    environment.VERCEL_ENV === 'preview'
      ? {
          ...environment,
          NODE_ENV: environment.NODE_ENV ?? 'production',
          HOST: environment.HOST ?? '0.0.0.0',
        }
      : environment;
  let config: AppConfig;
  let policy: ProviderPolicy;
  try {
    if (
      !runtimeEnvironment.NODE_ENV ||
      (environment.VERCEL_ENV === 'preview' && runtimeEnvironment.NODE_ENV !== 'production')
    ) {
      throw new Error('Invalid NODE_ENV');
    }
    config = parseEnvironment(runtimeEnvironment);
    assertServerlessCredentials(runtimeEnvironment);
    policy = parseProviderPolicy(runtimeEnvironment);
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
    sharedCache: { redis, secret: environment.CACHE_HMAC_KEY ?? '' },
    serverlessRateLimit: { redis, hmacKey: environment.RATE_LIMIT_HMAC_KEY ?? '' },
    logger: {
      level: config.logLevel,
      ...(dependencies.loggerStream ? { stream: dependencies.loggerStream } : {}),
    },
  });
}
