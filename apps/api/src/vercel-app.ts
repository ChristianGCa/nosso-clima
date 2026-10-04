import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { type AppConfig, type EnvironmentInput, parseEnvironment } from './config/env.js';

const denyUnreservedFetch: typeof fetch = async () => {
  throw new Error('Unreserved provider request blocked');
};

export function createVercelApp(
  environment: EnvironmentInput,
  fetchImpl: typeof fetch = denyUnreservedFetch,
): FastifyInstance {
  let config: AppConfig;
  try {
    if (!environment.NODE_ENV) {
      throw new Error('NODE_ENV is required');
    }
    config = parseEnvironment(environment);
  } catch {
    throw new Error('Invalid API configuration');
  }

  return buildApp({
    config,
    fetchImpl,
    logger: { level: config.logLevel },
  });
}
