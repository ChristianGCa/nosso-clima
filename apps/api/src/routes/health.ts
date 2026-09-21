import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { type Static, Type } from 'typebox';

const HealthResponseSchema = Type.Object(
  {
    status: Type.Literal('ok'),
  },
  { additionalProperties: false },
);

export type HealthResponse = Static<typeof HealthResponseSchema>;

export function registerHealthRoute(app: FastifyInstance): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/health',
    {
      schema: {
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    (): HealthResponse => ({ status: 'ok' }),
  );
}
