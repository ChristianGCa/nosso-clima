import { isIP } from 'node:net';

const revalidate = 'public, max-age=0, must-revalidate';
const apiNoStore = [
  { key: 'Cache-Control', value: 'private, no-store' },
  { key: 'x-vercel-enable-rewrite-caching', value: '0' },
];

function apiOrigin(environment) {
  try {
    const configured = environment.API_ORIGIN;
    if (!configured || configured !== configured.trim()) throw new Error();
    const url = new URL(configured);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const privateTarget =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      isIP(host.replace(/^\[|\]$/g, '')) !== 0;
    const webOrigin =
      environment.WEB_ORIGIN ??
      (environment.VERCEL_URL ? `https://${environment.VERCEL_URL}` : undefined);
    if (
      url.protocol !== 'https:' ||
      privateTarget ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (webOrigin && url.origin === new URL(webOrigin).origin)
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error('Invalid API_ORIGIN');
  }
}

export function createWebVercelConfig(environment) {
  const origin = apiOrigin(environment);
  return {
    framework: 'vite',
    outputDirectory: 'dist',
    rewrites: [
      { source: '/api', destination: `${origin}/api` },
      { source: '/api/(.*)', destination: `${origin}/api/$1` },
    ],
    headers: [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'",
          },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      { source: '/api', headers: apiNoStore },
      { source: '/api/(.*)', headers: apiNoStore },
      {
        source: '/assets/(.*)-([A-Za-z0-9_-]{8,})\\.(js|css|svg|webp|png)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      ...[
        '/',
        '/index.html',
        '/apple-touch-icon.png',
        '/code-license.txt',
        '/favicon.ico',
        '/favicon.svg',
        '/icon-192.png',
        '/icon-512.png',
        '/site.webmanifest',
        '/third-party-licenses.txt',
      ].map((source) => ({ source, headers: [{ key: 'Cache-Control', value: revalidate }] })),
    ],
  };
}

export const config = createWebVercelConfig(process.env);
