import { ApiError } from '../errors/api-error.js';
import type { Cache } from '../infrastructure/cache.js';
import type { BoundedExecutor } from '../infrastructure/concurrency.js';
import type { RedisCache } from '../infrastructure/redis-cache.js';
import type { SingleFlight } from '../infrastructure/single-flight.js';
import { UpstashUnavailable } from '../infrastructure/upstash-rest.js';
import { ForecastFailure, normalizeForecastResponse } from './open-meteo-forecast.js';
import { canonicalizeForecastLocation, forecastCacheKey } from './forecast-query.js';
import type { ForecastLocation, ForecastResponse } from './forecast-contract.js';

const FORECAST_TTL_MS = 600_000;

export type ForecastLogger = Readonly<{
  info(bindings: { event: 'cache_hit' | 'cache_miss' }, message: string): void;
  warn(
    bindings: {
      event: 'forecast_upstream_failed' | 'upstream_saturation' | 'redis_unavailable';
      failureKind?: ForecastFailure['kind'];
      upstreamStatus?: number;
    },
    message: string,
  ): void;
}>;

export type ForecastClient = Readonly<{
  fetch(location: ForecastLocation): Promise<unknown>;
}>;

export type ForecastService = Readonly<{
  get(location: ForecastLocation, logger?: ForecastLogger): Promise<ForecastResponse>;
}>;

export function createForecastService(
  dependencies: Readonly<{
    client: ForecastClient;
    cache: Cache<string, ForecastResponse>;
    sharedCache?: RedisCache<ForecastResponse>;
    singleFlight: SingleFlight;
    executor: BoundedExecutor;
    now?: () => Date;
  }>,
): ForecastService {
  const { client, cache, sharedCache, singleFlight, executor } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  return {
    async get(location, logger) {
      const canonicalLocation = canonicalizeForecastLocation(location);
      const key = forecastCacheKey(canonicalLocation);
      try {
        if (sharedCache) {
          return await singleFlight.run(key, () =>
            sharedCache.getOrLoad(
              key,
              FORECAST_TTL_MS,
              async () => {
                const payload = await executor.run(() => client.fetch(canonicalLocation), logger);
                return normalizeForecastResponse(payload, canonicalLocation, now().toISOString());
              },
              logger,
            ),
          );
        }
        const cached = cache.get(key, logger);
        if (cached !== undefined) return cached;

        return await singleFlight.run(key, async () => {
          const rechecked = cache.get(key, logger);
          if (rechecked !== undefined) return rechecked;

          const payload = await executor.run(() => client.fetch(canonicalLocation), logger);
          const normalized = normalizeForecastResponse(
            payload,
            canonicalLocation,
            now().toISOString(),
          );
          cache.set(key, normalized, { ttlMs: FORECAST_TTL_MS });
          return normalized;
        });
      } catch (failure) {
        if (failure instanceof UpstashUnavailable) {
          logger?.warn({ event: 'redis_unavailable' }, 'redis unavailable');
          throw new ApiError('SERVICE_UNAVAILABLE');
        }
        if (!(failure instanceof ForecastFailure)) throw failure;

        logger?.warn(
          {
            event: 'forecast_upstream_failed',
            failureKind: failure.kind,
            ...(failure.kind === 'status' && failure.upstreamStatus !== undefined
              ? { upstreamStatus: failure.upstreamStatus }
              : {}),
          },
          'forecast upstream failed',
        );
        throw new ApiError('SERVICE_UNAVAILABLE');
      }
    },
  };
}
