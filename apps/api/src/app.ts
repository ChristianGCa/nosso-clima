import fastify, { type FastifyInstance, type FastifyServerOptions, LogController } from 'fastify';

import { type AppConfig, parseEnvironment } from './config/env.js';
import { registerErrorHandlers } from './errors/error-handler.js';
import { registerCors } from './plugins/cors.js';
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
  const app = fastify({
    ...serverOptions,
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
    requestIdHeader: false,
    trustProxy: config.trustProxy,
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
  });

  registerRequestContext(app);
  registerErrorHandlers(app);
  registerSecurity(app);
  registerCors(app, config.corsAllowedOrigins);
  registerHealthRoute(app);
  registerRoutes?.(app);

  return app;
}
