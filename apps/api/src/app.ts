import fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

export type BuildAppOptions = Readonly<FastifyServerOptions>;

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  return fastify(options);
}
