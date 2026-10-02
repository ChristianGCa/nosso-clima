import { randomUUID } from 'node:crypto';

import fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
  LogController,
} from 'fastify';

import { type AppConfig, parseEnvironment } from './config/env.js';
import { ApiError } from './errors/api-error.js';
import { registerErrorHandlers, sendPublicError } from './errors/error-handler.js';
import { type Cache, createCache } from './infrastructure/cache.js';
import { type BoundedExecutor, createBoundedExecutor } from './infrastructure/concurrency.js';
import { createSingleFlight, type SingleFlight } from './infrastructure/single-flight.js';
import type { Location } from './locations/location-contract.js';
import { createLocationSearchService } from './locations/location-search-service.js';
import { createOpenMeteoGeocodingClient } from './locations/open-meteo-geocoding.js';
import { registerCors } from './plugins/cors.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { logRequestCompletion, registerRequestContext } from './plugins/request-context.js';
import { registerSecurity, REQUEST_BODY_LIMIT_BYTES } from './plugins/security.js';
import { registerHealthRoute } from './routes/health.js';
import { registerLocationRoute } from './routes/locations.js';
import { createForecastService } from './forecast/forecast-service.js';
import { fetchForecastJson } from './forecast/open-meteo-forecast.js';
import type { ForecastResponse } from './forecast/forecast-contract.js';
import { registerForecastRoute } from './routes/forecast.js';

export type BuildAppOptions = Readonly<
  Pick<FastifyServerOptions, 'logger' | 'loggerInstance'> & {
    config?: AppConfig;
    fetchImpl?: typeof fetch;
    registerRoutes?: (app: FastifyInstance, platform: BackendPlatformContext) => void;
  }
>;

export type BackendPlatformContext = Readonly<{
  config: AppConfig;
  createCache<Value>(namespace: 'location-search' | 'weather-forecast'): Cache<string, Value>;
  singleFlight: SingleFlight;
  executor: BoundedExecutor;
}>;

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const { config = parseEnvironment({}), fetchImpl, registerRoutes, ...serverOptions } = options;
  let checkGlobalRateLimit:
    | ((request: FastifyRequest, reply: FastifyReply) => Promise<void>)
    | undefined;
  const app = fastify({
    ...serverOptions,
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    frameworkErrors(error, request, reply) {
      reply.header('x-request-id', request.id);
      return (async () => {
        try {
          if (!checkGlobalRateLimit) {
            throw new Error('Global rate limiter is not ready');
          }
          await checkGlobalRateLimit(request, reply);
          if (error.code === 'FST_ERR_BAD_URL' || error.code === 'FST_ERR_MAX_PARAM_LENGTH') {
            sendPublicError(reply, request, 'VALIDATION_ERROR', [
              { field: 'request', reason: 'invalid' },
            ]);
          } else {
            request.log.error(
              { event: 'unexpected_error', code: 'INTERNAL_ERROR', errorType: 'Error' },
              'unexpected framework failure',
            );
            sendPublicError(reply, request, 'INTERNAL_ERROR');
          }
        } catch (failure) {
          sendPublicError(
            reply,
            request,
            failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR',
          );
        }
        logRequestCompletion(request, reply);
      })();
    },
    trustProxy: config.trustProxy,
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
  });

  registerRequestContext(app);
  registerErrorHandlers(app);
  registerSecurity(app);
  registerRateLimit(app, config, (check) => {
    checkGlobalRateLimit = check;
  });
  registerCors(app, config.corsAllowedOrigins);
  registerHealthRoute(app);
  const createdCacheNamespaces = new Set<string>();
  const platform: BackendPlatformContext = Object.freeze({
    config,
    createCache: <Value>(namespace: 'location-search' | 'weather-forecast') => {
      if (createdCacheNamespaces.has(namespace)) {
        throw new Error(`Cache namespace already initialized: ${namespace}`);
      }
      createdCacheNamespaces.add(namespace);
      return createCache<string, Value>({ maxEntries: config.cacheMaxEntries });
    },
    singleFlight: createSingleFlight(),
    executor: createBoundedExecutor({ maxConcurrency: config.upstreamMaxConcurrency }),
  });
  registerLocationRoute(
    app,
    createLocationSearchService({
      client: createOpenMeteoGeocodingClient(fetchImpl),
      cache: platform.createCache<readonly Location[]>('location-search'),
      singleFlight: platform.singleFlight,
      executor: platform.executor,
    }),
  );
  registerForecastRoute(
    app,
    createForecastService({
      client: { fetch: (location) => fetchForecastJson(location, fetchImpl) },
      cache: platform.createCache<ForecastResponse>('weather-forecast'),
      singleFlight: platform.singleFlight,
      executor: platform.executor,
    }),
  );
  registerRoutes?.(app, platform);

  return app;
}
