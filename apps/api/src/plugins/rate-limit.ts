import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from '../config/env.js';
import { ApiError } from '../errors/api-error.js';

type GlobalRateLimitConfig = Readonly<Pick<AppConfig, 'apiRateLimitMax' | 'apiRateLimitWindowMs'>>;
type RateLimitCheck = ReturnType<FastifyInstance['createRateLimit']>;

export const RATE_LIMIT_GROUP = {
  LOCATION_SEARCH: 'location-search',
  WEATHER_FORECAST: 'weather-forecast',
} as const;

export type RateLimitGroup = (typeof RATE_LIMIT_GROUP)[keyof typeof RATE_LIMIT_GROUP];

declare module 'fastify' {
  interface FastifyContextConfig {
    rateLimitGroup?: RateLimitGroup;
  }
}

const GROUP_RATE_LIMIT_MAX: Readonly<Record<RateLimitGroup, number>> = {
  [RATE_LIMIT_GROUP.LOCATION_SEARCH]: 30,
  [RATE_LIMIT_GROUP.WEATHER_FORECAST]: 15,
};
const GROUP_RATE_LIMIT_WINDOW_MS = 60_000;

export function registerRateLimit(
  app: FastifyInstance,
  config: GlobalRateLimitConfig,
  onGlobalReady?: (check: (request: FastifyRequest, reply: FastifyReply) => Promise<void>) => void,
): void {
  app.register(rateLimit, { global: false });
  app.after((error) => {
    if (error) {
      throw error;
    }

    const checkGlobalRateLimit = app.createRateLimit({
      max: config.apiRateLimitMax,
      timeWindow: config.apiRateLimitWindowMs,
    });
    onGlobalReady?.((request, reply) =>
      enforceRateLimit(checkGlobalRateLimit, request, reply, 'global'),
    );
    const checkGroupRateLimit: Readonly<Record<RateLimitGroup, RateLimitCheck>> = {
      [RATE_LIMIT_GROUP.LOCATION_SEARCH]: app.createRateLimit({
        max: GROUP_RATE_LIMIT_MAX[RATE_LIMIT_GROUP.LOCATION_SEARCH],
        timeWindow: GROUP_RATE_LIMIT_WINDOW_MS,
      }),
      [RATE_LIMIT_GROUP.WEATHER_FORECAST]: app.createRateLimit({
        max: GROUP_RATE_LIMIT_MAX[RATE_LIMIT_GROUP.WEATHER_FORECAST],
        timeWindow: GROUP_RATE_LIMIT_WINDOW_MS,
      }),
    };

    app.addHook('onRequest', async (request, reply) => {
      await enforceRateLimit(checkGlobalRateLimit, request, reply, 'global');

      const group = request.routeOptions.config.rateLimitGroup;
      if (group !== undefined) {
        await enforceRateLimit(checkGroupRateLimit[group], request, reply, group);
      }
    });
  });
}

async function enforceRateLimit(
  checkRateLimit: RateLimitCheck,
  request: FastifyRequest,
  reply: FastifyReply,
  scope: 'global' | RateLimitGroup,
): Promise<void> {
  const result = await checkRateLimit(request);
  if (result.isAllowed) {
    return;
  }

  reply.headers({
    'x-ratelimit-limit': result.max,
    'x-ratelimit-remaining': result.remaining,
    'x-ratelimit-reset': result.ttlInSeconds,
  });

  if (!result.isExceeded) {
    return;
  }

  reply.header('retry-after', result.ttlInSeconds);
  request.log.warn(
    {
      event: 'rate_limit_rejected',
      scope,
    },
    'request rate limited',
  );
  throw new ApiError('RATE_LIMITED');
}
