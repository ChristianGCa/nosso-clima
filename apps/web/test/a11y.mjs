import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:4175';
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
const locationResponse = {
  locations: [location],
  attribution: {
    provider: 'Open-Meteo',
    source: 'GeoNames',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    isModified: true,
    providerUrl: 'https://open-meteo.com/',
    sourceUrl: 'https://www.geonames.org/',
  },
};
const conditions = [
  ['clear', 'Limpo', 'limpo', 'limpa'],
  ['cloudy', 'Nublado', 'nublado', 'nublada'],
  ['rain', 'Chuva', 'chuvoso', 'chuvosa'],
  ['snow', 'Neve', 'neve', 'neve'],
  ['storm', 'Tempestade', 'tempestade', 'tempestade'],
];

function forecastResponse(category, label, isDay) {
  const condition = { code: 0, category, labelPt: label };
  return {
    timezone: 'America/Sao_Paulo',
    retrievedAtUtc: '2026-09-24T18:32:00.000Z',
    current: {
      validAtLocal: '2026-09-24T15:30',
      temperatureC: 23.4,
      apparentTemperatureC: 24.1,
      condition,
      windSpeedKmh: 12.8,
      isDay,
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
      uvIndexMax: null,
      uvRisk: null,
    })),
    attribution: {
      provider: 'Open-Meteo',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      isModified: true,
      providerUrl: 'https://open-meteo.com/',
    },
  };
}

async function ready() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch (error) {
      if (server.exitCode !== null) throw error;
    }
    await delay(50);
  }
  throw new Error('Preview server did not start');
}

async function scan(page, state) {
  const result = await new AxeBuilder({ page }).analyze();
  const severe = result.violations.filter(
    (item) => item.impact === 'critical' || item.impact === 'serious',
  );
  assert.deepEqual(
    severe.map(
      (item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
    [],
    `${state} has severe axe violations`,
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(overflow, false, `${state} has horizontal overflow`);
  process.stdout.write(`Accessibility OK: ${state}\n`);
}

const server = spawn(
  process.execPath,
  [
    '../../node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4175',
    '--strictPort',
  ],
  {
    cwd: webRoot,
    stdio: 'ignore',
  },
);
let browser;
try {
  await ready();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    reducedMotion: 'reduce',
    timezoneId: 'Pacific/Honolulu',
  });
  const page = await context.newPage();
  const assetRequests = [];
  const apiRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) apiRequests.push(request.url());
    if (request.url().includes('.webp')) assetRequests.push(request.url());
  });
  let forecastCalls = 0;
  let releaseLoading;
  const loading = new Promise((resolve) => {
    releaseLoading = resolve;
  });
  await page.route('**/api/v1/locations?**', (route) => route.fulfill({ json: locationResponse }));
  await page.route('**/api/v1/forecast?**', async (route) => {
    forecastCalls += 1;
    if (forecastCalls === 1) {
      await loading;
      await route.fulfill({
        status: 429,
        json: { error: { code: 'RATE_LIMITED', message: 'hidden' } },
      });
      return;
    }
    const index = (forecastCalls - 2) % 10;
    const [category, label] = conditions[Math.floor(index / 2)];
    await route.fulfill({ json: forecastResponse(category, label, index % 2 === 0) });
  });

  await page.goto(origin);
  await scan(page, 'neutral mobile');
  if (process.env.NOSSO_CLIMA_VISUAL_REVIEW === '1') {
    await page.screenshot({ path: '/tmp/nosso-clima-neutral.png', fullPage: true });
  }
  assert.equal(apiRequests.length, 0, 'first load must make no API request');
  assert.equal(assetRequests.length, 0, 'first load must fetch no weather image');
  const field = page.getByRole('combobox', { name: 'Qual cidade você quer consultar?' });
  await field.fill('São');
  await page.getByRole('option', { name: 'São Paulo, São Paulo, Brasil' }).waitFor();
  await scan(page, 'suggestions mobile');
  await field.focus();
  await field.press('Tab');
  assert.equal(
    await page.getByRole('option').evaluate((element) => document.activeElement === element),
    true,
    'Tab must reach a suggestion',
  );
  await field.focus();
  await field.press('Escape');
  assert.equal(await page.getByRole('option').count(), 0, 'Escape must close suggestions');
  await field.fill('São P');
  await page.getByRole('option').waitFor();
  await field.press('ArrowDown');
  assert.equal(await field.getAttribute('aria-activedescendant'), 'city-option-0');
  await field.press('Enter');
  await page.getByText('Carregando previsão…').waitFor();
  await scan(page, 'loading mobile');
  releaseLoading();
  await page.getByText('Muitas consultas agora. Tente novamente em instantes.').waitFor();
  await scan(page, 'error mobile');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.getByRole('heading', { name: 'Previsão de 7 dias' }).waitFor();
  assert.equal(await page.getByText('Condições válidas às 15:30 (horário local)').count(), 1);
  assert.equal(
    await page.getByText('Dados consultados às 24/09, 15:32 (horário local)').count(),
    1,
  );
  assert.equal(await page.getByRole('heading', { name: 'Quinta-feira, 24/09' }).count(), 1);
  await page.locator('.site-shell.has-image').waitFor();
  await scan(page, 'success mobile');
  await field.focus();
  assert.equal(
    await page
      .locator('.search-field')
      .evaluate((element) => getComputedStyle(element).outlineWidth),
    '3px',
    'focus must stay visible over a photo',
  );
  if (process.env.NOSSO_CLIMA_VISUAL_REVIEW === '1') {
    await page.screenshot({ path: '/tmp/nosso-clima-mobile.png', fullPage: true });
  }

  for (let index = 1; index < 10; index += 1) {
    await field.fill(`São ${index}`);
    await page.getByRole('option').waitFor();
    await page.getByRole('option').click();
    await page.locator('.site-shell.has-image').waitFor();
    const expected = `${index % 2 === 0 ? 'dia' : 'noite'}-${conditions[Math.floor(index / 2)][index % 2 === 0 ? 2 : 3]}`;
    const background = await page
      .locator('.site-shell')
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    assert.ok(background.includes(expected), `wrong image for ${expected}`);
    await scan(page, expected);
  }
  assert.equal(new Set(assetRequests).size, 10, 'each weather background should be requested once');
  assert.equal(
    assetRequests.length,
    10,
    'only one image request should occur per active condition',
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await scan(page, 'desktop');
  if (process.env.NOSSO_CLIMA_VISUAL_REVIEW === '1') {
    await page.screenshot({ path: '/tmp/nosso-clima-desktop.png', fullPage: true });
  }
  await browser.close();
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
