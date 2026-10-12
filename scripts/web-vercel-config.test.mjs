import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.API_ORIGIN = 'https://api-preview.example.test';
const { config, createWebVercelConfig } = await import('../apps/web/vercel.mjs');
delete process.env.API_ORIGIN;

test('requires a public HTTPS API origin and rejects self rewrites', () => {
  for (const origin of [
    undefined,
    '',
    'http://api.example.test',
    'https://localhost',
    'https://127.0.0.1',
    'https://169.254.169.254',
    'https://10.0.0.1',
    'https://[::1]',
    'https://user:pass@api.example.test',
    'https://api.example.test/path',
    'https://api.example.test?x=1',
    'https://api.example.test#fragment',
    'https://web.example.test',
  ]) {
    assert.throws(
      () => createWebVercelConfig({ API_ORIGIN: origin, WEB_ORIGIN: 'https://web.example.test' }),
      /Invalid API_ORIGIN/,
    );
  }
});

test('rewrites every API path to the paired API origin, including unknown paths', () => {
  assert.deepEqual(config.rewrites, [
    { source: '/api', destination: 'https://api-preview.example.test/api' },
    { source: '/api/(.*)', destination: 'https://api-preview.example.test/api/$1' },
  ]);
  assert.equal(config.framework, 'vite');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(
    config.installCommand,
    'node --version && npx --yes npm@12.0.2 --version && npx --yes npm@12.0.2 ci --include=dev',
  );
});

test('web headers limit connection origins and cache only hashed Vite assets immutably', () => {
  const all = config.headers.find(({ source }) => source === '/(.*)');
  assert.ok(all);
  const value = (rule, key) => rule.headers.find((header) => header.key === key)?.value;
  assert.match(value(all, 'Content-Security-Policy'), /connect-src 'self'/);
  assert.match(value(all, 'Strict-Transport-Security'), /max-age=31536000/);
  assert.equal(value(all, 'X-Content-Type-Options'), 'nosniff');
  assert.equal(value(all, 'Referrer-Policy'), 'no-referrer');

  const hashed = config.headers.find(
    ({ source }) => source.startsWith('/assets/') && source.includes('{8,}'),
  );
  assert.ok(hashed);
  assert.match('/assets/index-DbvNA-_g.js', new RegExp(`^${hashed.source}$`));
  assert.doesNotMatch('/assets/logo.svg', new RegExp(`^${hashed.source}$`));
  assert.match(value(hashed, 'Cache-Control'), /immutable/);

  const root = config.headers.find(({ source }) => source === '/');
  const html = config.headers.find(({ source }) => source === '/index.html');
  assert.match(value(root, 'Cache-Control'), /must-revalidate/);
  assert.match(value(html, 'Cache-Control'), /must-revalidate/);
  for (const source of ['/favicon.ico', '/favicon.svg', '/site.webmanifest']) {
    const rule = config.headers.find((candidate) => candidate.source === source);
    assert.match(value(rule, 'Cache-Control'), /must-revalidate/);
  }
});

test('rewrite responses explicitly bypass CDN cache', () => {
  for (const source of ['/api', '/api/(.*)']) {
    const rule = config.headers.find((candidate) => candidate.source === source);
    assert.ok(rule);
    assert.equal(
      rule.headers.find(({ key }) => key === 'Cache-Control')?.value,
      'private, no-store',
    );
    assert.equal(
      rule.headers.find(({ key }) => key === 'x-vercel-enable-rewrite-caching')?.value,
      '0',
    );
  }
});
