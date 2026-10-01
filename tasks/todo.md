# Tasks: Backend Platform

Status: Complete; corrective implementation approved by owner on 2026-09-23
Module id: `backend-platform`
Plan: `tasks/plan.md`

## Progress

- [x] T1 — Establish the npm workspace and pinned toolchain
- [x] T2 — Create a testable Fastify application harness
- [x] T3 — Validate immutable environment configuration
- [x] Checkpoint A — Foundation
- [x] T4 — Add health, request identity and safe completion logs
- [x] T5 — Enforce the stable public error envelope
- [x] T6 — Apply CORS and HTTP hardening
- [x] T7 — Implement global and route-group rate limits
- [x] Checkpoint B — HTTP platform
- [x] T8 — Implement the bounded TTL/LRU cache adapter
- [x] T9 — Consolidate identical in-flight operations
- [x] T10 — Bound concurrent and queued external work
- [x] T11 — Add production startup and graceful shutdown
- [x] Checkpoint C — Reverification after corrective work

## Corrective slices (approved by owner on 2026-09-23)

- [x] T12 — Count CORS preflights and malformed URLs in the global rate limit; return the request ID and public envelope for malformed URLs. Verify with focused `app.inject` abuse cases.
- [x] T13 — Preserve documented 400, 413 and 415 client-error statuses; add safe diagnostic classifications for unexpected and startup errors. Verify with HTTP and process tests.
- [x] T14 — Generate UUID request IDs, remove duplicate serialized keys, correlate visible cache events, and make production startup independent of development-only logging packages. Verify captured logs and production dependency install.
- [x] T15 — Compose the bounded cache, single-flight and one outbound executor in `buildApp`, expose a typed provider registration context, and bound queue waiting. Verify shared identity, configured limits and cancellation behavior.
- [x] T16 — Include test files in the official typecheck and rerun the complete checkpoint, including coverage, dependency audit and production smoke test.
- [x] T17 — Make cache expiry inclusive at the exact TTL boundary, with a deterministic regression test (owner approved 2026-09-23 during L4).

## Phase 1: Reproducible foundation

### Task 1: Establish the npm workspace and pinned toolchain

**Description:** Create the npm workspace, root TypeScript and Biome configuration, API package manifest and authoritative lockfile using the versions approved in the spec. Root scripts delegate to implemented workspaces without introducing application behavior.

**Acceptance criteria:**

- [x] One npm lockfile represents the repository and `npm ci` succeeds from a clean install.
- [x] Node/npm engine requirements and all approved dependency versions are represented without an unreviewed package.
- [x] Root type, lint, format, test, coverage and check commands are declared for workspace use.

**Verification:**

- [x] `npm ci`
- [x] `npm run lint`
- [x] `npm run format:check`
- [x] `npm audit --audit-level=high`

**Dependencies:** None

**Files likely touched:**

- `.gitignore` and `.npmrc` (repository safety and supply-chain preflight required before dependency installation)
- `package.json`
- `package-lock.json`
- `tsconfig.base.json`
- `biome.json`
- `apps/api/package.json`

**Estimated scope:** Medium implementation (5 workspace files) plus two repository-safety policy files

### Task 2: Create a testable Fastify application harness

**Description:** Add API compiler and test configuration plus the smallest side-effect-free `buildApp` implementation. Prove the app can be created, become ready and close through Fastify injection without opening a network port.

**Acceptance criteria:**

- [x] `buildApp` returns a typed Fastify instance and never calls `listen`.
- [x] The API builds as ESM under strict TypeScript 7 settings.
- [x] A baseline integration test creates, readies and closes the app without leaked handles.

**Verification:**

- [x] `npm run typecheck --workspace @nosso-clima/api`
- [x] `npm test --workspace @nosso-clima/api -- app.test.ts`
- [x] `npm run build --workspace @nosso-clima/api`

**Dependencies:** Task 1

**Files likely touched:**

- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/vitest.config.ts`
- `apps/api/src/app.ts`
- `apps/api/test/integration/app.test.ts`

**Estimated scope:** Medium (5 files)

### Task 3: Validate immutable environment configuration

**Description:** Parse all platform environment variables through `env-schema`, apply development/test defaults and fail fast on invalid production configuration. Keep parsing pure so tests can pass explicit environment objects.

**Acceptance criteria:**

- [x] Every variable and production-only rule in the spec is validated and typed.
- [x] Configuration is immutable and no application module reads `process.env` directly after startup.
- [x] `.env.example` contains safe names and placeholders without secrets.

**Verification:**

- [x] `npm test --workspace @nosso-clima/api -- env.test.ts`
- [x] `npm run typecheck --workspace @nosso-clima/api`
- [x] `npm run lint --workspace @nosso-clima/api`

**Dependencies:** Task 2

**Files likely touched:**

- `apps/api/src/config/env.ts`
- `apps/api/test/unit/env.test.ts`
- `apps/api/.env.example`

**Estimated scope:** Medium (3 files)

## Checkpoint A: Foundation

- [x] `npm run check --workspace @nosso-clima/api`
- [x] `npm audit --audit-level=high`
- [x] Clean installation and check complete within the approved budgets.
- [x] Human reviews the foundation before HTTP platform work continues.

## Phase 2: Stable HTTP platform

### Task 4: Add health, request identity and safe completion logs

**Description:** Register the minimal `/health` route, return the generated request ID in every response and emit structured completion logs containing only allowlisted operational fields.

**Acceptance criteria:**

- [x] `GET /health` returns exactly the approved `{ "status": "ok" }` contract with no external I/O.
- [x] Every response includes `x-request-id`, and logs correlate method, route template, status and duration.
- [x] Captured logs omit raw IP, query values, coordinates, bodies and cache keys.

**Verification:**

- [x] `npm test --workspace @nosso-clima/api -- health.test.ts`
- [x] `npm run typecheck --workspace @nosso-clima/api`
- [x] Inspect captured test logs for both required and forbidden fields.

**Dependencies:** Task 3

**Files likely touched:**

- `apps/api/src/app.ts`
- `apps/api/src/plugins/request-context.ts`
- `apps/api/src/routes/health.ts`
- `apps/api/test/integration/health.test.ts`

**Estimated scope:** Medium (4 files)

### Task 5: Enforce the stable public error envelope

**Description:** Introduce internal typed errors and one Fastify error handler that maps validation, not-found, saturation and unexpected failures to the approved response shape without leaking internals.

**Acceptance criteria:**

- [x] Every specified error class maps to its status, stable code and current request ID.
- [x] Unknown routes and malformed inputs use the same envelope.
- [x] Unexpected errors expose neither stack nor original internal message.

**Verification:**

- [x] `npm test --workspace @nosso-clima/api -- errors.test.ts`
- [x] `npm run typecheck --workspace @nosso-clima/api`
- [x] Review snapshots or structural assertions for forbidden internal fields.

**Dependencies:** Task 4

**Files likely touched:**

- `apps/api/src/app.ts`
- `apps/api/src/errors/api-error.ts`
- `apps/api/src/errors/error-handler.ts`
- `apps/api/src/schemas/errors.ts`
- `apps/api/test/integration/errors.test.ts`

**Estimated scope:** Medium (5 files)

### Task 6: Apply CORS and HTTP hardening

**Description:** Add allowlisted CORS, official security headers, the 16 KiB body bound and safe proxy defaults. Keep development origins explicit and reject wildcard production configuration.

**Acceptance criteria:**

- [x] Allowed origins receive correct CORS headers and unlisted origins do not.
- [x] Security headers and body-size rejection are observable through `app.inject`.
- [x] Forwarded headers do not affect the client address while proxy trust is disabled.

**Verification:**

- [x] `npm test --workspace @nosso-clima/api -- security.test.ts`
- [x] `npm run typecheck --workspace @nosso-clima/api`
- [x] `npm audit --audit-level=high`

**Dependencies:** Task 4

**Files likely touched:**

- `apps/api/src/app.ts`
- `apps/api/src/plugins/cors.ts`
- `apps/api/src/plugins/security.ts`
- `apps/api/test/integration/security.test.ts`

**Estimated scope:** Medium (4 files)

### Task 7: Implement global and route-group rate limits

**Description:** Configure the patched Fastify limiter with one aggregate per-IP bucket and independent provider-route buckets. Ensure all rejected traffic uses the public error contract and that spoofed forwarding headers cannot create buckets.

**Acceptance criteria:**

- [x] The 61st aggregate request in a minute receives `429`, `RATE_LIMITED` and retry headers.
- [x] Independent 30/minute and 15/minute group buckets are both enforced in addition to the global bucket.
- [x] Alternating route groups, malformed requests and forwarded-address spoofing cannot bypass the aggregate ceiling.

**Verification:**

- [x] `npm test --workspace @nosso-clima/api -- rate-limit.test.ts`
- [x] Assert `@fastify/rate-limit` resolves to 11.2.0 or a reviewed newer release in major 11.
- [x] `npm run typecheck --workspace @nosso-clima/api`

**Dependencies:** Tasks 5 and 6

**Files likely touched:**

- `apps/api/src/app.ts`
- `apps/api/src/plugins/rate-limit.ts`
- `apps/api/src/schemas/errors.ts`
- `apps/api/test/integration/rate-limit.test.ts`

**Estimated scope:** Medium (4 files)

## Checkpoint B: HTTP platform

- [x] `npm run check --workspace @nosso-clima/api`
- [x] Health, error, security and rate-limit integration suites pass without wall-clock sleeps.
- [x] Captured responses and logs contain no prohibited information.
- [x] Human reviews the public HTTP contract before resilience primitives continue.

## Phase 3: Bounded resilience primitives

### Task 8: Implement the bounded TTL/LRU cache adapter

**Description:** Wrap `lru-cache` behind the approved generic interface with per-entry TTL, bounded capacity and deterministic time behavior.

**Acceptance criteria:**

- [x] Get, set, delete, clear and size follow the approved contract.
- [x] Expired values disappear and least-recently-used values are evicted at the configured bound.
- [x] Tests use fake/injected time and never sleep.

**Verification:**

- [x] `npm test --workspace @nosso-clima/api -- cache.test.ts`
- [x] `npm run typecheck --workspace @nosso-clima/api`
- [x] `npm run lint --workspace @nosso-clima/api`

**Dependencies:** Task 2

**Files likely touched:**

- `apps/api/src/infrastructure/cache.ts`
- `apps/api/test/unit/cache.test.ts`

**Estimated scope:** Small (2 files)

### Task 9: Consolidate identical in-flight operations

**Description:** Implement `SingleFlight` so concurrent callers for one key share one promise and failed or completed operations cannot remain stuck in the registry.

**Acceptance criteria:**

- [x] Concurrent equal keys execute the operation once and receive the same settlement.
- [x] Different keys remain independent.
- [x] Success and rejection both remove registry entries so a later call can execute again.

**Verification:**

- [x] `npm test --workspace @nosso-clima/api -- single-flight.test.ts`
- [x] `npm run typecheck --workspace @nosso-clima/api`
- [x] Test rejected promises without unhandled-rejection output.

**Dependencies:** Task 2

**Files likely touched:**

- `apps/api/src/infrastructure/single-flight.ts`
- `apps/api/test/unit/single-flight.test.ts`

**Estimated scope:** Small (2 files)

### Task 10: Bound concurrent and queued external work

**Description:** Implement the outbound executor with a configurable concurrency ceiling, an equally bounded waiting queue and immediate typed saturation failure.

**Acceptance criteria:**

- [x] Running operations never exceed the configured concurrency ceiling.
- [x] Waiting operations never exceed the configured queue bound; excess work fails immediately as unavailable.
- [x] Resolve and reject paths both release capacity and start the next queued operation.

**Verification:**

- [x] `npm test --workspace @nosso-clima/api -- concurrency.test.ts`
- [x] `npm run typecheck --workspace @nosso-clima/api`
- [x] Deterministic deferred-promise test proves the maximum observed concurrency.

**Dependencies:** Task 2

**Files likely touched:**

- `apps/api/src/infrastructure/concurrency.ts`
- `apps/api/test/unit/concurrency.test.ts`

**Estimated scope:** Small (2 files)

### Task 11: Add production startup and graceful shutdown

**Description:** Add the sole network-listening entry point and isolated shutdown orchestration. Verify startup failure, SIGINT/SIGTERM handling and clean closure without allowing tests to terminate their own runner.

**Acceptance criteria:**

- [x] `server.ts` is the only module that calls `listen` and reads the real process environment.
- [x] SIGINT and SIGTERM close Fastify once and produce the documented exit behavior.
- [x] Production build starts, serves `/health` and stops cleanly without contacting Open-Meteo.

**Verification:**

- [x] `npm test --workspace @nosso-clima/api -- server-lifecycle.test.ts`
- [x] `npm run build --workspace @nosso-clima/api`
- [x] Run the compiled server smoke test, request `/health`, send SIGTERM and verify clean exit.

**Dependencies:** Tasks 3 through 10

**Files likely touched:**

- `apps/api/src/app.ts`
- `apps/api/src/server.ts`
- `apps/api/src/lifecycle/shutdown.ts`
- `apps/api/test/integration/server-lifecycle.test.ts`
- `apps/api/package.json`

**Estimated scope:** Medium (5 files)

## Checkpoint C: Module complete (reopened)

- [x] Every success criterion in `SPEC-backend-platform.md` is checked, including new regressions.
- [x] `npm run check --workspace @nosso-clima/api`
- [x] `npm run test:coverage --workspace @nosso-clima/api` meets all 80% thresholds and fully exercises critical branches.
- [x] `npm run build --workspace @nosso-clima/api`
- [x] `npm audit --audit-level=high` has no unmitigated high or critical finding.
- [x] Local handoff checks complete within 90 seconds; full checks remain below five minutes.
- [x] No floor violation or unapproved exception appears in the diff.
- [x] Human reviews the implementation before the module is marked complete (approved on 2026-09-23).

---

# Tasks: Location Search

Status: Complete; Checkpoint L-B approved by owner on 2026-09-23
Module id: `location-search`
Source spec: `SPEC-location-search.md` (approved 2026-09-23)
Plan: `tasks/plan.md`, Location Search section

## Progress

- [x] L1 — Define the public response contract and canonical query
- [x] L2 — Enforce fixed-origin, bounded geocoding transport
- [x] L3 — Validate and normalize upstream places
- [x] Checkpoint L-A — Contract and adapter boundary
- [x] L4 — Compose cache, single-flight and shared executor
- [x] L5 — Register the HTTP route and verify errors, limits and privacy
- [x] L6 — Verify production composition and run the complete module gate
- [x] Checkpoint L-B — Owner review

## Task L1: Define public contract and canonical query

**Description:** Add the TypeBox success schema and fixed attribution plus pure helpers for query canonicalization and raw query-key validation. The route will call the raw-key helper in `preValidation`, before schema validation.

**Acceptance criteria:**

- [x] The public schema matches the approved zero-to-five-location response and attribution exactly.
- [x] NFKC, whitespace collapse, two-to-100-code-point bounds and optional single qualifier are deterministic; controls, empty qualifiers and multiple commas fail.
- [x] `URLSearchParams`-based raw-query tests prove repeated or unknown keys fail; the helper requires exactly one `query` and never relies on Fastify's post-validation `request.query`.

**Verification:** `npm test --workspace @nosso-clima/api -- location-query`; API typecheck, lint and format check.

**Dependencies:** Approved `SPEC-location-search.md`.

**Files likely touched:** `apps/api/src/locations/location-contract.ts`, `apps/api/src/locations/location-query.ts`, `apps/api/test/unit/location-query.test.ts`.

**Estimated scope:** Medium (3 files).

## Task L2: Enforce fixed-origin bounded transport

**Description:** Implement an injectable Node `fetch` adapter that never lets input select an origin and bounds the entire fetch/body operation.

**Acceptance criteria:**

- [x] Request uses the exact HTTPS geocoding path and approved parameters, `redirect: 'error'`, and a 5-second abort signal.
- [x] Only 200 JSON responses are accepted; decoded response reading stops at 65,536 bytes, including stalled-stream abort behavior.
- [x] Redirect, network, status, content-type, timeout and oversized-body failures are classified without exposing provider text.

**Verification:** `npm test --workspace @nosso-clima/api -- open-meteo-geocoding`; API typecheck, lint and format check.

**Dependencies:** L1 for canonical query input; transport tests do not require the HTTP route.

**Files likely touched:** `apps/api/src/locations/open-meteo-geocoding.ts`, `apps/api/test/unit/open-meteo-geocoding.test.ts`.

**Estimated scope:** Small (2 files).

## Task L3: Validate and normalize upstream places

**Description:** Treat parsed JSON as unknown, validate every consumed field, filter current populated places, deduplicate IDs and preserve relevance order.

**Acceptance criteria:**

- [x] Missing results become an empty list; more than ten candidates or malformed consumed fields fail closed.
- [x] Accepted feature codes map to at most five valid normalized locations; unsupported and historical codes are filtered.
- [x] Optional `admin1`, localized names, coordinates, timezone, text limits and duplicate IDs follow the spec.

**Verification:** `npm test --workspace @nosso-clima/api -- open-meteo-geocoding`; `npm run check --workspace @nosso-clima/api`.

**Dependencies:** L2.

**Files likely touched:** `apps/api/src/locations/open-meteo-geocoding.ts`, `apps/api/test/unit/open-meteo-geocoding.test.ts`.

**Estimated scope:** Small (2 files).

## Checkpoint L-A: Contract and adapter boundary

- [x] L1–L3 focused tests and the complete API check pass.
- [x] Every provider failure and malformed consumed field has a deterministic offline test.
- [x] A human reviews the external-data and privacy boundary before orchestration continues (owner: “continue”, 2026-09-23).

## Task L4: Compose cache, single-flight and shared executor

**Description:** Orchestrate a namespaced 24-hour cache, duplicate-flight control and the backend-platform executor without creating private infrastructure.

**Acceptance criteria:**

- [x] Positive and empty arrays cache for exactly 24 hours; failures never cache, and a second cache check occurs inside the flight.
- [x] Canonical-equivalent concurrent queries share one outbound operation; distinct queries remain independent.
- [x] Saturation and expected adapter failures propagate as safe 503 errors with request-correlated, bounded warnings.

**Verification:** `npm test --workspace @nosso-clima/api -- location-search-service`; API typecheck, lint and format check.

**Dependencies:** L3 and Checkpoint L-A.

**Files likely touched:** `apps/api/src/locations/location-search-service.ts`, `apps/api/test/unit/location-search-service.test.ts`.

**Estimated scope:** Small (2 files).

## Task L5: Register HTTP route and verify integration behavior

**Description:** Compose `GET /api/v1/locations` once in `app.ts` through the shared platform context and prove the public contract with Fastify injection. `server.ts` does not register the route.

**Acceptance criteria:**

- [x] Valid and empty searches return the exact schema and request ID. A route-local `preValidation` check of raw `URLSearchParams` rejects duplicate or unknown keys before Ajv can remove them, without changing global `removeAdditional` behavior; an HTTP `app.inject` regression proves `GET /api/v1/locations?query=ab&foo=1` returns the safe 400 envelope with zero adapter calls.
- [x] `buildApp()` exposes the route by default, `fetchImpl` enables offline HTTP tests, `createCache('location-search')` is called once, and the location-group 30/minute and global 60/minute limits both apply.
- [x] Expected provider failures return 503 and defects remain 500; concurrent requests coalesce, and captured logs omit queries, coordinates, cache keys, raw bodies and upstream URLs.

**Verification:** `npm test --workspace @nosso-clima/api -- locations`; `npm run check --workspace @nosso-clima/api`.

**Dependencies:** L1 and L4.

**Files likely touched:** `apps/api/src/routes/locations.ts`, `apps/api/src/app.ts`, `apps/api/test/integration/locations.test.ts`, `apps/api/test/integration/app.test.ts`.

**Estimated scope:** Medium (4 files).

## Task L6: Verify production composition and run full gate

**Description:** Verify that the route already composed in `buildApp()` is visible in the single production server; reverify the complete API module without contacting Open-Meteo.

**Acceptance criteria:**

- [x] The unchanged `server.ts` receives the route through `buildApp()` without a second `createCache('location-search')` call; health and backend-platform behavior remain unchanged.
- [x] A local compiled-server smoke test confirms startup, the route's offline-safe invalid-query path, and clean shutdown (2026-09-23: `/health` 200, unknown query key 400, `SIGINT` shutdown succeeded).
- [x] Coverage, build, audit, privacy assertions and all local spec success criteria pass; public/commercial deployment gates remain documented.

**Verification:** `npm run check --workspace @nosso-clima/api`; `npm run test:coverage --workspace @nosso-clima/api`; `npm audit --audit-level=high`; compiled-server smoke test.

**Dependencies:** L5.

**Files likely touched:** `apps/api/test/integration/server-lifecycle.test.ts`, `apps/api/test/integration/locations.test.ts`.

**Estimated scope:** Small (2 files).

## Checkpoint L-B: Owner review

- [x] Every `SPEC-location-search.md` success criterion is verified or remains an explicit deployment gate.
- [x] All active `CONSTRAINTS.md` floors and local time budgets pass.
- [x] Public deployment remains blocked until `production-delivery` approves an aggregate Open-Meteo usage budget or a demonstrably lower traffic ceiling across geocoding and forecast; per-IP limits alone do not satisfy this gate.
- [x] Owner reviews the implementation before this module is marked complete (owner: “continue”, 2026-09-23).

---

# Tasks: Weather Forecast

Status: Local implementation complete; owner review approved on 2026-09-24
Module id: `weather-forecast`
Source spec: `SPEC-weather-forecast.md` (approved 2026-09-23)
Plan: `tasks/plan.md`, Weather Forecast section

## Progress

- [x] W1 — Define forecast response contract and canonical request query
- [x] W2 — Map WMO conditions
- [x] W3 — Bound fixed-origin Open-Meteo transport
- [x] Checkpoint W-A — Public contract and outbound transport
- [x] W4 — Validate and normalize external forecast data
- [x] W5 — Compose cache, single-flight and shared executor
- [x] W6 — Register and verify the HTTP route
- [x] Checkpoint W-B — Injected end-to-end forecast flow
- [x] W7 — Verify production composition and complete module gate
- [x] Checkpoint W-C — Owner review

The detailed W1–W6 boxes below are synchronized with the completed W-C handoff. Their testable behavior is present in the current API suite; the dated W7 evidence remains a historical run, not a claim about the current test count.

## Task W1: Define public contract and canonical request query

**Description:** Add the TypeBox success schema and fixed attribution, plus pure helpers for exact raw-key validation, bounded coordinates, three-decimal rounding, canonical IANA timezone and canonical cache-key input. No route or fetch is added yet.

**Acceptance criteria:**

- [x] Success schema matches the approved current-plus-seven-day shape and permits `null` only for daily precipitation probability.
- [x] Exactly one of each required key is accepted; unknown/repeated keys, invalid coordinates, numeric offsets and invalid timezone strings fail as safe validation errors.
- [x] Equivalent numeric spellings and coordinates rounding to the same three-decimal values share canonical coordinates; exact halfway cases round away from zero, negative zero becomes zero, and bounds are checked before rounding.
- [x] Accepted IANA aliases resolve to the runtime's canonical timezone for the outbound parameter, response and cache key, while offsets remain invalid.

**Verification:** `npm test --workspace @nosso-clima/api -- forecast-query`; API typecheck, lint and format check.

**Dependencies:** Approved `SPEC-weather-forecast.md`.

**Files likely touched:** `apps/api/src/forecast/forecast-contract.ts`, `apps/api/src/forecast/forecast-query.ts`, `apps/api/test/unit/forecast-query.test.ts`.

**Estimated scope:** Medium (3 files).

## Task W2: Map WMO conditions

**Description:** Implement pure, exhaustive WMO category/Portuguese-label mapping.

**Acceptance criteria:**

- [x] Every listed WMO code maps to the documented category and label; unknown/non-integer codes fail closed.
- [x] Daily and current conditions use the same mapping, without computing an hourly predominant condition.

**Verification:** `npm test --workspace @nosso-clima/api -- wmo-condition`; API typecheck, lint and format check.

**Dependencies:** W1 for public types.

**Files likely touched:** `apps/api/src/forecast/wmo-condition.ts`, `apps/api/test/unit/wmo-condition.test.ts`.

**Estimated scope:** Small (2 files).

## Task W3: Bound fixed-origin Open-Meteo transport

**Description:** Add a fetch-injected transport that builds only the approved forecast URL and returns parsed `unknown` JSON under a finite whole-operation bound. Record an offline fixture from an actual Open-Meteo forecast response for a public city, with retrieval date and source URL, and use it for the transport success path.

**Acceptance criteria:**

- [x] The HTTPS origin, path and fixed parameters are exact; input only fills validated coordinates and timezone values, with `redirect: 'error'` and no extra caller-controlled metadata.
- [x] One 5-second abort bounds both fetch and stream consumption; stalled operations, non-200/non-JSON responses, invalid JSON and decoded bodies over 65,536 bytes fail safely.
- [x] Failure kinds are bounded; tests use fake fetch/streams and a captured real response fixture, without live network or sleep during verification. Synthetic failure variants are clearly labeled.

**Verification:** `npm test --workspace @nosso-clima/api -- open-meteo-forecast`; API typecheck, lint and format check.

**Dependencies:** W1.

**Files likely touched:** `apps/api/src/forecast/open-meteo-forecast.ts`, `apps/api/test/unit/open-meteo-forecast.test.ts`, `apps/api/test/fixtures/open-meteo-forecast.json` (fixture provenance recorded alongside it).

**Estimated scope:** Medium (3–4 files).

## Checkpoint W-A: Public contract and outbound transport

- [x] W1–W3 focused tests and `npm run check --workspace @nosso-clima/api` pass; the real response fixture has documented provenance and runs offline.
- [x] Raw query validation, WMO boundaries and transport failure branches have deterministic offline tests.
- [x] Review the request and outbound privacy boundary before normalization expands.

## Task W4: Validate and normalize external forecast data

**Description:** Treat the parsed payload as `unknown` and produce only the documented response fields after validating all consumed units and values. Use the immutable real-response fixture as the baseline and explicitly labeled mutations for malformed and nullable cases.

**Acceptance criteria:**

- [x] Current values, unit metadata, timezone, each seven-entry daily array and seven consecutive local dates are validated; malformed consumed values fail as `invalid_response`.
- [x] Individual `null` daily rain probabilities are preserved; missing values or `null` elsewhere fail.
- [x] Daily condition uses `daily.weather_code` as the most severe condition; a real provider fixture normalizes to the expected shape, and no unconsumed provider field reaches the public result.

**Verification:** `npm test --workspace @nosso-clima/api -- open-meteo-forecast`; `npm run check --workspace @nosso-clima/api`.

**Dependencies:** W2, W3 and Checkpoint W-A.

**Files likely touched:** `apps/api/src/forecast/open-meteo-forecast.ts`, `apps/api/test/unit/open-meteo-forecast.test.ts`, `apps/api/test/fixtures/open-meteo-forecast.json` (read-only baseline).

**Estimated scope:** Medium (3 files).

## Task W5: Compose cache, single-flight and shared executor

**Description:** Add a forecast service using only existing backend-platform resources for bounded external work and process-local reuse.

**Acceptance criteria:**

- [x] Fake-time tests prove a validated success and `retrievedAtUtc` stay unchanged at 599,999 ms, expire at exactly 600,000 ms and refetch at or after that boundary; failures never cache, and a second cache lookup occurs inside the flight.
- [x] Equivalent concurrent locations coalesce while distinct locations remain independent; shared executor saturation yields safe 503 behavior.
- [x] Expected provider failures emit one request-correlated warning with fixed failure kind and optional numeric status, without private query, coordinate, timezone, URL or body data.

**Verification:** `npm test --workspace @nosso-clima/api -- forecast-service`; API typecheck, lint and format check.

**Dependencies:** W4.

**Files likely touched:** `apps/api/src/forecast/forecast-service.ts`, `apps/api/test/unit/forecast-service.test.ts`.

**Estimated scope:** Small (2 files).

## Task W6: Register and verify the HTTP route

**Description:** Compose the forecast route once in `buildApp()` through the shared platform context and prove the public contract with Fastify injection.

**Acceptance criteria:**

- [x] Valid requests return the exact schema, attribution and request ID; `preValidation` rejects unknown/repeated keys, including an HTTP `foo=1` regression with zero fetches.
- [x] The route is available from plain `buildApp()`, claims `createCache('weather-forecast')` once and uses both 15/minute weather-group and 60/minute global limits.
- [x] Timeout/provider errors return safe 503, defects stay 500, concurrent misses coalesce and captured logs/public errors omit private data; existing platform/location tests remain green.

**Verification:** `npm test --workspace @nosso-clima/api -- forecast`; `npm run check --workspace @nosso-clima/api`.

**Dependencies:** W1, W5.

**Files likely touched:** `apps/api/src/routes/forecast.ts`, `apps/api/src/app.ts`, `apps/api/test/integration/forecast.test.ts`, `apps/api/test/integration/app.test.ts` (and one existing namespace-claim test if needed).

**Estimated scope:** Medium (4–5 files).

## Checkpoint W-B: Injected end-to-end forecast flow

- [x] `npm run check --workspace @nosso-clima/api` passes with all location and platform regressions.
- [x] Exact HTTP schema, limiter layering, safe error envelopes and privacy/log assertions pass offline.
- [x] Review the complete injected route before process-level verification.

## Task W7: Verify production composition and complete module gate

**Description:** Verify the already-composed forecast route through the compiled server and repeat every active API quality gate without contacting Open-Meteo.

**Acceptance criteria:**

- [x] Compiled server serves `/health`, returns safe 400 for an invalid forecast query and stops cleanly; `server.ts` needs no route registration.
- [x] Complete API check, coverage, production build, audit and local time budgets pass with no weakened constraint or skipped test.
- [x] Every forecast success criterion is verified or remains an explicit public/commercial deployment gate.

**Verification:** `npm run check --workspace @nosso-clima/api`; `npm run test:coverage --workspace @nosso-clima/api`; `npm run build --workspace @nosso-clima/api`; `npm audit --audit-level=high`; compiled-server smoke test.

**Dependencies:** W6 and Checkpoint W-B.

**Files likely touched:** `apps/api/test/integration/server-lifecycle.test.ts`, `apps/api/test/integration/forecast.test.ts`.

**Estimated scope:** Small (2 files).

**W7 evidence (2026-09-24):** With the pinned npm 12.0.2, `npm run check --workspace @nosso-clima/api` passed in 7.54 s (367 tests); `npm run test:coverage --workspace @nosso-clima/api` passed in 5.80 s with 93.91% statements, 89.64% branches, 95.36% functions and 97.4% lines; `npm run build --workspace @nosso-clima/api` passed in 0.65 s; `npm audit --audit-level=high` found zero vulnerabilities. A production-configured `node dist/server.js` process bound to `127.0.0.1`, returned `200` from `/health` and `400 VALIDATION_ERROR` with a request ID for an invalid forecast query, then exited cleanly after `SIGTERM`. No request contacted Open-Meteo. All local checks stayed below the 90-second budget. Public and commercial deployment gates remain in `production-delivery`.

**W7 follow-up (2026-09-24):** The forecast handler now uses the query canonicalized in `preValidation`. Regression tests cover the same-request handoff, network failure after a streamed chunk, invalid provider timezone, nonconsecutive or mismatched local dates, and three-key invalid queries. Redundant unreachable guards were removed. The complete API check passed in 4.51 s (380 tests) and coverage passed in 3.74 s: 95.14% statements, 92.03% branches, 95.36% functions and 98.02% lines overall. `forecast-query.ts` and `open-meteo-forecast.ts` now have 100% line coverage; this does not claim 100% branch coverage.

## Checkpoint W-C: Owner review

- [x] Every local `SPEC-weather-forecast.md` success criterion and active `CONSTRAINTS.md` floor is met.
- [x] Public deployment remains blocked until `production-delivery` approves aggregate Open-Meteo usage across geocoding and forecasting, current licensing, attribution and privacy notice; commercial deployment additionally needs paid-endpoint review.
- [x] Owner reviews implementation before this module is marked complete (owner: “aprovo”, 2026-09-24).

---

# Tasks: Weather UI

Status: Local flow approved at Checkpoint U-C on 2026-09-24; 2026-10-01 corrective checks verified locally
Module id: `weather-ui`
Source spec: `SPEC-weather-ui.md` (approved 2026-09-24)
Plan: `tasks/plan.md`, Weather UI section

## Progress

- [x] U1 — Bootstrap an independent neutral web app
- [x] U2 — Activate web quality and architecture gates
- [x] U3 — Parse and request location suggestions safely
- [x] U4 — Parse and request forecasts safely
- [x] Checkpoint U-A — Independent HTTP boundaries
- [x] U5 — Build accessible city search
- [x] U6 — Connect explicit selection and forecast states
- [x] Checkpoint U-B — Offline city-to-forecast flow
- [x] U7 — Present current conditions and timestamps
- [x] U8 — Present seven local-day cards
- [x] U9 — Map backgrounds and build responsive surfaces
- [x] U10 — Complete browser accessibility and module gate
- [x] Checkpoint U-C — Owner review (approved 2026-09-24)

## Task U1: Bootstrap an independent neutral web app

**Description:** Add `@nosso-clima/web` to the existing npm workspace with pinned compatible React/Vite/TypeScript dependencies and a buildable neutral first screen. This slice makes no API request and does not move the WebP assets.

**Acceptance criteria:**

- [x] A 360 px and desktop browser can render a labelled city search prompt without a default city or network request.
- [x] `npm run dev --workspace @nosso-clima/web` and `npm run build --workspace @nosso-clima/web` work independently from the API; the lockfile pins reviewed versions.
- [x] The dependency diff has no unmitigated high/critical advisory, and no API runtime import enters the web app.

**Verification:** `npm run build --workspace @nosso-clima/web`; `npm run typecheck --workspace @nosso-clima/web`; `npm audit --audit-level=high`; browser first-load network inspection.

**Dependencies:** Approved `SPEC-weather-ui.md` and approved UI plan/tasks.

**Files likely touched:** `apps/web/package.json`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`, `apps/web/src/app.tsx`, generated root `package-lock.json`.

**Estimated scope:** Medium (one bootstrap slice plus generated lockfile).

## Task U2: Activate web quality and architecture gates

**Description:** Add web test/coverage/typecheck/lint/format commands and a root import-boundary check before feature logic grows. Keep the root canonical checks passing.

**Acceptance criteria:**

- [x] Web-local check and coverage commands run; the 80% thresholds cover statements, branches, functions and lines.
- [x] `npm run check:boundaries` fails on prohibited web-to-API and API-to-web imports and passes the real repository.
- [x] Root `npm run check` includes the web workspace without losing the existing API tests.

**Verification:** `npm run check --workspace @nosso-clima/web`; `npm run check:boundaries`; `npm run check`; boundary-command negative fixtures.

**Dependencies:** U1.

**Files likely touched:** `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vitest.config.ts`, `package.json`, `scripts/check-boundaries.mjs`.

**Estimated scope:** Medium (5 files).

## Task U3: Parse and request location suggestions safely

**Description:** Define a web-local location contract and fixed-route fetch adapter that accepts only the consumed approved response shape and bounded public errors.

**Acceptance criteria:**

- [x] The request uses `URLSearchParams` with only `query`; base URL configuration cannot come from user input.
- [x] Valid, empty, malformed, 429, 503 and network responses produce typed results or bounded errors without leaking provider data.
- [x] Location fields needed for selection and both attribution sources survive parsing; extra unconsumed fields do not appear in the UI model.

**Verification:** `npm test --workspace @nosso-clima/web -- locations`; web typecheck, lint and format check.

**Dependencies:** U2.

**Files likely touched:** `apps/web/src/api/locations.ts`, `apps/web/src/api/location-contract.ts`, `apps/web/test/locations.test.ts`.

**Estimated scope:** Medium (3 files).

## Task U4: Parse and request forecasts safely

**Description:** Add a fixed-route forecast client and web-local parser for the approved current-plus-seven-day response, without importing backend runtime code.

**Acceptance criteria:**

- [x] Outbound query uses only selected `latitude`, `longitude` and `timezone`; malformed HTTP/JSON/data and public errors become bounded UI errors.
- [x] The parser keeps seven ordered local dates, current/attribution fields and only the permitted nullable rain probability.
- [x] Tests cover 429/503, malformed dates and fields, null preservation and no backend source import.

**Verification:** `npm test --workspace @nosso-clima/web -- forecast`; web typecheck, lint and format check.

**Dependencies:** U2.

**Files likely touched:** `apps/web/src/api/forecast.ts`, `apps/web/src/api/forecast-contract.ts`, `apps/web/test/forecast.test.ts`.

**Estimated scope:** Medium (3 files).

## Checkpoint U-A: Independent HTTP boundaries

- [x] `npm run check --workspace @nosso-clima/web`, root `npm run check` and `npm run check:boundaries` pass.
- [x] Neutral first load and both clients are verified offline with no provider call or API runtime import.
- [x] Review response parsing and privacy boundary before asynchronous UI state expands.

## Task U5: Build accessible city search

**Description:** Provide a labelled suggestion picker with search loading, empty, failure and attribution states. Use a three-code-point threshold, 300 ms debounce, cancellation and request-identity guard.

**Acceptance criteria:**

- [x] No search request occurs below three trimmed code points or before the debounce; at most five distinguishable results appear after success.
- [x] Arrow keys, Enter, Escape, Tab, pointer selection, active-option semantics and live result status work without a focus trap.
- [x] Superseded responses cannot replace newer suggestions; 429, unavailable and empty states differ, and search attribution links are visible with results.

**Verification:** `npm test --workspace @nosso-clima/web -- city-search`; web check; real-browser keyboard inspection.

**Dependencies:** U3 and Checkpoint U-A.

**Files likely touched:** `apps/web/src/components/city-search.tsx`, `apps/web/src/hooks/use-location-search.ts`, `apps/web/src/app.tsx`, `apps/web/test/city-search.test.tsx`.

**Estimated scope:** Medium (4 files).

## Task U6: Connect explicit selection and forecast states

**Description:** A selected location starts one forecast request and drives loading, ready, rate-limited, unavailable and manual-retry states; a changed city cannot inherit old data.

**Acceptance criteria:**

- [x] Initial and edited-but-unselected states make no forecast call; selection passes only that result's coordinates and timezone.
- [x] Selecting another city clears the prior forecast; aborted or late older responses cannot replace the new city's state.
- [x] 429 has a specific message, other failures are generic, a retry is explicit, and no automatic retry or stale weather appears.

**Verification:** `npm test --workspace @nosso-clima/web -- forecast-flow`; web check; browser selection/retry smoke.

**Dependencies:** U4 and U5.

**Files likely touched:** `apps/web/src/hooks/use-forecast.ts`, `apps/web/src/app.tsx`, `apps/web/src/components/forecast-state.tsx`, `apps/web/test/forecast-flow.test.tsx`.

**Estimated scope:** Medium (4 files).

## Checkpoint U-B: Offline city-to-forecast flow

- [x] A mocked city search, explicit keyboard/pointer selection and forecast success work through the rendered app.
- [x] Empty, 429, 503, malformed response, retry and crossed-request races remain safe and distinct.
- [x] Web/root checks and the architecture boundary check pass before weather presentation expands.

## Task U7: Present current conditions and timestamps

**Description:** Render the current result, selected city, local valid minute, retrieval time and forecast attribution with clear units and Portuguese wording.

**Acceptance criteria:**

- [x] Temperature, apparent temperature, category label and wind use the approved contract and units without WMO remapping.
- [x] `validAtLocal` remains the city's local time, while `retrievedAtUtc` is formatted in the response timezone; tests use a viewer in another timezone.
- [x] Open-Meteo/CC BY 4.0 credit is linked and says the data was adapted; no current value is called an observed measurement.

**Verification:** `npm test --workspace @nosso-clima/web -- current`; web check; 360 px/desktop preview.

**Dependencies:** U6.

**Files likely touched:** `apps/web/src/components/current-conditions.tsx`, `apps/web/src/format/weather-format.ts`, `apps/web/src/app.tsx`, `apps/web/test/current-conditions.test.tsx`.

**Estimated scope:** Medium (4 files).

## Task U8: Present seven local-day cards

**Description:** Render seven civil-date cards with approved metric labels, most-severe daily condition, separate rain chance/amount and unavailable rain probability.

**Acceptance criteria:**

- [x] Seven ordered dates and weekdays remain correct across browser/selected-city timezone differences.
- [x] Max/min temperature and apparent temperature, maximum wind, chance and amount all show correct units.
- [x] `null` rain chance displays “Indisponível”, never zero; condition wording says “mais severa”, never “predominante”.

**Verification:** `npm test --workspace @nosso-clima/web -- daily`; web check; mobile/desktop card inspection.

**Dependencies:** U7.

**Files likely touched:** `apps/web/src/components/daily-forecast.tsx`, `apps/web/src/format/weather-format.ts`, `apps/web/src/app.tsx`, `apps/web/test/daily-forecast.test.tsx`.

**Estimated scope:** Medium (4 files).

## Task U9: Map backgrounds and build responsive surfaces

**Description:** Bundle ten WebP files in the web app while retaining ten originals under `backgrounds/`; the five bundled night files are optimized variants. Select one bundled file from current category and `isDay`. Add neutral/failure fallback, readable content surfaces and responsive styling.

**Acceptance criteria:**

- [x] All ten category/day-night combinations resolve to the intended file; neutral/loading/image-failure states have no wrong-weather photo.
- [x] The first load fetches zero photos and an active forecast fetches only its chosen photo; the page has no horizontal overflow at 360 px.
- [x] Text, controls and focus states retain documented contrast over every background; reduced motion is respected.

**Verification:** `npm test --workspace @nosso-clima/web -- background`; web check; browser network/contrast inspection for all ten files at 360 px and desktop.

**Dependencies:** U8.

**Files likely touched:** `apps/web/src/assets/backgrounds/` (ten bundled files, with originals retained under `backgrounds/`), `apps/web/src/backgrounds.ts`, `apps/web/src/styles.css`, `apps/web/src/app.tsx`, `apps/web/test/backgrounds.test.ts`.

**Estimated scope:** Medium behavior change plus one mechanical asset batch.

## Task U10: Complete browser accessibility and module gate

**Description:** Add the browser axe command and prove the complete local flow, readability and active constraints without a live provider.

**Acceptance criteria:**

- [x] `npm run test:a11y` reports zero critical or serious issues for neutral, suggestions, loading, error and success states; keyboard/focus behavior is checked in a real browser.
- [x] Web/root checks, 80% coverage per metric, boundary check, build, audit and 90-second local budgets pass without weakened thresholds or skipped tests.
- [x] All local spec criteria pass; provider aggregate usage, privacy, licensing, image rights and production performance remain explicit `production-delivery` gates.

**Verification:** `npm run check --workspace @nosso-clima/web`; `npm run check`; `npm run test:coverage --workspace @nosso-clima/web`; `npm run test:a11y`; `npm run check:boundaries`; `npm audit --audit-level=high`; preview smoke.

**Dependencies:** U9.

**Files likely touched:** `apps/web/test/a11y.spec.ts`, `apps/web/playwright.config.ts`, `apps/web/package.json`, `package.json`, and focused UI fixes if the gate reveals defects.

**Estimated scope:** Medium (4 files plus issue-specific fixes).

## Checkpoint U-C: Owner review

- [x] Every local `SPEC-weather-ui.md` success criterion and active `CONSTRAINTS.md` floor is met.
- [x] Public deployment remains blocked until `production-delivery` verifies aggregate Open-Meteo usage, privacy, current licensing, image rights and mobile performance.
- [x] Owner reviews the complete local user flow before this module is marked complete (approved 2026-09-24).

## Corrective verification identified on 2026-10-01

These findings do not alter the owner's 2026-09-24 approval record. The owner requested their correction on 2026-10-01; the matching approved behavior was repaired and verified locally.

- [x] Reject a forecast response when its first daily date does not equal the local date in `current.validAtLocal`, or its timezone does not match the selected city's canonical timezone; regression cases prevent an incorrect day from being labelled “HOJE”.
- [x] Preserve the specified generic failure state for HTTP errors other than `429 RATE_LIMITED` and `503 SERVICE_UNAVAILABLE`, with focused tests for non-temporary statuses.
- [x] Record mobile and desktop contrast evidence for all ten bundled backgrounds against the computed text and control surfaces, including the 4.5:1 and 3:1 thresholds; see `docs/quality/contrast-2026-10-01.md` and the repeatable browser check.

---

# Tasks: Production Delivery

Status: Draft for owner review; implementation not yet approved
Module id: `production-delivery`
Source spec: `SPEC-production-delivery.md` (approved for planning 2026-09-24)
Plan: `tasks/plan.md`, Production Delivery section

## Progress

- [ ] P1 — Verify production configuration and independent builds
- [ ] P2 — Build the offline cross-application HTTP harness
- [ ] P3 — Test the complete browser journey
- [ ] Checkpoint P-A — Offline release candidate
- [ ] P4 — Enforce the mobile performance gate
- [ ] P5 — Add CI and redacted secret scanning
- [ ] Checkpoint P-B — Complete local and hosted quality gates
- [ ] P6 — Review provider terms and combined usage budget
- [ ] P7 — Prepare and expose the privacy notice
- [ ] P8 — Verify rights for bundled backgrounds, retained originals and logo
- [ ] P9 — Document the selected production deployment
- [ ] P10 — Rehearse release and rollback
- [ ] Checkpoint P-C — Owner release review

## Task P1: Verify production configuration and independent builds

**Description:** Add a production web-origin preflight and tests while preserving local development and isolated fixture builds. Prove a clean lockfile install and separate API/web artifacts, including an API production-dependency startup path.

**Acceptance criteria:**

- [ ] A public production build rejects missing, HTTP, loopback or mismatched API origin; a separately identified local E2E fixture build may use loopback HTTP and is never selected by deployment instructions.
- [ ] API and web each build from `npm ci`; the compiled API starts with production dependencies and answers `/health` without web development packages.
- [ ] Environment examples and a command transcript identify required production values, explicit allowed web origin, `TRUST_PROXY=false`, and independent outputs without exposing secrets.

**Verification:** Configuration negative tests; `npm ci`; `npm run build --workspace @nosso-clima/api`; `npm run build --workspace @nosso-clima/web`; compiled API health smoke; `npm run check:boundaries`.

**Dependencies:** Approved production-delivery plan and tasks.

**Files likely touched:** `apps/web/vite.config.ts`, `apps/web/test/production-config.test.ts`, `apps/web/.env.example`, `apps/api/.env.example`, `scripts/verify-production-build.mjs`.

**Estimated scope:** Medium (up to 5 files).

## Task P2: Build the offline cross-application HTTP harness

**Description:** Start the compiled or in-process Fastify API through `buildApp({ fetchImpl })` and serve built web files for Playwright, with only upstream Open-Meteo responses replaced by deterministic fixtures. Keep the browser-to-API HTTP boundary real.

**Acceptance criteria:**

- [ ] Both local servers have bounded startup, unique ports and cleanup on success/failure; no test leaves a listener or browser behind.
- [ ] The fixture transport rejects unexpected upstream URLs, records call counts and returns controlled success, empty and failure variants without contacting Open-Meteo.
- [ ] `npm run test:e2e` runs a minimal first-visit neutral-page smoke against the built web and real API HTTP listener, with zero initial provider calls.

**Verification:** `npm run test:e2e`; focused harness failure/cleanup test; `npm run check`; offline request-count assertion.

**Dependencies:** P1.

**Files likely touched:** `tests/e2e/harness.mjs`, `tests/e2e/provider-fixtures.mjs`, `tests/e2e/neutral.spec.mjs`, `package.json`.

**Estimated scope:** Medium (4 files).

## Task P3: Test the complete browser journey

**Description:** Use the P2 harness to test the visible city-to-forecast flow and its most important failure paths in a real browser, avoiding duplicate unit-level parser matrices.

**Acceptance criteria:**

- [ ] Search, explicit selection, current conditions, seven daily cards and both source credits pass through real web/API HTTP calls; the first visit without saved data remains neutral, and reopening restores the last city with a fresh forecast and no geocoding call.
- [ ] Empty search, upstream failure with manual retry, keyboard selection and stale-city response protection produce the expected visible states and never show old weather for a new city.
- [ ] The suite is deterministic, offline, within the five-minute browser budget and leaves existing root/web/API checks green.

**Verification:** `npm run test:e2e`; `npm run check`; `npm run test:a11y`; review browser network log for only loopback/API and static assets.

**Dependencies:** P2.

**Files likely touched:** `tests/e2e/weather-flow.spec.mjs`, `tests/e2e/provider-fixtures.mjs`, `tests/e2e/harness.mjs`.

**Estimated scope:** Medium (3 files).

## Checkpoint P-A: Offline release candidate

- [ ] Clean install and independent API/web builds pass, including production-dependency API startup and a valid/invalid production-origin preflight.
- [ ] `npm run test:e2e` covers the complete visible flow with a real API HTTP listener and zero live Open-Meteo requests.
- [ ] `npm run check`, workspace gates, boundary check and browser axe remain green.

## Task P4: Enforce the mobile performance gate

**Description:** Measure the production web build in Playwright Chromium under one documented mobile profile, recording navigation LCP and page-lifetime CLS through a successful city selection and active background load.

**Acceptance criteria:**

- [ ] `npm run test:performance` prints the 360×800 viewport, device/network profile, measured LCP and CLS, and fails if LCP exceeds 2.5 s or CLS exceeds 0.1.
- [ ] The measurement starts before navigation, includes the forecast transition for CLS, uses built assets and offline API fixtures, and closes resources reliably.
- [ ] The command meets the five-minute budget and repeated runs on the project machine are stable without relaxing thresholds.

**Verification:** `npm run test:performance` on the built preview; inspect numeric output and a deliberately failing threshold fixture; `npm run check`.

**Dependencies:** P3 and Checkpoint P-A.

**Files likely touched:** `tests/performance/mobile.mjs`, `package.json`, `docs/deploy/performance-profile.md`.

**Estimated scope:** Medium (3 files).

## Task P5: Add CI and redacted secret scanning

**Description:** Assemble one clean-checkout CI workflow for both applications and all active gates, using pinned tooling and redacted Gitleaks output. Hosted validation follows configuration of a repository remote.

**Acceptance criteria:**

- [ ] CI installs pinned Node/npm and browser tooling, then runs root/workspace checks, coverage, boundaries, axe, E2E, performance, independent builds, high-severity audit and redacted secret scan.
- [ ] Gitleaks is installed from a pinned version or action; a seeded fake-secret check proves failure without printing the value, and no suppression is added.
- [ ] Local equivalents pass within the applicable budgets; once a remote exists, the hosted workflow passes and its run URL is recorded before this task is marked complete.

**Verification:** Workflow syntax review; clean `npm ci`; full local gate; `gitleaks detect --redact --no-banner`; hosted CI run when available.

**Dependencies:** P4.

**Files likely touched:** `.github/workflows/check.yml`, `package.json`, `docs/deploy/ci.md`.

**Estimated scope:** Medium (3 files).

## Checkpoint P-B: Complete local and hosted quality gates

- [ ] `npm run check`, `npm run test:coverage`, `npm run test:a11y`, `npm run test:e2e`, `npm run test:performance`, `npm run check:boundaries`, audit, secret scan and both builds pass.
- [ ] API and web each retain at least 80% coverage for lines, branches, functions and statements; no constraint is weakened.
- [ ] Hosted CI evidence is linked when a remote is available; absent a remote, this checkpoint remains open.

## Task P6: Review provider terms and combined usage budget

**Description:** Record current official Open-Meteo geocoding/forecast terms, pricing, attribution and effective request accounting, then model the two endpoints together for the intended traffic and one API process, including automatic forecast calls on return visits.

**Acceptance criteria:**

- [ ] Dated links to current official sources, chosen plan and commercial-status decision are recorded; a paid endpoint and secret plan are required if the intended use is commercial.
- [ ] A transparent minute/hour/day budget includes both endpoints, requested variable cost, cache misses, restarts and expected peak/daily users; a documented ceiling or enforceable aggregate control stays within the applicable limits.
- [ ] Unknown traffic or commercial status remains an explicit release blocker, never a guessed approval; no source-module provider endpoint changes occur silently.

**Verification:** Recompute example scenarios from the documented formula; compare values and conditions to official current sources; owner reviews the chosen ceiling.

**Dependencies:** Approved plan and owner commercial/traffic decisions for final completion.

**Files likely touched:** `docs/deploy/open-meteo-usage.md`.

**Estimated scope:** Small (1 file).

## Task P7: Prepare and expose the privacy notice

**Description:** Draft the public notice for search-text and selected-coordinate transfers (including forecast calls on return visits), the last selected city retained in browser-local storage, applicable provider retention and local logging/retention behavior, then make it reachable from the web app for the selected deployment.

**Acceptance criteria:**

- [ ] Notice accurately describes both third-party transfers, purposes and current provider retention material, with dated sources and the selected host's actual log behavior.
- [ ] Notice explains that one selected city remains in browser-local storage until replaced or site data is cleared, and that a later visit automatically requests its forecast.
- [ ] Web users can open the notice from a visible, keyboard-accessible link; the link target works in the built static deployment.
- [ ] No prohibited search term, coordinate, IP or raw provider payload is newly logged, and the owner reviews the notice before release.

**Verification:** Browser link/keyboard check; compare notice to current official sources and deployment logging configuration; `npm run check --workspace @nosso-clima/web`.

**Dependencies:** P6 for current provider review and selected host/log-retention facts for completion.

**Files likely touched:** `docs/deploy/privacy-notice.md`, `apps/web/src/app.tsx`, `apps/web/test/app.test.tsx`.

**Estimated scope:** Medium (3 files).

## Task P8: Verify rights for bundled backgrounds, retained originals and logo

**Description:** Inventory the ten WebP assets actually bundled by the web app, trace each to its retained original under `backgrounds/`, document the five optimized night variants, and record the supplied logo's origin and public-use permission. Keep the release blocked for any unknown entry.

**Acceptance criteria:**

- [ ] All ten bundled filenames have individual evidence, are traced to their originals, and have the required attribution visible where applicable; unverified images are not cleared for public packaging.
- [ ] The intended commercial or non-commercial use matches each permission. If any file cannot be cleared, the owner approves a separate replacement task within the `weather-ui` boundary.
- [ ] The final inventory includes evidence locations, the supplied logo's public-use permission and an owner review date, without embedding private licence documents or credentials in the repository.

**Verification:** Compare the inventory to the ten bundled files and ten retained originals, including hashes or other traceable variant evidence; manually review each source/permission, logo and rendered credit; inspect public build contents.

**Dependencies:** Owner image and logo provenance and commercial-status decision for final completion.

**Files likely touched:** `docs/deploy/image-rights.md`.

**Estimated scope:** Small (1 file; replacements are a separate approved task).

## Task P9: Document the selected production deployment

**Description:** Turn the selected host/domain and completed provider/privacy/image evidence into exact web and single-process API deploy, health, smoke, edge and rollback procedures.

**Acceptance criteria:**

- [ ] Runbook gives exact independent build/start/configuration steps for HTTPS web and API origins, explicit CORS, health checks and rollback on the chosen host.
- [ ] Direct API origin exposure, edge abuse controls and `TRUST_PROXY=false` or reviewed trusted ranges are documented; multi-instance deployment is excluded without platform amendment.
- [ ] A dry run validates environment errors, public-origin matching and smoke commands without making the service public.

**Verification:** Follow the runbook in a staging/private environment; inspect CORS and `/health`; practice rollback and record results.

**Dependencies:** P5–P8 and owner host/domain decision.

**Files likely touched:** `docs/deploy/runbook.md`, `apps/api/.env.example`, `apps/web/.env.example`.

**Estimated scope:** Medium (3 files).

## Task P10: Rehearse release and rollback

**Description:** Collect all gate evidence, run the host-specific deployment and rollback rehearsal, and prepare a release decision record for the owner without publishing the site.

**Acceptance criteria:**

- [ ] Local and hosted CI gates, performance numbers, provider budget, privacy notice, image rights, security configuration and independent artifacts are linked in one release record.
- [ ] A private/staging deploy passes web/API smoke, source attribution, health and rollback checks; no live provider request is made before its usage/privacy gates pass.
- [ ] Every remaining blocker is explicit. The public site remains unpublished until the owner approves the complete release package.

**Verification:** Execute `docs/deploy/runbook.md` in staging; re-run the full gate; inspect the dated evidence and rollback record with the owner.

**Dependencies:** P9 and Checkpoint P-B.

**Files likely touched:** `docs/deploy/release-review.md`, `docs/deploy/runbook.md`.

**Estimated scope:** Small (2 files).

## Checkpoint P-C: Owner release review

- [ ] Every `SPEC-production-delivery.md` success criterion and active `CONSTRAINTS.md` floor has current evidence.
- [ ] The owner reviews the host, traffic/commercial decision, provider usage, privacy notice, image rights, performance, security and rollback results.
- [ ] Public deployment is separately approved only after all blockers are closed; otherwise this checkpoint remains open.
