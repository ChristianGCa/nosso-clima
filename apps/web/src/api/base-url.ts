export function resolveApiBaseUrl(
  configured: string | undefined,
  production: boolean,
  ownOrigin: string | undefined,
): string {
  if (configured === undefined || (!production && configured === '')) return '';
  if (!production) return configured.replace(/\/$/, '');

  try {
    if (configured !== configured.trim() || !ownOrigin) throw new Error();
    const url = new URL(configured);
    const own = new URL(ownOrigin);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const loopback =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.startsWith('127.') ||
      hostname === '[::1]';
    if (
      url.protocol !== 'https:' ||
      own.protocol !== 'https:' ||
      loopback ||
      url.origin !== own.origin ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      own.pathname !== '/' ||
      own.search ||
      own.hash
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error('Invalid VITE_API_BASE_URL');
  }
}
