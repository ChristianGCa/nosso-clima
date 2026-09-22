import type { ApiErrorCode } from '../schemas/errors.js';

type ErrorDefinition = Readonly<{
  statusCode: number;
  message: string;
}>;

export const ERROR_DEFINITIONS = {
  VALIDATION_ERROR: { statusCode: 400, message: 'Invalid request' },
  NOT_FOUND: { statusCode: 404, message: 'Resource not found' },
  RATE_LIMITED: { statusCode: 429, message: 'Too many requests' },
  SERVICE_UNAVAILABLE: { statusCode: 503, message: 'Service temporarily unavailable' },
  INTERNAL_ERROR: { statusCode: 500, message: 'Internal server error' },
} as const satisfies Record<ApiErrorCode, ErrorDefinition>;

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode) {
    const definition = ERROR_DEFINITIONS[code];
    super(definition.message);
    this.name = 'ApiError';
    this.code = code;
  }
}
