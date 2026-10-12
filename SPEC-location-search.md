# Spec: Location Search

- **Status:** Complete; Checkpoint L-B approved by owner on 2026-09-23. Public deployment gates remain open under `production-delivery`; the owner confirmed noncommercial use.
- **Module id:** `location-search`
- **Depends on:** `backend-platform`
- **Consumer:** `weather-ui`

## Alcance desta spec

O contrato HTTP e o comportamento local estão implementados e aprovados. O cache Redis e a reserva compartilhada também estão integrados à entrada Vercel, com buscas e hits observados em Preview. O histórico `docs/history/preview-evidence-2026-10.md` registra o smoke, negações de cota e deduplicação concorrente na amostra de eco. A expiração da busca após 24 h e a reserva hospedada sob contenção/entre instâncias não foram comprovadas; a decisão de 2026-10-10 na lista ativa as transferiu para acompanhamento, sem alterar a implementação da reserva atômica. O aceite de Production permanece aberto. A seção **Cache: desenvolvimento local e Redis em Preview** distingue os runtimes; os gates estão em [tasks/vercel-todo.md](tasks/vercel-todo.md).

## Objective

Build the backend capability that accepts a city search, queries Open-Meteo's geocoding API, validates the untrusted response, and returns a small stable list of normalized populated places. A person must be able to distinguish homonymous places by city, first-level administrative region, and country before explicitly selecting one for a forecast.

This module owns geocoding only. It does not render search UI, debounce keystrokes, choose a result automatically, fetch weather, reverse-geocode coordinates, persist history, or provide a provider fallback.

The approved request flow is:

1. Apply the global and `location-search` rate limits from `backend-platform`.
2. Validate and canonicalize the public query.
3. Return a valid cached result when available.
4. Consolidate concurrent misses for the same canonical query with `SingleFlight`.
5. Run the Open-Meteo request through the shared bounded executor.
6. Enforce timeout, response-size, HTTP-status, JSON, and schema checks.
7. Keep only current populated-place results, normalize them, cache the result, and return the public contract.

## Public HTTP Contract

### Request

```http
GET /api/v1/locations?query=São%20Paulo
Accept: application/json
```

- `query` is the only accepted query parameter and is required exactly once.
- The canonical value is Unicode NFKC-normalized, trimmed, and has consecutive whitespace collapsed to one space.
- After canonicalization it must contain 2 to 100 Unicode code points.
- C0 control characters and DEL are rejected.
- The accepted forms are `<place>` and `<place>, <country or admin1>`.
- At most one comma is accepted, and neither side of it may be empty.
- International letters, diacritics, spaces, hyphens, apostrophes, and other ordinary place-name characters are not restricted by an ASCII allowlist.
- Unknown or repeated query parameters are rejected instead of being ignored.
- The route checks the raw query with `URLSearchParams` in a route-local `preValidation` hook, before Fastify's schema validator can remove additional properties. It requires exactly one `query` key and rejects every other key or repeated key with the same safe `400 VALIDATION_ERROR` envelope; the app-wide Ajv behavior is not changed.
- Invalid input returns the existing `400 VALIDATION_ERROR` envelope with the platform's safe generic validation details.

The API accepts two-character searches because Open-Meteo defines those as exact-name matches. The frontend may impose a three-character threshold and debounce as a separate `weather-ui` concern.

`buildApp()` registers the location module once and owns its one `location-search` cache. `server.ts` remains responsible for process startup and shutdown, not route registration. For offline tests, `buildApp` accepts an optional `fetchImpl` dependency; production defaults to Node's built-in `fetch`.

### Successful response

```json
{
  "locations": [
    {
      "id": 3448439,
      "name": "São Paulo",
      "region": "São Paulo",
      "country": "Brasil",
      "countryCode": "BR",
      "latitude": -23.5475,
      "longitude": -46.63611,
      "timezone": "America/Sao_Paulo"
    }
  ],
  "attribution": {
    "provider": "Open-Meteo",
    "source": "GeoNames",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "isModified": true,
    "providerUrl": "https://open-meteo.com/",
    "sourceUrl": "https://www.geonames.org/"
  }
}
```

```ts
export type Location = Readonly<{
  id: number;
  name: string;
  region: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}>;

export type LocationSearchResponse = Readonly<{
  locations: readonly Location[];
  attribution: Readonly<{
    provider: 'Open-Meteo';
    source: 'GeoNames';
    license: 'CC BY 4.0';
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/';
    isModified: true;
    providerUrl: 'https://open-meteo.com/';
    sourceUrl: 'https://www.geonames.org/';
  }>;
}>;
```

- Success is always `200 application/json`, including when no place matches; no match is `{ "locations": [], ... }`, not `404`.
- At most five locations are returned.
- Upstream relevance order is preserved after filtering.
- Duplicate Open-Meteo/GeoNames IDs are collapsed, preserving the first occurrence.
- `region` is Open-Meteo's `admin1` value or `null` when absent.
- Names and country/region labels use Portuguese when Open-Meteo provides a translation, otherwise its documented English or native fallback.
- The response never echoes the search query or exposes upstream-only fields.
- Every response inherits the platform `x-request-id` behavior.
- `attribution` is present even for an empty list so the UI can consistently render the required credit.

### Errors

| Condition | HTTP | Public code |
|---|---:|---|
| Invalid public query | 400 | `VALIDATION_ERROR` |
| Global or route-group limit exceeded | 429 | `RATE_LIMITED` |
| Shared outbound executor saturated | 503 | `SERVICE_UNAVAILABLE` |
| Open-Meteo timeout, network failure, redirect, non-200 response, invalid content type, oversized body, invalid JSON, or invalid consumed data | 503 | `SERVICE_UNAVAILABLE` |
| Unexpected application defect | 500 | `INTERNAL_ERROR` |

All errors use the stable `backend-platform` envelope. Upstream status text, response bodies, URLs, exceptions, and validation details are never returned.

## Open-Meteo Adapter

The adapter calls only this fixed origin and path:

```text
https://geocoding-api.open-meteo.com/v1/search
```

It constructs the URL with `URL` and `URLSearchParams`; user input is a parameter value and can never select a protocol, host, port, path, or authentication value. The request uses these fixed parameters:

| Parameter | Value |
|---|---|
| `name` | Canonical user query |
| `count` | `10` |
| `language` | `pt` |
| `format` | `json` |

Ten upstream candidates allow the module to return up to five populated places even if higher-ranked results have another GeoNames feature type. No `apikey`, `countryCode`, or user-controlled extra parameter is sent in this version.

### Outbound controls

- Use Node.js 24's built-in `fetch` and `AbortSignal.timeout`; do not add an HTTP client dependency.
- Abort after 5,000 ms.
- Set `redirect: 'error'` so a provider redirect cannot silently change the approved destination.
- Accept only HTTP `200` with a JSON content type.
- Read at most 65,536 decoded response bytes. Abort and return `SERVICE_UNAVAILABLE` as soon as the limit is exceeded; do not call an unbounded body parser.
- Do not retry in this module. In particular, never retry `429` blindly.
- Send no cookies, authorization header, client IP, request ID, or application-internal metadata upstream.

### External response validation

External JSON begins as `unknown`. Runtime validation permits documented additional upstream fields but validates every field that influences the public response.

- The top level must be an object.
- `results` may be absent, which normalizes to an empty list, or it must be an array of at most ten objects.
- Each candidate must have a non-empty `feature_code` string. Unsupported valid feature codes are filtered out rather than treated as provider failure.
- Returned candidates are restricted to current populated-place codes: `PPL`, `PPLA`, `PPLA2`, `PPLA3`, `PPLA4`, `PPLA5`, `PPLC`, `PPLF`, `PPLG`, `PPLL`, `PPLR`, `PPLS`, and `STLMT`.
- Historical, abandoned, destroyed, and subdivision-only codes such as `PPLCH`, `PPLH`, `PPLQ`, `PPLW`, and `PPLX` are not returned.
- A candidate using an accepted code must contain a positive safe-integer `id`; non-empty bounded `name`, `country`, `country_code`, and `timezone` strings; and finite latitude/longitude within WGS84 ranges.
- `country_code` must be two uppercase ASCII letters.
- `timezone` must be accepted as an IANA time-zone identifier by the Node.js runtime.
- `admin1` may be absent or empty and normalizes to `null`; otherwise it is a bounded non-control string.
- Text fields used publicly are trimmed, limited to 256 Unicode code points, and rejected if they contain C0 controls or DEL. JSON encoding, not HTML markup, is returned.
- An accepted candidate that is missing or violates a consumed field is skipped as a whole; the API never repairs it or manufactures coordinates, country data, or timezone values. Skipped candidates do not reserve their `id`. The entire upstream response is still rejected as `invalid_response` when malformed accepted candidates are not a strict minority of accepted candidates (including a single malformed one), and when the envelope, a candidate's object shape or its `feature_code` is invalid. Approved by the owner on 2026-10-12 after a real “Belém” response failed because one of ten candidates lacked `country`.

## Cache: desenvolvimento local e Redis em Preview

### Implementado localmente

- Use the bounded process-local cache, `SingleFlight`, and outbound executor provided by `backend-platform`; do not create parallel implementations.
- The cache key is namespaced as `location-search:v1:` plus the canonical query lower-cased with locale-independent Unicode casing. Cache keys are never logged or exposed.
- Cache successful normalized location arrays for 24 hours, including empty arrays. Static attribution need not occupy each entry.
- Recheck the cache inside the `SingleFlight` operation so a result completed between the first lookup and ownership of the flight prevents duplicate work.
- Cache only after complete validation and normalization.
- Timeouts, saturation, network errors, non-200 responses, and invalid data are never cached.
- Do not serve stale data after an upstream failure in the MVP.
- Cache and in-flight state are process-local and disposable. Correctness must not depend on them surviving restart or being shared across instances.

The canonical query exists transiently in process memory as the request, cache key, and outbound parameter. It is not persisted. Hashing the cache key would not anonymize low-entropy city names and is therefore not represented as a privacy control.

### Redis na entrada Vercel — implementado e publicado

O proprietário confirmou em 2026-10-04 a documentação de um cache Upstash temporário para resultados normalizados de busca, inclusive vazios, com TTL máximo de 24 horas, sem IP ou identificador do visitante. A busca canônica passa a gerar uma chave opaca derivada com segredo da API; a chave não expõe o texto diretamente. O valor pode conter nomes e coordenadas dos resultados, pois são necessários ao contrato de busca. Falhas continuam fora do cache. O cache e a reserva agregada pertencem a `backend-platform`, não a este módulo; o contrato HTTP, canonicalização, timeout, filtro e créditos desta spec permanecem iguais.

Esta alteração foi aprovada para implementação na P0 e integrada localmente em P4/P6; publicada em 2026-10-12 após a prova de viabilidade P1 de [Backend Platform](SPEC-backend-platform.md) e [Production Delivery](SPEC-production-delivery.md). O contrato local acima continua descrevendo o runtime de desenvolvimento. Só a migração verificada em P1 substitui o cache local em produção. A exceção aprovada permite exclusivamente os dados e TTL descritos nesta seção. Registrar esses dados em logs ou telemetria, criar histórico, servir cache vencido ou ampliar a persistência continua proibido.

Na integração P6, toda chamada externa efetiva usa a reserva agregada e o circuit breaker de `backend-platform`; falha de Redis ou reserva negada retorna `503 SERVICE_UNAVAILABLE`. O contrato HTTP, os créditos e o TTL de 24 horas são preservados. A migração exige testes locais de concorrência, expiração exata, falhas não cacheadas e ausência de dados sensíveis em logs; o ensaio hospedado entre instâncias e após 24 horas segue o acompanhamento aprovado na [lista ativa](tasks/vercel-todo.md).

## Observability, Privacy, and Licensing

- Expected provider failures produce one structured warning named `geocoding_upstream_failed` with `requestId` and a bounded `failureKind`: `timeout`, `network`, `status`, `content_type`, `body_too_large`, `invalid_json`, `invalid_response`, plus the platform categories `quota_denied`, `circuit_open`, `redis_unavailable` and `upstream_rate_limited` in the Vercel entry. A redirect rejected by `fetch` is classified as `network`; the implementation must not inspect unstable exception text to distinguish it.
- An upstream status failure may include the numeric `upstreamStatus`; it must not include status text or response content.
- Existing cache hit/miss and executor-saturation events remain keyless and payload-free.
- Never log or attach to telemetry the query, canonical query, cache key, full URL, coordinates, location names, raw upstream body, client IP, or environment values.
- The UI must render provider/source/license credit from the response, with working links and an indication that NossoClima adapted the data, anywhere geocoding results are presented.
- The user's query is sent to Open-Meteo, a third party. `production-delivery` must ensure the deployed privacy notice describes that transfer and the provider's applicable retention terms.
- The fixed free endpoint is approved only for a non-commercial deployment within Open-Meteo's published free limits. A commercial, advertising-supported, subscription, or higher-volume launch requires prior approval, a spec update, a paid customer endpoint, and secret handling through deployment configuration.
- Per-client inbound rate limits do not prove compliance with Open-Meteo's aggregate minute, hour, day, and monthly quotas considered by the production proposal across geocoding, forecasting, restarts, or multiple instances. Before any public deployment using the free endpoint, `production-delivery` must approve an application-wide usage budget or a demonstrably lower traffic ceiling. If enforcement requires a shared runtime primitive, update `backend-platform` first rather than implementing it privately here.
- Attribution requirements remain applicable to free and paid use.

## Tech Stack

This module introduces no dependency and uses the versions already approved by `backend-platform`:

| Concern | Choice |
|---|---|
| Runtime and HTTP client | Node.js `24.21.x`; built-in stable `fetch` and `AbortSignal.timeout` |
| Language | TypeScript `7.0.2`, ESM, strict mode |
| Server | Fastify `5.12.5` |
| Runtime schemas | TypeBox `1.3.34` with `@fastify/type-provider-typebox` `6.1.0` |
| Cache | Existing `lru-cache`-backed platform adapter |
| Tests | Vitest `5.0.1` and Fastify `app.inject` |
| Format and lint | Biome `2.5.14` |

The lockfile remains authoritative. Any new dependency or major-version change requires review before implementation.

## Commands

```bash
# Run the location-search unit and integration tests during a slice
npm test --workspace @nosso-clima/api -- location

# Run all API tests and coverage at the module gate
npm test --workspace @nosso-clima/api
npm run test:coverage --workspace @nosso-clima/api

# Static checks and production build
npm run typecheck --workspace @nosso-clima/api
npm run lint --workspace @nosso-clima/api
npm run format:check --workspace @nosso-clima/api
npm run build --workspace @nosso-clima/api

# Complete module handoff gate and dependency audit
npm run check --workspace @nosso-clima/api
npm audit --audit-level=high
```

No verification test may call the live Open-Meteo API.

## Project Structure

```text
SPEC-location-search.md
apps/api/
├── src/
│   ├── app.ts                              compose one process-wide location module
│   ├── locations/
│   │   ├── location-contract.ts            public TypeBox schemas and inferred types
│   │   ├── location-query.ts               query validation and canonicalization
│   │   ├── location-search-service.ts      cache, single-flight and executor orchestration
│   │   └── open-meteo-geocoding.ts         fixed-origin adapter and response validation
│   └── routes/
│       └── locations.ts                    GET /api/v1/locations registration
└── test/
    ├── unit/
    │   ├── location-query.test.ts
    │   ├── location-search-service.test.ts
    │   └── open-meteo-geocoding.test.ts
    └── integration/
        └── locations.test.ts
```

Planning may combine files when a smaller structure remains cohesive, but it must not mix weather-forecast logic into this module or move shared platform policy into the provider adapter.

## Code Style

Use named exports, immutable inputs and results, explicit return types at module boundaries, `unknown` for external data, and constructor/function injection for network side effects. Files are kebab-case; types are PascalCase; functions and values are camelCase.

```ts
export interface GeocodingClient {
  search(query: string): Promise<readonly Location[]>;
}

export type LocationSearchService = Readonly<{
  search(query: string): Promise<readonly Location[]>;
}>;

export function createLocationSearchService(
  dependencies: Readonly<{
    client: GeocodingClient;
    cache: Cache<string, readonly Location[]>;
    singleFlight: SingleFlight;
    executor: BoundedExecutor;
  }>,
): LocationSearchService {
  // Implementation follows the approved contract and is added test-first.
  return createCachedLocationSearch(dependencies);
}
```

- Route TypeBox schemas are the runtime and TypeScript source for the public HTTP contract.
- External schema validation occurs inside the adapter before mapping.
- Prefer focused pure functions for canonicalization and normalization.
- Do not introduce repository classes, a dependency-injection container, generic base services, or a provider abstraction with unused implementations.
- Do not interpolate URLs or hand-build JSON.

## Testing Strategy

### Unit tests

- Query canonicalization: NFKC, trim, whitespace collapse, case-normalized cache key, two- and 100-code-point boundaries, optional qualifier, and rejection of controls, empty qualifier, multiple commas, too-short, and too-long input.
- Adapter request: exact HTTPS origin/path, encoded `name`, fixed `count=10`, `language=pt`, `format=json`, no unapproved parameters/headers, 5-second signal, and redirect rejection.
- Adapter failure matrix: timeout, network rejection, redirect, every non-200 class including `429`, wrong/missing content type, oversized stream, malformed JSON, invalid envelope, excessive result count, bad IDs, out-of-range coordinates, invalid timezone/country code, controls, and oversized strings.
- Adapter normalization: absent results, optional/empty `admin1`, Portuguese/native fallback data, feature-code allowlist, historical/non-place filtering, deduplication, order preservation, and five-result cap.
- Service behavior: positive and empty-result caching, exact 24-hour expiry with fake time, cache-key namespace, cache recheck, same-key coalescing, different-key independence, executor use, saturation propagation, and no cache entry after failure.

### Integration tests with `app.inject`

- A valid query returns the exact `200` response schema, attribution, content type, and request ID.
- A city with no matches returns `200` and an empty array.
- Missing, duplicate, extra (including `?query=ab&foo=1`), malformed, too-short, and too-long query parameters return the safe `400` envelope without calling the adapter.
- The route opts into `RATE_LIMIT_GROUP.LOCATION_SEARCH`; its 31st request in a minute returns `429` while the global limit remains independently enforced.
- Every expected provider failure returns the safe `503` envelope; unexpected defects remain `500`.
- Concurrent identical requests issue one fake upstream call.
- Captured logs correlate failures but contain none of the distinctive query, city, coordinate, cache-key, URL-query, raw-body, or client-IP fixtures.

Use injected fake `fetch`, fake streams, and fake time. Tests must not use a live network or wall-clock sleeps. The entire API suite must retain at least 80% line, branch, function, and statement coverage, with the critical validation, cache, rate-limit, and public-error branches directly exercised as required by `CONSTRAINTS.md`.

## Boundaries

### Always

- Validate public input and every external value used by the application.
- Use the fixed HTTPS Open-Meteo origin, bounded body reader, timeout, shared rate limits, cache, `SingleFlight`, and bounded executor.
- Return only the documented normalized contract and stable platform errors.
- Preserve provider attribution and expose enough structured data for the UI to distinguish homonymous cities.
- Keep tests deterministic, offline, and free of real sleeps.
- Run the module handoff gate and dependency audit before completion.
- Update this spec before changing observable behavior.

### Ask first

- Change the route, public fields, result count, language, TTL, timeout, payload limit, feature-code policy, or error semantics.
- Add a query filter such as country, pagination, reverse geocoding, autocomplete streaming, stale-on-error, retry, or fallback provider.
- Add or replace a dependency or create shared code consumed by another module.
- Send additional user or request metadata upstream or add telemetry that leaves the process.
- Configure a customer endpoint/API key, exceed free limits, or deploy for commercial use.
- Move from the approved single-process cache/concurrency model to shared infrastructure.

### Never

- Let user input control an outbound origin, path, header, or credential.
- Trust TypeScript types in place of runtime validation for Open-Meteo data.
- Log queries, location labels, coordinates, client IPs, cache keys, full URLs, raw responses, secrets, or provider error text.
- Persist any of the data listed in the preceding rule in the current local implementation. The only proposed exception is the bounded Upstash cache specified above, activated through P0/P1 and verified integration; it does not permit raw IP storage, history or other persistence.
- Return raw provider payloads, provider errors, stack traces, or internal exception messages.
- Cache failures, serve stale data implicitly, retry `429` blindly, or bypass the shared executor/rate limits.
- Render or forward provider text as HTML.
- Add weather data, UI behavior, tracking, accounts, history, or favorites to this module.
- Weaken a project constraint, suppress a diagnostic, skip/delete a test, or use an unimplemented stub to make the gate pass.

## Success Criteria — implementação local

- [x] `GET /api/v1/locations?query=<valid>` returns zero to five normalized current populated places matching the exact public schema.
- [x] Homonymous results expose city, region or `null`, and country so a user can distinguish them before selection.
- [x] Empty search results are a cached `200` response, not an error.
- [x] Invalid requests fail with `400` before cache or outbound work.
- [x] The route participates in both the 30/minute location group and the 60/minute global rate limit.
- [x] Concurrent canonical-equivalent misses share one bounded external operation.
- [x] Valid and empty results expire after 24 hours; failures are never cached.
- [x] Every outbound call uses the fixed origin/parameters, a 5-second timeout, redirect rejection, and a 64 KiB decoded-body ceiling.
- [x] Malformed, unsafe, oversized, timed-out, rate-limited, and otherwise failed provider responses become the safe `503` envelope.
- [x] No response or log leaks the query beyond its necessary third-party request, or leaks cache keys, full URLs, coordinates in logs, raw bodies, or provider diagnostics.
- [x] Attribution is machine-readable in every success response and can be rendered by `weather-ui`.
- [x] Unit and integration tests use no live network or real sleep and cover all critical branches listed above.
- [x] Type checking, lint, formatting, API tests, build, coverage thresholds, time budgets, and the high-severity dependency audit pass.
- [x] Public deployment on the free endpoint remains blocked until an aggregate Open-Meteo usage strategy is approved across location and forecast traffic.
- [x] Commercial deployment remains blocked until an approved paid Open-Meteo configuration and privacy/licensing review exist.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Similar place names lead to the wrong forecast | Return region, country, country code, timezone and coordinates; require explicit UI selection |
| Arbitrary queries create quota pressure or cache churn | Validate length, rate-limit before handler work, bound the cache, coalesce duplicates and cap concurrency/queue size |
| Provider slowness consumes server resources | Enforce a 5-second abort, 64 KiB body ceiling and shared bounded executor |
| Provider schema drift corrupts the UI | Validate all consumed fields and fail closed with `503` |
| Filtering after an upstream limit returns fewer than five cities | Request ten candidates, retain only approved current populated-place codes, and accept a smaller list as correct |
| City searches reveal location interest | Keep the local cache process-only; disclose Open-Meteo transfer and, when implemented, the proposed Upstash TTL cache. Never log queries or create history |
| Free API use exceeds aggregate quotas or becomes commercial | Gate public launch on an aggregate usage strategy, gate commercial launch on a paid endpoint, and re-check terms in `production-delivery` |
| Attribution is omitted by the UI | Make attribution part of every successful API response and an integration requirement for `weather-ui` |

## Aprovações e pendências

A implementação local foi aprovada no Checkpoint L-B em 2026-09-23: rota e campos públicos, localização em português, filtro de lugares povoados atuais, limite de cinco resultados, cache de 24 horas, timeout de 5 segundos e teto de resposta de 64 KiB. A migração Redis foi aprovada para implementação na P0 e continua pendente da prova P1; o progresso está na lista ativa de produção.

The owner confirmed non-commercial use for the intended release on 2026-10-01. `production-delivery` must still recheck actual use and current Open-Meteo terms at release and prove an aggregate geocoding-plus-forecast usage ceiling; a future commercial change requires the paid-endpoint process above.

## Official Sources

- Open-Meteo Geocoding API: https://open-meteo.com/en/docs/geocoding-api
- Open-Meteo terms and privacy: https://open-meteo.com/en/terms
- Open-Meteo plans and attribution requirement: https://open-meteo.com/en/pricing
- Creative Commons Attribution 4.0: https://creativecommons.org/licenses/by/4.0/
- GeoNames feature codes: https://www.geonames.org/export/codes.html
- Node.js 24 global `fetch` and `AbortSignal.timeout`: https://nodejs.org/download/release/latest-v24.x/docs/api/globals.html
- TypeBox: https://github.com/sinclairzx81/typebox
