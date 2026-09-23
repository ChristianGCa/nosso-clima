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

    if (isBodyTooLarge(error)) {
      return sendPublicError(reply, request, 'VALIDATION_ERROR', SAFE_VALIDATION_DETAILS, 413);
    }

    if (isUnsupportedMediaType(error)) {
      return sendPublicError(reply, request, 'VALIDATION_ERROR', SAFE_VALIDATION_DETAILS, 415);
    }

    request.log.error(
      {
        event: 'unexpected_error',
        code: 'INTERNAL_ERROR',
        errorType: safeErrorType(error),
      },
      'unexpected request failure',
    );

    return sendPublicError(reply, request, 'INTERNAL_ERROR');
  });
}

export function sendPublicError(
  reply: FastifyReply,
  request: FastifyRequest,
  code: ApiErrorCode,
  details?: ApiErrorResponse['error']['details'],
  statusCode?: number,
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

  return reply.code(statusCode ?? definition.statusCode).send(response);
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

function isBodyTooLarge(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return 'code' in error && error.code === 'FST_ERR_CTP_BODY_TOO_LARGE';
}

function isUnsupportedMediaType(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE'
  );
}

function safeErrorType(error: unknown): string {
  if (error instanceof TypeError) return 'TypeError';
  if (error instanceof RangeError) return 'RangeError';
  if (error instanceof SyntaxError) return 'SyntaxError';
  if (error instanceof Error) return 'Error';
  return 'NonError';
}
