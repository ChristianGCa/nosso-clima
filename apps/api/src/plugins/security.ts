import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

export const REQUEST_BODY_LIMIT_BYTES = 16 * 1024;

export function registerSecurity(app: FastifyInstance): void {
  app.register(helmet, { global: true });
}
