import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export function registerRequestContext(app: FastifyInstance): void {
  app.addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id);
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    logRequestCompletion(request, reply);
    done();
  });
}

export function logRequestCompletion(request: FastifyRequest, reply: FastifyReply): void {
  request.log.info(
    {
      event: 'request_completed',
      method: request.method,
      route: request.is404 ? 'unmatched' : (request.routeOptions.url ?? 'unmatched'),
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime,
    },
    'request completed',
  );
}
