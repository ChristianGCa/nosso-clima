# Spec: Weather Forecast

- **Status:** Local implementation complete; Checkpoint W-C approved by owner on 2026-09-24; revised on 2026-09-28 to remove UV and on 2026-10-04 to use predominant daily conditions
- **Module id:** `weather-forecast`
- **Depends on:** `backend-platform`
- **Consumer:** `weather-ui`

## Alteração aprovada pelo pedido do proprietário em 2026-10-04

Os sete cartões passam a mostrar a **condição predominante**, calculada na API a partir de `hourly.weather_code`, sem alterar o formato público da resposta. Para cada data local, contar horas por categoria (`clear`, `cloudy`, `rain`, `snow`, `storm`) e escolher a categoria com mais horas; empate é resolvido pela primeira ocorrência no dia. Dentro dela, escolher o código WMO mais frequente, também com desempate pela primeira ocorrência. Isso evita que uma tempestade isolada represente um dia predominantemente nublado. A previsão atual continua usando `current.weather_code`.

Esta alteração substitui apenas a decisão anterior sobre `daily.weather_code` e a lista de variáveis externas. `daily.weather_code` sai da consulta; `hourly.weather_code` entra. O custo ponderado da consulta deve ser confirmado no P1 antes da entrega de produção; o tamanho da resposta deve permanecer dentro do limite de 64 KiB do transporte. A migração Redis/Vercel foi implementada localmente após a aprovação P0 e ainda depende da prova P1.

## Alcance desta spec

O contrato HTTP e o comportamento local estão implementados e aprovados. Redis e reserva compartilhada estão integrados à entrada Vercel, com previsão de sete dias e cache hit observados em Preview. A [continuidade de P1](docs/deploy/preview-progress-2026-10-08.md) registra esse smoke e negações de cota; peso, tamanho da amostra, expiração e concorrência permanecem gates. A seção **Cache: desenvolvimento local e Redis em Preview** distingue os runtimes; o progresso está em [tasks/vercel-todo.md](tasks/vercel-todo.md).

## Objective

Return current conditions and seven local calendar days for one explicitly selected place. The backend translates Open-Meteo's response into a small, validated, Portuguese-friendly contract so the frontend does not interpret provider fields, units or WMO codes. A person should see temperature, apparent temperature, wind, rain chance and amount, the local time, and when the data was retrieved without confusing a forecast with a measurement.

This module does not search for places, choose a city on the user's behalf, render backgrounds, draw a UI, persist weather history, send alerts, or promise that a forecast is an observed fact. The forecast endpoint accepts coordinates and the IANA timezone from the selected `location-search` result. `weather-ui` makes no forecast request on a first visit without a saved city; after explicit selection, a later visit may request a fresh forecast for that browser's last selected city. There is no global default city.

The owner confirmed the cache TTL, neutral first load, daily-condition source and unavailable-metric policy on 2026-09-23, then explicitly approved this spec. The W1–W7 plan was approved with the subsequent three-decimal rounding, canonical-timezone, real-fixture and TTL-boundary amendments. The 2026-09-28 request removes UV maximum and derived risk from the outbound request and public contract.

## Public HTTP Contract

### Request

```http
GET /api/v1/forecast?latitude=-23.5475&longitude=-46.63611&timezone=America%2FSao_Paulo
Accept: application/json
```

- Exactly one `latitude`, `longitude`, and `timezone` is required; unknown or repeated keys fail. A route-local `preValidation` check uses `URLSearchParams` on the raw URL before Fastify's validator can remove unknown keys. The app-wide Ajv setting is unchanged.
- Coordinates must be finite WGS84 numbers: latitude `[-90, 90]`, longitude `[-180, 180]`. Textual values are bounded to 32 characters each; commas, `NaN`, and infinities are rejected. Validate the unrounded input against those bounds, then round each coordinate to three decimal places for the Open-Meteo parameters and cache key; equivalent spellings and values that round to the same coordinates share work. Round to the nearest thousandth, with exact halfway cases away from zero, and normalize negative zero to zero.
- `timezone` is a nonempty, at-most-64-character IANA identifier accepted by the Node runtime. Numeric UTC offsets and control characters are rejected. Resolve an accepted alias through `Intl.DateTimeFormat(...).resolvedOptions().timeZone` and use the canonical identifier consistently in the outbound parameter, response and cache key; it never chooses an origin or path.
- Invalid input returns `400 VALIDATION_ERROR` with generic `{ field: "request", reason: "invalid" }` details and no cache lookup or external call.
- The route uses both the platform's global 60/minute and `weather-forecast` 15/minute per-IP limits. It is registered once in `buildApp()`; `server.ts` stays responsible only for process lifecycle.

### Successful response

```json
{
  "timezone": "America/Sao_Paulo",
  "retrievedAtUtc": "2026-09-23T17:00:00.000Z",
  "current": {
    "validAtLocal": "2026-09-23T14:45",
    "temperatureC": 24.1,
    "apparentTemperatureC": 25.3,
    "condition": { "code": 3, "category": "cloudy", "labelPt": "Nublado" },
    "windSpeedKmh": 12.2,
    "isDay": true
  },
  "daily": [
    {
      "date": "2026-09-23",
      "temperatureMaxC": 27.5,
      "temperatureMinC": 18.1,
      "apparentTemperatureMaxC": 28.2,
      "apparentTemperatureMinC": 17.8,
      "condition": { "code": 61, "category": "rain", "labelPt": "Chuva" },
      "precipitationProbabilityMaxPercent": 70,
      "precipitationSumMm": 8.4,
      "windSpeedMaxKmh": 18.6
    }
  ],
  "attribution": {
    "provider": "Open-Meteo",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "isModified": true,
    "providerUrl": "https://open-meteo.com/"
  }
}
```

The example abbreviates `daily`; a real success has **exactly seven** records, starting with the selected place's current local date and ordered by consecutive local calendar dates. `retrievedAtUtc` is the time this process successfully retrieved and validated the payload, not a claimed weather-model update time. Cache hits retain the original timestamp. `validAtLocal` is Open-Meteo's current-value time and is always paired with `timezone`; frontend code must not treat the offset-less value as UTC. Temperatures are °C, wind speeds km/h, precipitation mm, and probability percent. An individual daily `precipitationProbabilityMaxPercent` may be `null` when the provider reports it unavailable. The UI marks it as unavailable without hiding the remaining forecast or interpreting it as zero. The result never includes the request coordinates, upstream grid-cell coordinates or raw payload.

The fixed attribution is included on every success. `weather-ui` must show provider/license credit and indicate that NossoClima adapted the data. Styling, contrast and background selection belong to the UI spec.

### Condition semantics

`current.weather_code` is mapped to one of five categories. For each daily card, use the predominant category derived from `hourly.weather_code` as defined in the owner amendment above. Do not use Open-Meteo's daily most-severe code as a proxy for predominance.

| WMO codes | Category | Portuguese label |
|---|---|---|
| `0`, `1` | `clear` | Limpo |
| `2`, `3`, `45`, `48` | `cloudy` | Nublado |
| `51`, `53`, `55`, `56`, `57`, `61`, `63`, `65`, `66`, `67`, `80`, `81`, `82` | `rain` | Chuva |
| `71`, `73`, `75`, `77`, `85`, `86` | `snow` | Neve |
| `95`, `96`, `99` | `storm` | Tempestade |

Unknown or malformed codes fail closed as invalid upstream data, rather than silently displaying the wrong condition. `current.is_day` alone chooses day/night for the current background; the backend returns it as a boolean and does not choose a bitmap.

### Errors

| Condition | HTTP | Public code |
|---|---:|---|
| Invalid query | 400 | `VALIDATION_ERROR` |
| Global or weather-group rate limit | 429 | `RATE_LIMITED` |
| Shared outbound executor saturation | 503 | `SERVICE_UNAVAILABLE` |
| Open-Meteo timeout, network error, redirect, non-200 status, invalid content type, oversized body, invalid JSON or invalid consumed data | 503 | `SERVICE_UNAVAILABLE` |
| Unexpected application defect | 500 | `INTERNAL_ERROR` |

All public errors use `backend-platform`'s existing envelope and request ID. Provider status text, response body, request URL, coordinates and internal validation details are never returned.

## Open-Meteo Adapter

Call only `https://api.open-meteo.com/v1/forecast`. Construct the URL with `URL` and `URLSearchParams`; coordinates and timezone are values, not authority or path components. Use the approved free endpoint only in the non-commercial MVP.

| Parameter | Fixed value or validated input |
|---|---|
| `latitude`, `longitude` | Validated selected-place coordinates rounded to three decimals |
| `timezone` | Validated selected-place IANA identifier |
| `forecast_days` | `7` |
| `current` | `temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day` |
| `hourly` | `weather_code` |
| `daily` | `temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max` |
| `temperature_unit` | `celsius` |
| `wind_speed_unit` | `kmh` |
| `precipitation_unit` | `mm` |
| `timeformat` | `iso8601` |

No user-controlled extra parameter, key, header, cookie, IP address or request ID goes upstream. Request only hourly weather codes; do not expose hourly values in the public response. Open-Meteo may weight this request differently because hourly data is added; the P1 aggregate usage budget must measure the amended query before public deployment.

Use Node 24 built-in `fetch`, `redirect: 'error'`, and one `AbortSignal.timeout(5_000)` covering both fetch and streaming body consumption. Accept only HTTP 200 with a JSON content type; read at most 65,536 decoded bytes before `JSON.parse`. Abort when the bound is exceeded. Do not retry, especially not `429`. Treat redirects rejected by `fetch` as a network failure without parsing exception text.

### External response validation

JSON begins as `unknown`. Permit extra provider fields but validate every consumed value. Require one top-level object with `timezone`, `current`, `current_units`, `daily`, and `daily_units` objects; reject provider `error` payloads. The returned timezone must agree with the requested IANA zone after runtime canonicalization. Validate the requested units against the unit metadata.

`current.time` must be a valid local ISO minute timestamp; `is_day` must be exactly `0` or `1`. Current numeric values must be finite, wind speed nonnegative and weather code in the approved WMO set. Each named `daily` array must have exactly seven entries. Dates must be valid, consecutive `YYYY-MM-DD` calendar dates in ascending order. Per [Open-Meteo's seven-day hourly contract](https://open-meteo.com/en/docs), `hourly.time` and `hourly.weather_code` must align and contain 168 entries, from local 00:00 through 23:00 for each of those seven dates; all codes must be approved WMO integers. Reject a missing/invalid hour or empty day rather than falling back to the severe daily code. Temperature and apparent-temperature values must be finite; wind and precipitation amounts nonnegative. Each daily precipitation probability must be `null` or a finite number within `[0,100]`; preserve a provider `null` in the corresponding response field. Reject mismatched array lengths, other invalid types, nonfinite values, unknown WMO codes, malformed dates, wrong units and missing required fields as one `invalid_response` provider failure. Do not manufacture missing weather values.

Only daily precipitation probability permits `null`; a missing array, missing entry or `null` in any other consumed field remains an invalid upstream response.

## Cache: desenvolvimento local e Redis em Preview

### Implementado localmente

Use `BackendPlatformContext.createCache('weather-forecast')` exactly once from `buildApp()` with the shared `SingleFlight` and bounded outbound executor. The owner-approved TTL for the entire normalized current-plus-daily result is **10 minutes**. Both data and `retrievedAtUtc` remain unchanged during a cache hit, and expiry is inclusive at the exact boundary. Cache only complete validated success, never provider failures, saturation or unexpected errors; do not serve stale data. Recheck inside the single-flight callback.

The namespaced cache key includes canonical coordinates and timezone; it is never logged. Each miss consumes one executor slot for the bounded outbound operation. Distinct places may run independently within the shared concurrency ceiling. Cache and in-flight state are process-local and disposable, not an aggregate usage-quota mechanism.

### Redis na entrada Vercel — implementado; P1 parcial

O proprietário confirmou em 2026-10-04 a documentação de um cache Upstash temporário para previsão validada, com TTL máximo de 10 minutos, sem IP ou identificador do visitante. A chave opaca é derivada com segredo da API das coordenadas arredondadas para três casas e do fuso canônico; o valor preserva a resposta pública, inclusive `retrievedAtUtc`, durante o TTL. Não há histórico, dado vencido nem cache de falhas. Cache e reserva agregada são infraestrutura de `backend-platform`; parâmetros Open-Meteo, sete dias, contrato HTTP, validação e créditos desta spec não mudam.

Esta alteração foi aprovada para implementação na P0 e integrada localmente em P4/P6; sua publicação depende da prova de viabilidade P1 de [Backend Platform](SPEC-backend-platform.md) e [Production Delivery](SPEC-production-delivery.md). O contrato local acima continua descrevendo o runtime de desenvolvimento. Só a migração verificada em P1 substitui o cache local em produção. A exceção aprovada permite exclusivamente os dados e TTL descritos nesta seção. Registrar esses dados em logs ou telemetria, criar histórico, servir cache vencido ou ampliar a persistência continua proibido.

Na integração P6, toda chamada externa efetiva usa a reserva agregada e o circuit breaker de `backend-platform`; falha de Redis ou reserva negada retorna `503 SERVICE_UNAVAILABLE`. O contrato HTTP, os créditos e o TTL de 10 minutos são preservados. A aceitação da migração exige testes entre instâncias, expiração exata, falhas não cacheadas e ausência de dados sensíveis em logs, conforme a [lista ativa](tasks/vercel-todo.md).

## Observability, Privacy and Licensing

- Expected provider failures emit one bounded `forecast_upstream_failed` warning with the bound `requestId`, a fixed failure kind (`timeout`, `network`, `status`, `content_type`, `body_too_large`, `invalid_json`, `invalid_response`, plus platform categories `quota_denied`, `circuit_open`, `redis_unavailable`, `upstream_rate_limited` in the Vercel entry) and optional numeric upstream status. The public response remains generic.
- Reuse platform cache hit/miss and saturation events. Never log or attach to telemetry the raw query, coordinates, timezone, cache key, complete URL, provider text/body, daily values or client IP.
- Coordinates and timezone are sent to Open-Meteo. `production-delivery` must describe this transfer and provider retention in the public privacy notice. It must also verify attribution and current licensing terms.
- The free endpoint is only for non-commercial use within Open-Meteo's limits. Public deployment is blocked until `production-delivery` approves an application-wide aggregate budget for geocoding **and** forecasting; per-IP inbound limits are not a substitute. Commercial deployment requires an approved paid endpoint, API-key handling and licensing/privacy review.

## Tech Stack

No new dependency is proposed. Reuse the pinned `backend-platform` stack: Node 24.21.x, TypeScript 7.0.2, Fastify 5.12.5, TypeBox 1.3.34, `lru-cache` 11.5.3 and Vitest 5.0.1. The npm lockfile remains authoritative.

## Commands

```bash
npm test --workspace @nosso-clima/api -- forecast
npm run typecheck --workspace @nosso-clima/api
npm run lint --workspace @nosso-clima/api
npm run format:check --workspace @nosso-clima/api
npm run check --workspace @nosso-clima/api
npm run test:coverage --workspace @nosso-clima/api
npm audit --audit-level=high
```

No verification test contacts the live provider or uses a real sleep.

## Project Structure

```text
SPEC-weather-forecast.md
apps/api/src/backend-app.ts                 one weather cache and route composition
apps/api/src/forecast/forecast-contract.ts  public schema and types
apps/api/src/forecast/forecast-query.ts     raw-key and coordinate/timezone validation
apps/api/src/forecast/wmo-condition.ts      WMO condition mappings
apps/api/src/forecast/open-meteo-forecast.ts fixed-origin transport and external validation
apps/api/src/forecast/forecast-service.ts   cache, single-flight and executor orchestration
apps/api/src/routes/forecast.ts             GET /api/v1/forecast
apps/api/test/unit/forecast-*.test.ts       pure mapping, adapter and service tests
apps/api/test/integration/forecast.test.ts  offline HTTP contract and privacy tests
```

Planning may combine these files where a smaller structure is clearer. Existing platform tests that currently claim the `weather-forecast` cache namespace must be updated to verify the composed module or use a different isolated cache test; they must not call `createCache('weather-forecast')` twice. No weather code belongs in `location-search` or `backend-platform`.

## Code Style

Use named exports, kebab-case files, PascalCase types, immutable public results, `unknown` for external JSON, explicit module-boundary return types and injected fetch/clock for deterministic tests. Runtime schemas are the source for public HTTP validation and serialization.

```ts
export type ForecastLocation = Readonly<{
  latitude: number;
  longitude: number;
  timezone: string;
}>;
```

## Testing Strategy

- Unit tests cover coordinate parsing, three-decimal rounding (including halfway cases, bounds and negative zero), canonical timezone aliases, repeated and unknown keys, WMO mappings, the exact 5-second abort, fixed URL/parameters, 64 KiB body boundary, status and content-type rejection, malformed JSON, every consumed upstream field, seven aligned days and nullable rain probability. W3 and W4 use a committed fixture derived from an actual Open-Meteo forecast response for a public city, with equivalent source URL and retrieval date recorded; synthetic failure/null variants are labeled and all tests remain offline.
- Service tests use real platform cache/flight/executor adapters with fake time and fetch: positive cache, a hit at 599,999 ms and expiry at exactly 600,000 ms, coalescing, distinct keys, second cache lookup, saturation, failure-not-cached and safe warnings.
- `app.inject` tests cover the exact schema, attribution, request ID, zero outbound calls for invalid input, 15/minute group and 60/minute global limits, safe 503/500 mapping, concurrent misses and log privacy. The compiled process smoke path calls only `/health` and invalid forecast input, then shuts down cleanly.
- The complete API application retains at least 80% statements, branches, functions and lines. Named tests exercise all critical validation, cache, limiter and error branches.

## Boundaries

### Always

- Validate input and every external value used in a public response.
- Keep the origin/path fixed, timeout and body bound finite, and use shared platform limits, cache and executor.
- Return only the documented response and safe platform errors; preserve attribution and privacy.
- Verify with deterministic offline tests and the full module gate.

### Ask first

- Change the route, fields, horizon, variable list, units, condition mapping, TTL, timeout, payload bound or error semantics.
- Add a dependency, provider, retry, fallback, stale-on-error, hourly detail or an aggregate quota primitive.
- Add commercial credentials, telemetry or another outbound data recipient.

### Never

- Let public input choose an outbound origin, path, header or credential.
- Trust TypeScript instead of validating provider data, or forward raw provider payloads.
- Log coordinates, timezone, keys, weather values, provider text, IPs or secrets.
- Persist any of the data listed in the preceding rule in the current local implementation. The only proposed exception is the bounded Upstash cache specified above, activated through P0/P1 and verified integration; it does not permit raw IP storage, history or other persistence.
- Bypass shared rate limits/executor, retry a 429 blindly, weaken constraints or skip tests.

## Success Criteria — implementação local

- [x] Exactly one validated city selection produces current conditions and seven consecutive local calendar days in the stable metric-unit response.
- [x] All current and daily WMO codes map deterministically to a documented category and Portuguese label; unknown codes fail safely.
- [x] A `null` daily rain probability remains explicitly unavailable without failing the forecast.
- [x] Invalid input fails with 400 before external work; the route participates in both limiter layers.
- [x] Equivalent concurrent misses share one bounded external call; valid results expire at exactly 10 minutes; failures never cache.
- [x] Provider failures, malformed fields and timeout return the safe 503 envelope; defects remain 500.
- [x] Every success includes attribution and distinct current-valid-time versus retrieval-time fields.
- [x] Logs and public errors contain no coordinates, timezone, cache keys, raw provider content or private diagnostics.
- [x] The full API gate, coverage, audit and compiled-server smoke test pass without a live provider call.
- [x] Public and commercial deployment remain blocked until their separate usage, licence and privacy gates are met.

## Decisions and Approval Gate

The original decisions were confirmed on 2026-09-23; later amendments are dated below:

1. **TTL:** 10 minutes for current conditions and all seven daily records in one cache entry. The public-deployment aggregate usage budget must account for this TTL.
2. **First visit:** Neutral `weather-ui` state until explicit city selection; no default city. A returning browser may request a fresh forecast for its last selected city under the revised `weather-ui` spec.
3. **Daily condition (superseded on 2026-10-04):** The original choice used Open-Meteo's `daily.weather_code` as the most severe condition. The owner now requires hourly-category predominance as defined above.
4. **Missing probability:** Keep the forecast when the provider supplies `null` for rain probability on an individual day. Return `null` and let the UI mark it unavailable.
5. **Coordinates:** Round valid latitude and longitude to three decimal places before the upstream request and cache key (owner clarification after plan review).
6. **UV removal:** The owner requested removal of UV maximum and derived risk from the provider query, response contract and UI on 2026-09-28.

The owner approved the original spec and W1–W7 plan on 2026-09-23 and the completed local module at Checkpoint W-C on 2026-09-24. Later owner requests on 2026-09-28 and 2026-10-04 amended the local contract as recorded above. The Redis migration was approved for implementation at P0 on 2026-10-04 and remains subject to the P1 viability gate.

## Official Sources

- Open-Meteo Forecast API parameters, daily semantics and WMO codes: https://open-meteo.com/en/docs
- Open-Meteo terms, quotas and retention: https://open-meteo.com/en/terms
- Open-Meteo pricing and attribution: https://open-meteo.com/en/pricing
- Node.js 24 global `fetch` and `AbortSignal.timeout`: https://nodejs.org/download/release/latest-v24.x/docs/api/globals.html
