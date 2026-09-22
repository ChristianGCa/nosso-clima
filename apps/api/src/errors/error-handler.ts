import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { ApiErrorCode, ApiErrorResponse } from '../schemas/errors.js';
import { ApiError, ERROR_DEFINITIONS } from './api-error.js';

const SAFE_VALIDATION_DETAILS = [{ field: 'request', reason: 'invalid' }] as const;

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => sendPublicError(reply, request, 'NOT_FOUND'));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return sendPublicError(reply, request, error.code);
    }

    if (isValidationFailure(error)) {
      return sendPublicError(reply, request, 'VALIDATION_ERROR', SAFE_VALIDATION_DETAILS);
    }

    request.log.error(
      {
        event: 'unexpected_error',
        requestId: request.id,
        code: 'INTERNAL_ERROR',
      },
      'unexpected request failure',
    );

    return sendPublicError(reply, request, 'INTERNAL_ERROR');
  });
}

function sendPublicError(
  reply: FastifyReply,
  request: FastifyRequest,
  code: ApiErrorCode,
  details?: ApiErrorResponse['error']['details'],
): FastifyReply {
  const definition = ERROR_DEFINITIONS[code];
  const response: ApiErrorResponse = {
    error: {
      code,
      message: definition.message,
      requestId: request.id,
      ...(details === undefined ? {} : { details }),
    },
  };

  return reply.code(definition.statusCode).send(response);
}

function isValidationFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const possibleValidationError = error as {
    validation?: unknown;
    statusCode?: unknown;
  };

  return (
    possibleValidationError.validation !== undefined || possibleValidationError.statusCode === 400
  );
}
