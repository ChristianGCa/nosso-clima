import { type Static, Type } from 'typebox';

export const ApiErrorCodeSchema = Type.Union([
  Type.Literal('VALIDATION_ERROR'),
  Type.Literal('NOT_FOUND'),
  Type.Literal('RATE_LIMITED'),
  Type.Literal('SERVICE_UNAVAILABLE'),
  Type.Literal('INTERNAL_ERROR'),
]);

export const ApiErrorResponseSchema = Type.Object(
  {
    error: Type.Object(
      {
        code: ApiErrorCodeSchema,
        message: Type.String(),
        requestId: Type.String(),
        details: Type.Optional(
          Type.Array(
            Type.Object(
              {
                field: Type.String(),
                reason: Type.String(),
              },
              { additionalProperties: false },
            ),
          ),
        ),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ApiErrorCode = Static<typeof ApiErrorCodeSchema>;
export type ApiErrorDetail = Readonly<{
  field: string;
  reason: string;
}>;
export type ApiErrorResponse = Readonly<{
  error: Readonly<{
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: readonly ApiErrorDetail[];
  }>;
}>;
