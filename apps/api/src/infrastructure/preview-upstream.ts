import { isIP } from 'node:net';

import type { EnvironmentInput } from '../config/env.js';
import { createOpenMeteoTransport } from './open-meteo-transport.js';

export function createPreviewUpstream(
  environment: EnvironmentInput,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  const rawBase = environment.UPSTREAM_TEST_BASE;
  const token = environment.UPSTREAM_TEST_TOKEN;
  if (rawBase === undefined && token === undefined) return fetchImpl;

  let base: URL;
  try {
    if (
      environment.VERCEL_ENV !== 'preview' ||
      !rawBase ||
      rawBase !== rawBase.trim() ||
      !token ||
      !/^[\w-]{32,256}$/.test(token)
    )
      throw new Error('Invalid configuration');
    base = new URL(rawBase);
    const hostname = base.hostname.toLowerCase().replace(/\.$/, '');
    if (
      base.protocol !== 'https:' ||
      base.username ||
      base.password ||
      base.port ||
      base.pathname !== '/' ||
      base.search ||
      base.hash ||
      !hostname.includes('.') ||
      hostname.endsWith('.open-meteo.com') ||
      hostname.endsWith('.localhost') ||
      isIP(hostname) !== 0 ||
      hostname.startsWith('[')
    )
      throw new Error('Invalid destination');
  } catch {
    throw new Error('Invalid Preview upstream configuration');
  }

  // This wrapper remains behind the normal provider allowlist, circuit and reservation.
  return createOpenMeteoTransport((input, init) => {
    if (!(input instanceof URL)) throw new Error('Blocked Preview upstream request');
    const destination = new URL(input.pathname + input.search, base);
    return fetchImpl(destination, {
      method: 'GET',
      redirect: 'error',
      ...(init?.signal ? { signal: init.signal } : {}),
      headers: { authorization: `Bearer ${token}` },
    });
  });
}
