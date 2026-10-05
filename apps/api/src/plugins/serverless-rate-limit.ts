import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ApiError } from '../errors/api-error.js';
import {
  createSharedVisitorLimit,
  type SharedVisitorDecision,
} from '../infrastructure/shared-visitor-limit.js';
import type { UpstashRestClient } from '../infrastructure/upstash-rest.js';
import {
  createVisitorIdentity,
  InvalidVisitorIdentity,
  type VisitorIdentity,
} from '../infrastructure/visitor-identity.js';
import { createVisitorPreLimit, type VisitorGroup } from '../infrastructure/visitor-pre-limit.js';

export type ServerlessRateLimitOptions = Readonly<{
  redis: UpstashRestClient;
  hmacKey: string;
}>;

export function registerServerlessRateLimit(
  app: FastifyInstance,
  options: ServerlessRateLimitOptions,
  onGlobalReady: (check: (request: FastifyRequest, reply: FastifyReply) => Promise<void>) => void,
): void {
  const identify = createVisitorIdentity(options.hmacKey);
  const preLimit = createVisitorPreLimit();
  const shared = createSharedVisitorLimit(options.redis);

  const enforce = async (request: FastifyRequest, reply: FastifyReply, group?: VisitorGroup) => {
    if (request.routeOptions.url === '/health') return;
    let identity: VisitorIdentity;
    try {
      identity = identify(request.headers['x-vercel-forwarded-for']);
    } catch (failure) {
      if (!(failure instanceof InvalidVisitorIdentity)) throw failure;
      request.log.warn({ event: 'visitor_identity_unavailable' }, 'visitor identity unavailable');
      throw new ApiError('SERVICE_UNAVAILABLE');
    }
    if (!preLimit.check(identity, group)) {
      request.log.warn({ event: 'rate_limit_rejected', source: 'local' }, 'request rate limited');
      throw new ApiError('RATE_LIMITED');
    }
    let decision: SharedVisitorDecision;
    try {
      decision = await shared.check(identity, group);
    } catch {
      request.log.warn({ event: 'visitor_limit_unavailable' }, 'visitor limit unavailable');
      throw new ApiError('SERVICE_UNAVAILABLE');
    }
    if (decision.kind === 'rejected') {
      reply.header('retry-after', decision.retryAfter);
      request.log.warn(
        { event: 'rate_limit_rejected', source: 'shared', scope: decision.scope },
        'request rate limited',
      );
      throw new ApiError('RATE_LIMITED');
    }
  };

  onGlobalReady((request, reply) => enforce(request, reply));
  app.addHook('onRequest', async (request, reply) => {
    await enforce(request, reply, request.routeOptions.config.rateLimitGroup);
  });
}
