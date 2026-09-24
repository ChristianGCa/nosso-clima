import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import { ApiError } from '../errors/api-error.js';
import { sendPublicError } from '../errors/error-handler.js';
import { ForecastResponseSchema } from '../forecast/forecast-contract.js';
import { parseForecastQuery } from '../forecast/forecast-query.js';
import type { ForecastService } from '../forecast/forecast-service.js';
import { RATE_LIMIT_GROUP } from '../plugins/rate-limit.js';

// preValidation checks the raw keys and replaces request.query with canonical values.
// This schema validates that canonical shape before the handler runs.
const ForecastQuerySchema = Type.Object(
  {
    latitude: Type.Number(),
    longitude: Type.Number(),
    timezone: Type.String(),
  },
  { additionalProperties: false },
);

export function registerForecastRoute(app: FastifyInstance, service: ForecastService): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/v1/forecast',
    {
      config: { rateLimitGroup: RATE_LIMIT_GROUP.WEATHER_FORECAST },
      async preValidation(request, reply) {
        // Inspect raw keys before Ajv can strip additional query properties.
        try {
          request.query = parseForecastQuery(request.raw.url);
        } catch (failure) {
          if (!(failure instanceof ApiError) || failure.code !== 'VALIDATION_ERROR') throw failure;
          return sendPublicError(reply, request, 'VALIDATION_ERROR', [
            { field: 'request', reason: 'invalid' },
          ]);
        }
      },
      schema: {
        querystring: ForecastQuerySchema,
        response: { 200: ForecastResponseSchema },
      },
    },
    async (request) => {
      return service.get(request.query, request.log);
    },
  );
}
