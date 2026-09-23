import type { FastifyInstance } from 'fastify';

export function registerRequestContext(app: FastifyInstance): void {
  app.addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id);
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      {
        event: 'request_completed',
        method: request.method,
        route: request.is404 ? 'unmatched' : request.routeOptions.url,
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
      },
      'request completed',
    );
    done();
  });
}
