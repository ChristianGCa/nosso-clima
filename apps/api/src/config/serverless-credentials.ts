import type { EnvironmentInput } from './env.js';

export function assertServerlessCredentials(environment: EnvironmentInput): void {
  const redisUrl = environment.UPSTASH_REDIS_REST_URL;
  if (!redisUrl || redisUrl !== redisUrl.trim()) {
    throw new Error('Invalid UPSTASH_REDIS_REST_URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error('Invalid UPSTASH_REDIS_REST_URL');
  }

  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Invalid UPSTASH_REDIS_REST_URL');
  }

  const token = environment.UPSTASH_REDIS_REST_TOKEN;
  if (!token || /\s/.test(token)) {
    throw new Error('Invalid UPSTASH_REDIS_REST_TOKEN');
  }

  const hmacKey = environment.RATE_LIMIT_HMAC_KEY;
  if (!hmacKey || !/^[0-9a-f]{64}$/i.test(hmacKey)) {
    throw new Error('Invalid RATE_LIMIT_HMAC_KEY');
  }
}
