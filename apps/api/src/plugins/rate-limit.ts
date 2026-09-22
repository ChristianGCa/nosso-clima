import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config/env.js';
import { ApiError } from '../errors/api-error.js';

type GlobalRateLimitConfig = Readonly<Pick<AppConfig, 'apiRateLimitMax' | 'apiRateLimitWindowMs'>>;

export function registerRateLimit(app: FastifyInstance, config: GlobalRateLimitConfig): void {
  app.register(rateLimit, { global: false });
  app.after((error) => {
    if (error) {
      throw error;
    }

    const checkGlobalRateLimit = app.createRateLimit({
      max: config.apiRateLimitMax,
      timeWindow: config.apiRateLimitWindowMs,
    });

    app.addHook('onRequest', async (request, reply) => {
      const result = await checkGlobalRateLimit(request);
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
          requestId: request.id,
          scope: 'global',
        },
        'request rate limited',
      );
      throw new ApiError('RATE_LIMITED');
    });
  });
}
