import fastify, { type FastifyInstance, type FastifyServerOptions, LogController } from 'fastify';

import { registerErrorHandlers } from './errors/error-handler.js';
import { registerRequestContext } from './plugins/request-context.js';
import { registerHealthRoute } from './routes/health.js';

export type BuildAppOptions = Readonly<
  Pick<FastifyServerOptions, 'logger' | 'loggerInstance'> & {
    registerRoutes?: (app: FastifyInstance) => void;
  }
>;

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const { registerRoutes, ...serverOptions } = options;
  const app = fastify({
    ...serverOptions,
    requestIdHeader: false,
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
  });

  registerRequestContext(app);
  registerErrorHandlers(app);
  registerHealthRoute(app);
  registerRoutes?.(app);

  return app;
}
