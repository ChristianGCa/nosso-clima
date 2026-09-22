import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

import { ApiError } from '../errors/api-error.js';

export function registerCors(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  app.addHook('onRequest', (request, _reply, done) => {
    const isMalformedPreflight =
      request.method === 'OPTIONS' &&
      (!request.headers.origin || !request.headers['access-control-request-method']);

    if (isMalformedPreflight) {
      done(new ApiError('VALIDATION_ERROR'));
      return;
    }

    done();
  });

  app.register(cors, {
    origin: [...allowedOrigins],
    methods: ['GET'],
    allowedHeaders: [],
    strictPreflight: false,
  });
}
