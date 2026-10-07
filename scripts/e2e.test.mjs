import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { preview } from 'vite';

import {
  ACQUIRE_CACHE_LOCK_SCRIPT,
  READ_CACHE_SCRIPT,
  RELEASE_CACHE_LOCK_SCRIPT,
  WRITE_CACHE_SCRIPT,
} from '../apps/api/dist/infrastructure/redis-cache.js';
import { RESERVE_QUOTA_SCRIPT } from '../apps/api/dist/infrastructure/quota-reservation.js';
import { SHARED_VISITOR_LIMIT_SCRIPT } from '../apps/api/dist/infrastructure/shared-visitor-limit.js';
import { CHECK_CIRCUIT_SCRIPT } from '../apps/api/dist/infrastructure/upstream-circuit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(root, 'apps/web');
const capturedForecast = JSON.parse(
  await readFile(path.join(root, 'apps/api/test/fixtures/open-meteo-forecast.json'), 'utf8'),
);
const forecastFixture = {
  ...capturedForecast,
  hourly_units: { time: 'iso8601', weather_code: 'wmo code' },
  hourly: {
    time: capturedForecast.daily.time.flatMap((date) =>
      Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, '0')}:00`),
    ),
    weather_code: capturedForecast.daily.weather_code.flatMap((code) => Array(24).fill(code)),
  },
};

const locations = {
  sao: {
    id: 3448439,
    name: 'São Paulo',
    admin1: 'São Paulo',
    country: 'Brasil',
    country_code: 'BR',
    latitude: -23.548,
    longitude: -46.636,
    timezone: 'America/Sao_Paulo',
    feature_code: 'PPLA',
  },
  rio: {
    id: 3451190,
    name: 'Rio de Janeiro',
    admin1: 'Rio de Janeiro',
    country: 'Brasil',
    country_code: 'BR',
    latitude: -22.906,
    longitude: -43.172,
    timezone: 'America/Sao_Paulo',
    feature_code: 'PPLA',
  },
  curitiba: {
    id: 3464975,
    name: 'Curitiba',
    admin1: 'Paraná',
    country: 'Brasil',
    country_code: 'BR',
    latitude: -25.429,
    longitude: -49.271,
    timezone: 'America/Sao_Paulo',
    feature_code: 'PPLA',
  },
  niteroi: {
    id: 3456283,
    name: 'Niterói',
    admin1: 'Rio de Janeiro',
    country: 'Brasil',
    country_code: 'BR',
    latitude: -22.883,
    longitude: -43.103,
    timezone: 'America/Sao_Paulo',
    feature_code: 'PPLA',
  },
};

const environment = {
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  LOG_LEVEL: 'silent',
  CORS_ALLOWED_ORIGINS: 'https://web.example.test',
  UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.test',
  UPSTASH_REDIS_REST_TOKEN: 'fixture-only-no-service',
  RATE_LIMIT_HMAC_KEY: 'ab'.repeat(32),
  CACHE_HMAC_KEY: 'cd'.repeat(32),
  OPEN_METEO_MINUTE_CREDITS: '10000',
  OPEN_METEO_HOUR_CREDITS: '50000',
  OPEN_METEO_DAY_CREDITS: '100000',
  OPEN_METEO_MONTH_CREDITS: '200000',
  OPEN_METEO_GEOCODING_CREDITS: '1000',
  OPEN_METEO_FORECAST_CREDITS: '2000',
  OPEN_METEO_429_COOLDOWN_MS: '60000',
  OPEN_METEO_PROBE_MS: '10000',
};

function createFixture() {
  const entries = new Map();
  const locks = new Map();
  const providerCalls = [];
  const outboundHeaders = [];
  let rejectNextVisitor = false;
  let failSearchOnce = false;
  let failForecastOnce = false;
  let delayedForecast = null;

  const redis = {
    async eval(script, keys, args) {
      if (script === SHARED_VISITOR_LIMIT_SCRIPT) {
        if (rejectNextVisitor) {
          rejectNextVisitor = false;
          return [0, 60_000, 0];
        }
        return [1, 60_000, 59];
      }
      if (script === CHECK_CIRCUIT_SCRIPT || script === RESERVE_QUOTA_SCRIPT) return 1;
      const key = keys[0];
      if (!key) throw new Error('Unexpected Redis key');
      if (script === READ_CACHE_SCRIPT) {
        const entry = entries.get(key);
        return entry && Date.now() < entry.expiresAt ? entry.value : null;
      }
      if (script === WRITE_CACHE_SCRIPT) {
        entries.set(key, { value: args[0], expiresAt: Date.now() + Number(args[1]) });
        return 'OK';
      }
      if (script === ACQUIRE_CACHE_LOCK_SCRIPT) {
        if (locks.has(key)) return 0;
        locks.set(key, args[0]);
        return 1;
      }
      if (script === RELEASE_CACHE_LOCK_SCRIPT) {
        if (locks.get(key) !== args[0]) return 0;
        locks.delete(key);
        return 1;
      }
      throw new Error('Unexpected Redis script');
    },
  };

  const providerFetch = async (input, init) => {
    const url = new URL(String(input));
    providerCalls.push(url);
    outboundHeaders.push([...new Headers(init?.headers)]);
    if (url.hostname === 'geocoding-api.open-meteo.com') {
      const query = url.searchParams.get('name')?.toLowerCase() ?? '';
      if (query.includes('falha') && failSearchOnce) {
        failSearchOnce = false;
        return new Response('fixture error', { status: 503 });
      }
      const place = query.includes('rio')
        ? locations.rio
        : query.includes('curitiba')
          ? locations.curitiba
          : query.includes('niter')
            ? locations.niteroi
            : query.includes('são') || query.includes('falha')
              ? locations.sao
              : null;
      return Response.json(place ? { results: [place] } : {});
    }
    if (url.hostname === 'api.open-meteo.com') {
      if (failForecastOnce) {
        failForecastOnce = false;
        return new Response('fixture error', { status: 503 });
      }
      if (
        delayedForecast &&
        url.searchParams.get('latitude') === String(locations.niteroi.latitude)
      ) {
        delayedForecast.started();
        await delayedForecast.release;
        delayedForecast.completed();
        delayedForecast = null;
      }
      return Response.json(forecastFixture);
    }
    throw new Error('Unexpected provider host');
  };

  return {
    redis,
    providerFetch,
    providerCalls,
    outboundHeaders,
    rejectVisitorOnce: () => {
      rejectNextVisitor = true;
    },
    failSearch: () => {
      failSearchOnce = true;
    },
    failForecast: () => {
      failForecastOnce = true;
    },
    delayNiteroi: (value) => {
      delayedForecast = value;
    },
  };
}

async function openPage(browser, origin, externalRequests) {
  const context = await browser.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    extraHTTPHeaders: {
      'x-forwarded-for': '198.51.100.77',
      'x-test-canary': 'p8-browser-canary',
    },
  });
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== origin) {
      externalRequests.push(url);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  const page = await context.newPage();
  const apiRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto(origin);
  return { context, page, apiRequests };
}

async function chooseCity(page, query, name, beforeSelect = () => {}) {
  const field = page.getByRole('combobox', { name: 'Buscar cidade' });
  await field.fill(query);
  await page.getByRole('option', { name }).waitFor();
  beforeSelect();
  await field.press('ArrowDown');
  assert.equal(await field.getAttribute('aria-activedescendant'), 'city-option-0');
  await field.press('Enter');
}

test('P8: browser, default Vercel handler and fixture provider', async (suite) => {
  const fixture = createFixture();
  const previousEnvironment = { ...process.env };
  const previousFetch = globalThis.fetch;
  let api;
  let web;
  let browser;
  const externalRequests = [];
  try {
    Object.assign(process.env, environment);
    // Match the detection expression in Vercel's official Fastify builder.
    const compiledEntry = await readFile(path.join(root, 'artifacts/vercel-entry/app.js'), 'utf8');
    assert.match(compiledEntry, /(?:from|require|import)\s*(?:\(\s*)?["']fastify["']\s*(?:\))?/);
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.origin === environment.UPSTASH_REDIS_REST_URL) {
        const [command, script, keyCount, ...parameters] = JSON.parse(init.body);
        assert.equal(command, 'EVAL');
        const result = await fixture.redis.eval(
          script,
          parameters.slice(0, keyCount),
          parameters.slice(keyCount),
        );
        return Response.json({ result });
      }
      return fixture.providerFetch(input, init);
    };
    const { default: handler } = await import('../artifacts/vercel-entry/app.js');
    assert.equal(typeof handler, 'function', 'Vercel entry must export a request handler');
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(environment)) {
      if (previousEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnvironment[key];
    }
    api = createServer((request, response) => {
      handler(request, response).catch(() => {
        response.statusCode = 500;
        response.end();
      });
    });
    api.listen(0, '127.0.0.1');
    await once(api, 'listening');
    const apiAddress = api.address();
    assert.ok(apiAddress && typeof apiAddress !== 'string');
    const apiOrigin = `http://127.0.0.1:${apiAddress.port}`;
    const health = await fetch(`${apiOrigin}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const unknown = await fetch(`${apiOrigin}/api/unknown`, {
      headers: { 'x-vercel-forwarded-for': '203.0.113.10' },
    });
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).error.code, 'NOT_FOUND');
    web = await preview({
      configFile: false,
      root: webRoot,
      preview: {
        host: '127.0.0.1',
        port: 0,
        proxy: {
          '/api': {
            target: apiOrigin,
            changeOrigin: true,
            headers: { 'x-vercel-forwarded-for': '203.0.113.10' },
          },
        },
      },
    });
    const address = web.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });

    await suite.test(
      'neutral, keyboard search, seven days, credits and restored city',
      async () => {
        const { context, page, apiRequests } = await openPage(browser, origin, externalRequests);
        try {
          await page
            .getByRole('heading', { name: 'O clima da sua cidade, sem mistério.' })
            .waitFor();
          assert.equal(fixture.providerCalls.length, 0);
          assert.equal(apiRequests.length, 0);
          await chooseCity(page, 'São', 'São Paulo, São Paulo, Brasil');
          await page.getByRole('heading', { name: 'Previsão de 7 dias' }).waitFor();
          assert.equal(await page.locator('.today-card, .day-card').count(), 7);
          await page.getByText('Dados por Open-Meteo', { exact: false }).waitFor();
          await page.getByRole('link', { name: 'CC BY 4.0' }).first().waitFor();
          assert.equal(fixture.providerCalls.length, 2);
          const searchesBeforeReload = apiRequests.filter((url) =>
            url.includes('/locations?'),
          ).length;
          assert.equal(searchesBeforeReload, 1);
          await page.reload();
          await page.getByRole('heading', { name: 'Previsão de 7 dias' }).waitFor();
          await page.getByRole('heading', { name: 'São Paulo, São Paulo, Brasil' }).waitFor();
          assert.equal(fixture.providerCalls.length, 2, 'restored city should use shared cache');
          assert.equal(
            apiRequests.filter((url) => url.includes('/locations?')).length,
            searchesBeforeReload,
            'restoring a saved city must not geocode it again',
          );
        } finally {
          await context.close();
        }
      },
    );

    await suite.test('empty search and recoverable search failure', async () => {
      const { context, page } = await openPage(browser, origin, externalRequests);
      try {
        const field = page.getByRole('combobox', { name: 'Buscar cidade' });
        await field.fill('Vazio');
        await page.getByText('Nenhuma cidade encontrada.').waitFor();
        fixture.failSearch();
        await field.fill('Falha');
        await page.getByText('A busca está temporariamente indisponível.').waitFor();
        await page.getByRole('button', { name: 'Tentar novamente' }).click();
        await page.getByRole('option', { name: 'São Paulo, São Paulo, Brasil' }).waitFor();
        await page.getByRole('link', { name: 'GeoNames' }).waitFor();
      } finally {
        await context.close();
      }
    });

    await suite.test('429, 503 and recovery in the forecast flow', async () => {
      const { context, page } = await openPage(browser, origin, externalRequests);
      try {
        await chooseCity(
          page,
          'Rio',
          'Rio de Janeiro, Rio de Janeiro, Brasil',
          fixture.rejectVisitorOnce,
        );
        await page.getByText('Muitas consultas agora. Tente novamente em instantes.').waitFor();
        fixture.failForecast();
        await page.getByRole('button', { name: 'Tentar novamente' }).click();
        await page.getByText('A previsão está temporariamente indisponível.').waitFor();
        await page.getByRole('button', { name: 'Tentar novamente' }).click();
        await page.getByRole('heading', { name: 'Previsão de 7 dias' }).waitFor();
      } finally {
        await context.close();
      }
    });

    await suite.test(
      'late response from a previous city does not replace the current one',
      async () => {
        const { context, page } = await openPage(browser, origin, externalRequests);
        let started;
        let release;
        let completed;
        const pending = new Promise((resolve) => {
          started = resolve;
        });
        const held = new Promise((resolve) => {
          release = resolve;
        });
        const finished = new Promise((resolve) => {
          completed = resolve;
        });
        fixture.delayNiteroi({ started, release: held, completed });
        try {
          await chooseCity(page, 'Niter', 'Niterói, Rio de Janeiro, Brasil');
          await pending;
          await chooseCity(page, 'Curitiba', 'Curitiba, Paraná, Brasil');
          await page.getByRole('heading', { name: 'Previsão de 7 dias' }).waitFor();
          release();
          await finished;
          await page.waitForTimeout(100);
          await page.getByRole('heading', { name: 'Curitiba, Paraná, Brasil' }).waitFor();
          assert.equal(
            await page.getByRole('heading', { name: 'Niterói, Rio de Janeiro, Brasil' }).count(),
            0,
          );
        } finally {
          release();
          await context.close();
        }
      },
    );

    assert.deepEqual(externalRequests, [], 'browser must never contact third parties directly');
    for (const headers of fixture.outboundHeaders) {
      const serialized = JSON.stringify(headers);
      assert.doesNotMatch(serialized, /198\.51\.100\.77|203\.0\.113\.10|p8-browser-canary/i);
      assert.doesNotMatch(serialized, /forwarded|cookie|referer|authorization/i);
    }
    assert.ok(fixture.providerCalls.some((url) => url.hostname === 'geocoding-api.open-meteo.com'));
    assert.ok(fixture.providerCalls.some((url) => url.hostname === 'api.open-meteo.com'));
  } finally {
    await browser?.close();
    if (web)
      await new Promise((resolve, reject) =>
        web.httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    if (api)
      await new Promise((resolve, reject) =>
        api.close((error) => (error ? reject(error) : resolve())),
      );
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(environment)) {
      if (previousEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnvironment[key];
    }
  }
});
