import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const capturedForecast = JSON.parse(
  readFileSync(
    new URL('../apps/api/test/fixtures/open-meteo-forecast.json', import.meta.url),
    'utf8',
  ),
);
const modes = new Set(['normal', 'rate_limited', 'oversized', 'timeout']);
const calibrationHeaders = [
  'x-forwarded-for',
  'x-vercel-forwarded-for',
  'forwarded',
  'cf-connecting-ip',
  'cf-connecting-ipv6',
  'x-real-ip',
  'true-client-ip',
];

function canonicalIp(value) {
  if (isIP(value) === 6) {
    const canonical = new URL(`http://[${value}]/`).hostname.toLowerCase();
    const mapped = canonical.match(/^\[::ffff:([\da-f]+):([\da-f]+)\]$/);
    if (!mapped) return canonical;
    const high = Number.parseInt(mapped[1], 16);
    const low = Number.parseInt(mapped[2], 16);
    return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
  }
  return isIP(value) === 4 ? value : undefined;
}

export function createEchoHandler({ token, visitorIps, canary }) {
  if (
    !/^[\w-]{32,256}$/.test(token ?? '') ||
    !Array.isArray(visitorIps) ||
    !visitorIps.length ||
    visitorIps.some((ip) => !canonicalIp(ip)) ||
    !/^[\w-]{8,100}$/.test(canary ?? '')
  ) {
    throw new Error('Invalid echo configuration');
  }
  const expectedAuthorization = Buffer.from(`Bearer ${token}`);
  const sentinels = new Set([...visitorIps, '198.51.100.77'].map(canonicalIp));
  const stats = { calls: { geocoding: 0, forecast: 0 }, visitorIpSeen: false, canarySeen: false };
  let mode = 'normal';
  function send(res, status, payload) {
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(JSON.stringify(payload));
  }
  async function handle(req, res) {
    const authorization = Buffer.from(req.headers.authorization ?? '');
    if (
      authorization.length !== expectedAuthorization.length ||
      !timingSafeEqual(authorization, expectedAuthorization)
    ) {
      send(res, 401, { error: 'unauthorized' });
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__probe/calibrate' && req.method === 'GET') {
      // Positive controls use a public documentation IP, never a visitor value.
      send(res, 200, {
        kind: 'nosso-clima-ingress-calibration-v1',
        canaryPreserved: req.headers['x-test-canary'] === canary,
        headers: Object.fromEntries(
          calibrationHeaders.map((name) => [
            name,
            String(req.headers[name] ?? '').includes(
              name === 'cf-connecting-ipv6' ? '2001:db8::77' : '198.51.100.77',
            ),
          ]),
        ),
      });
      return;
    }
    if (url.pathname === '/__probe/report' && req.method === 'GET') {
      send(res, 200, { kind: 'nosso-clima-preview-echo-v1', mode, ...stats });
      return;
    }
    if (url.pathname === '/__probe/config' && req.method === 'POST') {
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024) throw new Error('Invalid control');
        chunks.push(chunk);
      }
      const config = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!config || Object.keys(config).length !== 1 || !modes.has(config.mode)) {
        send(res, 400, { error: 'invalid_control' });
        return;
      }
      mode = config.mode;
      send(res, 200, { mode });
      return;
    }
    if (req.method !== 'GET') {
      send(res, 405, { error: 'method' });
      return;
    }
    const service =
      url.pathname === '/v1/search'
        ? 'geocoding'
        : url.pathname === '/v1/forecast'
          ? 'forecast'
          : undefined;
    if (!service) {
      send(res, 404, { error: 'not_found' });
      return;
    }
    if (stats.calls.geocoding + stats.calls.forecast >= 200) {
      send(res, 503, { error: 'sample_limit' });
      return;
    }
    stats.calls[service] += 1;
    // Inspect in memory; never retain or echo headers, query, IP or authorization.
    const values = [decodeURIComponent(req.url), ...req.rawHeaders];
    stats.canarySeen ||= values.some((value) => value.includes(canary));
    stats.visitorIpSeen ||= values.some((value) =>
      (value.match(/[\da-fA-F:.]+/g) ?? []).some((candidate) =>
        sentinels.has(canonicalIp(candidate)),
      ),
    );
    const responseMode = mode;
    if (responseMode === 'timeout') await delay(6000);
    if (responseMode === 'rate_limited') {
      send(res, 429, { error: 'fixture_rate_limit' });
      return;
    }
    if (responseMode === 'oversized') {
      send(res, 200, { fixture: 'x'.repeat(65537) });
      return;
    }
    if (service === 'geocoding') {
      send(res, 200, {
        results: [
          {
            id: 3448439,
            name: 'Fixture São Paulo',
            country: 'Brasil',
            country_code: 'BR',
            latitude: -23.548,
            longitude: -46.636,
            timezone: 'America/Sao_Paulo',
            feature_code: 'PPLA',
          },
        ],
      });
      return;
    }
    send(res, 200, {
      ...capturedForecast,
      timezone: url.searchParams.get('timezone') ?? capturedForecast.timezone,
      hourly_units: { time: 'iso8601', weather_code: 'wmo code' },
      hourly: {
        time: capturedForecast.daily.time.flatMap((date) =>
          Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, '0')}:00`),
        ),
        weather_code: capturedForecast.daily.weather_code.flatMap((code) => Array(24).fill(code)),
      },
    });
  }
  return (req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent && !res.destroyed) send(res, 400, { error: 'invalid_request' });
    });
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const port = Number(process.env.PROBE_ECHO_PORT ?? 8787);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
    const server = createServer(
      { maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000 },
      createEchoHandler({
        token: process.env.UPSTREAM_TEST_TOKEN,
        visitorIps: (process.env.PROBE_VISITOR_IPS ?? '').split(',').map((ip) => ip.trim()),
        canary: process.env.PROBE_CANARY,
      }),
    );
    server.on('error', () => {
      process.stderr.write('Echo unavailable; check local port/configuration.\n');
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () =>
      process.stdout.write(
        'Protected fixture echo ready on loopback; use an owner-controlled HTTPS ingress.\n',
      ),
    );
  } catch {
    process.stderr.write('Invalid echo configuration; no values were printed.\n');
    process.exitCode = 1;
  }
}
