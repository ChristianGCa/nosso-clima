import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

export const REQUEST_BODY_LIMIT_BYTES = 16 * 1024;

export function registerSecurity(app: FastifyInstance): void {
  app.register(helmet, { global: true });
  app.addHook('onSend', (_request, reply, payload, done) => {
    reply.header('Cache-Control', 'private, no-store');
    reply.header('Vercel-CDN-Cache-Control', 'no-store');
    done(null, payload);
  });
}
