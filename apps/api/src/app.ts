import fastify, { type FastifyInstance, type FastifyServerOptions, LogController } from 'fastify';

import { registerRequestContext } from './plugins/request-context.js';
import { registerHealthRoute } from './routes/health.js';

export type BuildAppOptions = Readonly<Pick<FastifyServerOptions, 'logger' | 'loggerInstance'>>;

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = fastify({
    ...options,
    requestIdHeader: false,
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
  });

  registerRequestContext(app);
  registerHealthRoute(app);

  return app;
}
