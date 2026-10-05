import { ApiError } from '../errors/api-error.js';
import type { Cache } from '../infrastructure/cache.js';
import type { BoundedExecutor } from '../infrastructure/concurrency.js';
import type { RedisCache } from '../infrastructure/redis-cache.js';
import type { SingleFlight } from '../infrastructure/single-flight.js';
import { UpstashUnavailable } from '../infrastructure/upstash-rest.js';
import type { Location } from './location-contract.js';
import { locationCacheKey } from './location-query.js';
import { GeocodingFailure, type GeocodingClient } from './open-meteo-geocoding.js';

const LOCATION_TTL_MS = 86_400_000;

export type LocationSearchLogger = Readonly<{
  info(bindings: { event: 'cache_hit' | 'cache_miss' }, message: string): void;
  warn(
    bindings: {
      event: 'geocoding_upstream_failed' | 'upstream_saturation' | 'redis_unavailable';
      failureKind?: GeocodingFailure['kind'];
      upstreamStatus?: number;
    },
    message: string,
  ): void;
}>;

export type LocationSearchService = Readonly<{
  search(canonicalQuery: string, logger?: LocationSearchLogger): Promise<readonly Location[]>;
}>;

export function createLocationSearchService(
  dependencies: Readonly<{
    client: GeocodingClient;
    cache: Cache<string, readonly Location[]>;
    sharedCache?: RedisCache<readonly Location[]>;
    singleFlight: SingleFlight;
    executor: BoundedExecutor;
  }>,
): LocationSearchService {
  const { client, cache, sharedCache, singleFlight, executor } = dependencies;

  return {
    async search(canonicalQuery, logger) {
      const key = locationCacheKey(canonicalQuery);
      try {
        if (sharedCache) {
          return await singleFlight.run(key, () =>
            sharedCache.getOrLoad(
              key,
              LOCATION_TTL_MS,
              () => executor.run(() => client.search(canonicalQuery), logger),
              logger,
            ),
          );
        }
        const cached = cache.get(key, logger);
        if (cached !== undefined) return cached;

        return await singleFlight.run(key, async () => {
          const rechecked = cache.get(key, logger);
          if (rechecked !== undefined) return rechecked;

          const locations = await executor.run(() => client.search(canonicalQuery), logger);
          cache.set(key, locations, { ttlMs: LOCATION_TTL_MS });
          return locations;
        });
      } catch (failure) {
        if (failure instanceof UpstashUnavailable) {
          logger?.warn({ event: 'redis_unavailable' }, 'redis unavailable');
          throw new ApiError('SERVICE_UNAVAILABLE');
        }
        if (!(failure instanceof GeocodingFailure)) throw failure;

        logger?.warn(
          {
            event: 'geocoding_upstream_failed',
            failureKind: failure.kind,
            ...(failure.kind === 'status' && failure.upstreamStatus !== undefined
              ? { upstreamStatus: failure.upstreamStatus }
              : {}),
          },
          'geocoding upstream failed',
        );
        throw new ApiError('SERVICE_UNAVAILABLE');
      }
    },
  };
}
