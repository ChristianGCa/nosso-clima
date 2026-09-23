import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';
import { type Static, Type } from 'typebox';

import {
  LOCATION_ATTRIBUTION,
  LocationSearchResponseSchema,
} from '../locations/location-contract.js';
import { parseLocationQuery } from '../locations/location-query.js';
import type { LocationSearchService } from '../locations/location-search-service.js';
import { RATE_LIMIT_GROUP } from '../plugins/rate-limit.js';

const LocationQuerySchema = Type.Object({ query: Type.String() }, { additionalProperties: false });

export function registerLocationRoute(app: FastifyInstance, service: LocationSearchService): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/v1/locations',
    {
      config: { rateLimitGroup: RATE_LIMIT_GROUP.LOCATION_SEARCH },
      async preValidation(request) {
        // Inspect raw keys before Ajv can remove additional query properties.
        parseLocationQuery(request.raw.url);
      },
      schema: {
        querystring: LocationQuerySchema,
        response: { 200: LocationSearchResponseSchema },
      },
    },
    async (request): Promise<Static<typeof LocationSearchResponseSchema>> => ({
      locations: [...(await service.search(parseLocationQuery(request.raw.url), request.log))],
      attribution: LOCATION_ATTRIBUTION,
    }),
  );
}
