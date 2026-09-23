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
import { registerCors } from './plugins/cors.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerRequestContext } from './plugins/request-context.js';
import { registerSecurity, REQUEST_BODY_LIMIT_BYTES } from './plugins/security.js';
import { registerHealthRoute } from './routes/health.js';

export type BuildAppOptions = Readonly<
  Pick<FastifyServerOptions, 'logger' | 'loggerInstance'> & {
    config?: AppConfig;
    registerRoutes?: (app: FastifyInstance) => void;
  }
>;

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const { config = parseEnvironment({}), registerRoutes, ...serverOptions } = options;
  let checkGlobalRateLimit:
    | ((request: FastifyRequest, reply: FastifyReply) => Promise<void>)
    | undefined;
  const app = fastify({
    ...serverOptions,
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    frameworkErrors(_error, request, reply) {
      reply.header('x-request-id', request.id);
      return (async () => {
        try {
          if (!checkGlobalRateLimit) {
            throw new Error('Global rate limiter is not ready');
          }
          await checkGlobalRateLimit(request, reply);
          sendPublicError(reply, request, 'VALIDATION_ERROR', [
            { field: 'request', reason: 'invalid' },
          ]);
        } catch (failure) {
          sendPublicError(
            reply,
            request,
            failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR',
          );
        }
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
  registerRoutes?.(app);

  return app;
}
import { randomUUID } from 'node:crypto';
