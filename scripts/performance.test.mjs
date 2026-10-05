import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { preview } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'artifacts/performance.json');
const location = {
  id: 3448439,
  name: 'São Paulo',
  region: 'São Paulo',
  country: 'Brasil',
  countryCode: 'BR',
  latitude: -23.548,
  longitude: -46.636,
  timezone: 'America/Sao_Paulo',
};
const condition = { code: 0, category: 'clear', labelPt: 'Limpo' };
const forecast = {
  timezone: location.timezone,
  retrievedAtUtc: '2026-09-24T18:32:00.000Z',
  current: {
    validAtLocal: '2026-09-24T15:30',
    temperatureC: 23.4,
    apparentTemperatureC: 24.1,
    condition,
    windSpeedKmh: 12.8,
    isDay: true,
  },
  daily: Array.from({ length: 7 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 8, 24 + index)).toISOString().slice(0, 10),
    temperatureMaxC: 26,
    temperatureMinC: 15,
    apparentTemperatureMaxC: 27,
    apparentTemperatureMinC: 14,
    condition,
    precipitationProbabilityMaxPercent: null,
    precipitationSumMm: 0,
    windSpeedMaxKmh: 25,
  })),
  attribution: {
    provider: 'Open-Meteo',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    isModified: true,
    providerUrl: 'https://open-meteo.com/',
  },
};

async function measure(browser, origin, restored) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(
      (savedLocation) => {
        if (savedLocation) {
          localStorage.setItem(
            'nosso-clima:last-location:v1',
            JSON.stringify({ version: 1, location: savedLocation }),
          );
        }
        window.__vitals = { lcpMs: 0, cls: 0, shiftCount: 0 };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__vitals.lcpMs = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              window.__vitals.cls += entry.value;
              window.__vitals.shiftCount += 1;
            }
          }
        }).observe({ type: 'layout-shift', buffered: true });
      },
      restored ? location : null,
    );
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 200_000,
      uploadThroughput: 93_750,
    });
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const externalRequests = [];
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        externalRequests.push(route.request().url());
        return route.abort();
      }
      if (new URL(route.request().url()).pathname === '/api/v1/forecast') {
        return route.fulfill({ json: forecast });
      }
      return route.continue();
    });
    await page.goto(origin, { waitUntil: 'load' });
    if (restored) {
      await page.getByRole('heading', { name: 'Previsão de 7 dias' }).waitFor();
      await page.locator('.site-shell.has-image').waitFor();
    } else {
      await page.getByRole('heading', { name: 'O clima da sua cidade, sem mistério.' }).waitFor();
    }
    await page.waitForTimeout(500);
    const vitals = await page.evaluate(() => window.__vitals);
    assert.equal(externalRequests.length, 0, 'browser contacted an external origin');
    assert.ok(vitals.lcpMs > 0, 'LCP observer did not report a candidate');
    assert.ok(Number.isFinite(vitals.cls), 'CLS observer did not report a value');
    return { scenario: restored ? 'restored-city' : 'neutral', ...vitals };
  } finally {
    await context.close();
  }
}

const server = await preview({
  configFile: false,
  root: path.join(root, 'apps/web'),
  preview: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const restored of [false, true]) {
    results.push(await measure(browser, origin, restored));
  }
  const report = {
    measuredAtUtc: new Date().toISOString(),
    browser: browser.version(),
    profile: {
      viewport: '360x800@2x',
      cpuSlowdown: 4,
      latencyMs: 150,
      downloadBytesPerSecond: 200_000,
      runsPerScenario: 1,
      provider: 'fixture',
    },
    limits: { lcpMs: 2500, cls: 0.1 },
    results,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  for (const result of results) {
    process.stdout.write(
      `${result.scenario}: LCP ${Math.round(result.lcpMs)} ms, CLS ${result.cls.toFixed(3)}\n`,
    );
    assert.ok(result.lcpMs <= report.limits.lcpMs, `${result.scenario} LCP exceeded 2.5 s`);
    assert.ok(result.cls <= report.limits.cls, `${result.scenario} CLS exceeded 0.1`);
  }
  process.stdout.write(`Profile: ${reportPath}\n`);
} finally {
  await browser?.close();
  await server.close();
}
