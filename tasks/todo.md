# Tasks: Backend Platform

Status: Approved on 2026-09-21
Module id: `backend-platform`
Plan: `tasks/plan.md`

## Progress

- [x] T1 — Establish the npm workspace and pinned toolchain
- [x] T2 — Create a testable Fastify application harness
- [x] T3 — Validate immutable environment configuration
- [x] Checkpoint A — Foundation
- [x] T4 — Add health, request identity and safe completion logs
- [ ] T5 — Enforce the stable public error envelope
- [ ] T6 — Apply CORS and HTTP hardening
- [ ] T7 — Implement global and route-group rate limits
- [ ] Checkpoint B — HTTP platform
- [ ] T8 — Implement the bounded TTL/LRU cache adapter
- [ ] T9 — Consolidate identical in-flight operations
- [ ] T10 — Bound concurrent and queued external work
- [ ] T11 — Add production startup and graceful shutdown
- [ ] Checkpoint C — Module complete

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

- [ ] Every specified error class maps to its status, stable code and current request ID.
- [ ] Unknown routes and malformed inputs use the same envelope.
- [ ] Unexpected errors expose neither stack nor original internal message.

**Verification:**

- [ ] `npm test --workspace @nosso-clima/api -- errors.test.ts`
- [ ] `npm run typecheck --workspace @nosso-clima/api`
- [ ] Review snapshots or structural assertions for forbidden internal fields.

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

- [ ] Allowed origins receive correct CORS headers and unlisted origins do not.
- [ ] Security headers and body-size rejection are observable through `app.inject`.
- [ ] Forwarded headers do not affect the client address while proxy trust is disabled.

**Verification:**

- [ ] `npm test --workspace @nosso-clima/api -- security.test.ts`
- [ ] `npm run typecheck --workspace @nosso-clima/api`
- [ ] `npm audit --audit-level=high`

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

- [ ] The 61st aggregate request in a minute receives `429`, `RATE_LIMITED` and retry headers.
- [ ] Independent 30/minute and 15/minute group buckets are both enforced in addition to the global bucket.
- [ ] Alternating route groups, malformed requests and forwarded-address spoofing cannot bypass the aggregate ceiling.

**Verification:**

- [ ] `npm test --workspace @nosso-clima/api -- rate-limit.test.ts`
- [ ] Assert `@fastify/rate-limit` resolves to 11.2.0 or a reviewed newer release in major 11.
- [ ] `npm run typecheck --workspace @nosso-clima/api`

**Dependencies:** Tasks 5 and 6

**Files likely touched:**

- `apps/api/src/app.ts`
- `apps/api/src/plugins/rate-limit.ts`
- `apps/api/src/schemas/errors.ts`
- `apps/api/test/integration/rate-limit.test.ts`

**Estimated scope:** Medium (4 files)

## Checkpoint B: HTTP platform

- [ ] `npm run check --workspace @nosso-clima/api`
- [ ] Health, error, security and rate-limit integration suites pass without wall-clock sleeps.
- [ ] Captured responses and logs contain no prohibited information.
- [ ] Human reviews the public HTTP contract before resilience primitives continue.

## Phase 3: Bounded resilience primitives

### Task 8: Implement the bounded TTL/LRU cache adapter

**Description:** Wrap `lru-cache` behind the approved generic interface with per-entry TTL, bounded capacity and deterministic time behavior.

**Acceptance criteria:**

- [ ] Get, set, delete, clear and size follow the approved contract.
- [ ] Expired values disappear and least-recently-used values are evicted at the configured bound.
- [ ] Tests use fake/injected time and never sleep.

**Verification:**

- [ ] `npm test --workspace @nosso-clima/api -- cache.test.ts`
- [ ] `npm run typecheck --workspace @nosso-clima/api`
- [ ] `npm run lint --workspace @nosso-clima/api`

**Dependencies:** Task 2

**Files likely touched:**

- `apps/api/src/infrastructure/cache.ts`
- `apps/api/test/unit/cache.test.ts`

**Estimated scope:** Small (2 files)

### Task 9: Consolidate identical in-flight operations

**Description:** Implement `SingleFlight` so concurrent callers for one key share one promise and failed or completed operations cannot remain stuck in the registry.

**Acceptance criteria:**

- [ ] Concurrent equal keys execute the operation once and receive the same settlement.
- [ ] Different keys remain independent.
- [ ] Success and rejection both remove registry entries so a later call can execute again.

**Verification:**

- [ ] `npm test --workspace @nosso-clima/api -- single-flight.test.ts`
- [ ] `npm run typecheck --workspace @nosso-clima/api`
- [ ] Test rejected promises without unhandled-rejection output.

**Dependencies:** Task 2

**Files likely touched:**

- `apps/api/src/infrastructure/single-flight.ts`
- `apps/api/test/unit/single-flight.test.ts`

**Estimated scope:** Small (2 files)

### Task 10: Bound concurrent and queued external work

**Description:** Implement the outbound executor with a configurable concurrency ceiling, an equally bounded waiting queue and immediate typed saturation failure.

**Acceptance criteria:**

- [ ] Running operations never exceed the configured concurrency ceiling.
- [ ] Waiting operations never exceed the configured queue bound; excess work fails immediately as unavailable.
- [ ] Resolve and reject paths both release capacity and start the next queued operation.

**Verification:**

- [ ] `npm test --workspace @nosso-clima/api -- concurrency.test.ts`
- [ ] `npm run typecheck --workspace @nosso-clima/api`
- [ ] Deterministic deferred-promise test proves the maximum observed concurrency.

**Dependencies:** Task 2

**Files likely touched:**

- `apps/api/src/infrastructure/concurrency.ts`
- `apps/api/test/unit/concurrency.test.ts`

**Estimated scope:** Small (2 files)

### Task 11: Add production startup and graceful shutdown

**Description:** Add the sole network-listening entry point and isolated shutdown orchestration. Verify startup failure, SIGINT/SIGTERM handling and clean closure without allowing tests to terminate their own runner.

**Acceptance criteria:**

- [ ] `server.ts` is the only module that calls `listen` and reads the real process environment.
- [ ] SIGINT and SIGTERM close Fastify once and produce the documented exit behavior.
- [ ] Production build starts, serves `/health` and stops cleanly without contacting Open-Meteo.

**Verification:**

- [ ] `npm test --workspace @nosso-clima/api -- server-lifecycle.test.ts`
- [ ] `npm run build --workspace @nosso-clima/api`
- [ ] Run the compiled server smoke test, request `/health`, send SIGTERM and verify clean exit.

**Dependencies:** Tasks 3 through 10

**Files likely touched:**

- `apps/api/src/app.ts`
- `apps/api/src/server.ts`
- `apps/api/src/lifecycle/shutdown.ts`
- `apps/api/test/integration/server-lifecycle.test.ts`
- `apps/api/package.json`

**Estimated scope:** Medium (5 files)

## Checkpoint C: Module complete

- [ ] Every success criterion in `SPEC-backend-platform.md` is checked.
- [ ] `npm run check --workspace @nosso-clima/api`
- [ ] `npm run test:coverage --workspace @nosso-clima/api` meets all 80% thresholds and fully exercises critical branches.
- [ ] `npm run build --workspace @nosso-clima/api`
- [ ] `npm audit --audit-level=high` has no unmitigated high or critical finding.
- [ ] Local handoff checks complete within 90 seconds; full checks remain below five minutes.
- [ ] No floor violation or unapproved exception appears in the diff.
- [ ] Human reviews the implementation before the module is marked complete.
