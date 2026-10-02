# Implementation Plan: Backend Platform

Status: Complete; corrective implementation reviewed and approved by owner on 2026-09-23
Module id: `backend-platform`
Source spec: `SPEC-backend-platform.md`
Task list: `tasks/todo.md`

## Overview

Implement the Fastify platform as a sequence of small, independently verified slices. The first slice establishes a reproducible npm workspace and testable application factory. Subsequent slices add configuration and HTTP contracts before the higher-risk protection mechanisms. Process-local resilience primitives are isolated and can be implemented in parallel after the test harness exists. The module finishes with real process lifecycle verification and the complete quality gate.

No city search, forecast integration, frontend or deployment provider is included in this plan.

## Dependency Graph

```text
T1 workspace/toolchain
└── T2 testable API harness
    ├── T3 validated configuration
    │   └── T4 health, request identity and logging
    │       ├── T5 public error contract
    │       │   └── T7 layered rate limiting
    │       └── T6 CORS and HTTP hardening
    │           └── T7 layered rate limiting
    ├── T8 bounded TTL/LRU cache
    ├── T9 single-flight duplicate control
    └── T10 bounded concurrency executor

T3 + T4 + T5 + T6 + T7 + T8 + T9 + T10
└── T11 production lifecycle and complete module gate
```

## Architecture Decisions

- **One app factory, one process entry point.** `buildApp` has no listening or signal side effects; `server.ts` owns process behavior. This keeps HTTP integration tests deterministic.
- **Contracts before mechanisms.** Health, request identity and the public error envelope land before rate limiting so protection failures use the same API contract.
- **Two independent limiter layers.** Every request consumes the 60/minute global bucket; location and forecast routes later consume an additional 30/minute or 15/minute group bucket. Route-specific configuration must not replace the global ceiling.
- **Reject work early.** Rate limiting runs before validation and route work. Body size, CORS and security headers are registered before business routes.
- **Process-local state is explicit.** Cache, limiter, single-flight registry and concurrency queue are bounded and disposable. Nothing implies correctness across multiple instances.
- **No wall-clock sleeps or real network in tests.** Time, logs and process hooks are captured or injected; HTTP behavior uses `app.inject`.
- **Official supported adapters.** Fastify-maintained plugins provide CORS, Helmet integration, TypeBox inference and rate limiting. `@fastify/rate-limit` remains at 11.2.0 or newer in major 11.
- **Security-sensitive fields are allowlisted.** Logs contain operational fields only; forwarded client addresses are ignored until a verified proxy topology is configured.

## Implementation Phases

### Phase 1: Reproducible foundation

- T1 establishes the workspace, exact dependency graph and root quality commands.
- T2 proves the API can build and can be instantiated and closed in a test.
- T3 adds fail-fast, typed environment configuration.

Checkpoint A verifies clean installation, build, lint, type checking, tests and dependency audit before HTTP behavior expands.

### Phase 2: Stable HTTP platform

- T4 adds `/health`, request correlation and privacy-preserving completion logs.
- T5 makes every public failure conform to one typed envelope.
- T6 applies CORS, security headers and request-size protection.
- T7 implements the global and independent group rate-limit buckets.

Checkpoint B verifies the complete public platform contract, including abuse cases and forwarded-header spoofing.

### Phase 3: Bounded resilience primitives

- T8 provides bounded TTL/LRU caching.
- T9 consolidates identical in-flight operations.
- T10 limits simultaneous and queued external work.
- T11 adds production startup, graceful shutdown and the full module gate.

Checkpoint C proves the module satisfies every success criterion in the approved spec and every active constraint.

### Corrective reopening: 2026-09-23

The owner reopened the approved backend-platform module after an execution-based audit. T12 repairs global-limit coverage for preflights and malformed URLs. T13 repairs HTTP status preservation and safe failure diagnostics. T14 repairs request identity, logging correlation and production logger startup. T15 wires bounded provider resources into `buildApp` and bounds queue waiting. T16 includes tests in the official typecheck and repeats Checkpoint C. Each corrective slice requires a focused regression test followed by the module check; the final gate includes coverage, dependency audit and production process smoke verification. No location-search or weather-forecast implementation is authorized by this reopening.

## Parallelization

- T8, T9 and T10 are safe to implement in parallel after T2 because they share no mutable files.
- T5 and T6 may proceed in parallel after T4, but both modify `app.ts`; parallel branches must coordinate that registration point.
- T7 is sequential after T5 and T6 because it depends on the stable error and hardening behavior.
- T11 is last because it integrates the completed app factory and all configuration.

## Verification Strategy

- Each task runs the smallest focused Vitest file first, then type checking and lint for the API workspace.
- Each checkpoint runs `npm run check --workspace @nosso-clima/api` and `npm audit --audit-level=high`.
- Checkpoint B additionally reviews captured error bodies, headers and logs for forbidden information.
- Checkpoint C runs build, coverage and the production entry point smoke test without contacting Open-Meteo.
- Local handoff checks must remain under 90 seconds; broader checks remain under five minutes.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| TypeScript 7 or TypeBox integration conflicts with Fastify typings | High | Install and compile the minimal typed app in T2 before building features |
| A route-specific limiter accidentally replaces the global ceiling | High | Use independent counters and test alternating route groups in T7 |
| Forwarded headers allow limiter-key spoofing | High | Keep proxy trust disabled and include spoof tests before deployment work |
| Log assertions become coupled to Pino formatting | Medium | Assert structured fields and forbidden values, not full serialized lines |
| Signal tests terminate the test runner or become flaky | Medium | Isolate lifecycle functions and use a child process only for the final smoke path |
| Bounded queue semantics are ambiguous at saturation | Medium | Encode exact concurrency and queue limits in deterministic deferred-promise tests |
| Quality commands exceed the local time budget | Low | Keep tests process-local, use fake time and defer browser checks to later modules |

## Open Questions

None. Deployment-specific proxy ranges and edge protection remain intentionally deferred to `production-delivery`.

## Approval Gate

Implementation may start only after the human approves this plan and the detailed tasks in `tasks/todo.md`.

---

# Implementation Plan: Location Search

Status: Complete; Checkpoint L-B approved by owner on 2026-09-23
Module id: `location-search`
Source spec: `SPEC-location-search.md` (approved 2026-09-23)
Task list: `tasks/todo.md`, Location Search section

## Overview

Add one geocoding route on the approved backend platform. First define the public query and response contract, then prove the fixed-origin adapter against fake responses, then compose caching and duplicate-work control, and finally register the route once in `buildApp`. No weather forecast, UI, deployment, new dependency or live provider call belongs to this plan.

## Dependency Graph

```text
L1 public contract and canonical query
└── L2 bounded Open-Meteo transport
    └── L3 external validation and normalization
        └── Checkpoint L-A
            └── L4 cached search orchestration
                └── L5 HTTP route and integration tests
                    └── L6 production composition and final gate
```

Each slice consumes the prior contract or boundary; L6 is last. The adapter's focused tests may be prepared alongside the pure-query tests, but integration stays sequential.

## Architecture Decisions

- **One public contract.** TypeBox describes the route's response; query canonicalization is a focused pure function. The route's `preValidation` hook inspects `URLSearchParams` from `request.raw.url` before Fastify's schema validation and requires exactly one `query` and no other keys. This catches repeats and unknown keys even though Fastify's default Ajv `removeAdditional: true` can otherwise drop extras. Keep this route-local; do not alter the global validator.
- **One fixed-origin adapter.** Inject `fetch` for deterministic tests. Build the provider URL from constants and `URLSearchParams`; stream and cap the decoded body before parsing JSON. A 5-second `AbortSignal.timeout` covers fetch and body consumption.
- **Fail closed at the provider boundary.** Validate every consumed upstream field, filter only documented current populated-place codes, and normalize to the approved response shape. Classify expected failures into a bounded warning without logging user input or upstream text.
- **Use platform resources.** The route receives the process-wide executor and `SingleFlight`, plus one `location-search` cache from `BackendPlatformContext`. The service rechecks the cache inside the flight and only stores validated successes for 24 hours.
- **One composition point.** `app.ts` registers the location route by default inside `buildApp()` and claims `createCache('location-search')` exactly once. `server.ts` retains only startup/shutdown. `BuildAppOptions` gains optional `fetchImpl: typeof fetch` for offline route tests; production uses Node's built-in fetch. Existing `registerRoutes` callbacks remain additive and must not register a second location route or claim its cache namespace. Platform regression tests that currently claim that namespace are updated to verify the composed route or use another isolated primitive without a duplicate claim.

## Phases and Checkpoints

### Phase 1: Contracts and untrusted boundary

- L1 defines the exact public schema, attribution and canonical query rules.
- L2 proves fixed-origin transport, timeout, redirect rejection, status/content-type checks and a 64 KiB decoded-body cap.
- L3 validates and normalizes provider results, including empty, duplicate and malformed cases.

Checkpoint L-A runs focused unit tests and `npm run check --workspace @nosso-clima/api` before orchestration expands.

### Phase 2: End-to-end route

- L4 composes cache, `SingleFlight`, the shared executor and safe failure classification.
- L5 adds the HTTP route to `buildApp()` with both limiter layers, safe error mapping, an injectable fetch seam and integration tests, including `?query=ab&foo=1` returning `400` without an upstream call.
- L6 verifies the already-composed route through the compiled production entry point and repeats the full gate, including coverage, audit and a local smoke request that cannot contact Open-Meteo.

Checkpoint L-B reviews all success criteria, captured logs and public envelopes before owner review. It records the unresolved aggregate Open-Meteo usage budget as an explicit blocker for public deployment under `production-delivery`, not for local module completion. No test calls the live Open-Meteo service.

## Verification Strategy

- Red-green-refactor per slice; run the focused `location` tests, then API typecheck, lint and format check.
- Checkpoints run `npm run check --workspace @nosso-clima/api` and `npm audit --audit-level=high`.
- Final gate also runs `npm run test:coverage --workspace @nosso-clima/api`, a production build and a process smoke test that does not call Open-Meteo.
- Maintain every active `CONSTRAINTS.md` floor and the existing backend-platform regression suite; no skipped tests or weakened thresholds.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Fastify removes unknown query keys before the handler | Invalid input reaches provider | Validate raw `URLSearchParams` in route-local `preValidation`; assert `?query=ab&foo=1` is `400` in HTTP tests |
| A slow body read occupies a shared executor slot | Capacity exhaustion | Use the same finite abort signal through streaming, and test a stalled body |
| Provider text or query reaches logs | Privacy failure | Assert captured logs against distinctive query, body, URL and coordinate fixtures |
| Filtering ten upstream candidates yields fewer than five results | User sees a shorter list | Preserve provider order and accept zero to five valid populated places |
| Free-tier aggregate quota is exceeded across users or instances | Provider throttling | Keep public deployment gated on `production-delivery`'s aggregate usage strategy |

## Open Questions

None for local implementation. The approved spec leaves commercial use and public-deployment usage budgeting to `production-delivery`.

## Approval Gate

Implementation starts only after the owner approves this location-search plan and its L1–L6 tasks in `tasks/todo.md`.

---

# Implementation Plan: Weather Forecast

Status: Complete; Checkpoint W-C approved by owner on 2026-09-24
Module id: `weather-forecast`
Source spec: `SPEC-weather-forecast.md` (approved 2026-09-23)
Task list: `tasks/todo.md`, Weather Forecast section

## Overview

Add one forecast route for an explicitly selected location, returning validated current conditions and seven local calendar days. Reuse the backend platform's shared executor, single-flight registry, cache factory, rate limits and error envelope. This plan does not implement `weather-ui`, choose a default city, add an aggregate quota mechanism or contact Open-Meteo in tests. Public deployment remains gated on an application-wide usage budget and licensing/privacy review in `production-delivery`.

## Dependency Graph

```text
W1 public contract and query
├── W2 WMO mapping
└── W3 fixed-origin bounded transport
    └── Checkpoint W-A
        └── W4 external response validation
            └── W5 cached service orchestration
                └── W6 HTTP route and buildApp composition
                    └── Checkpoint W-B
                        └── W7 production smoke and complete gate
                            └── Checkpoint W-C
```

W4 also consumes W2's mapping. W6 consumes W1 and W5. Each task leaves the API checkable; no task relies on a live provider.

## Architecture Decisions

- **One HTTP contract.** TypeBox owns the exact success response and permits `null` only for daily precipitation probability. Route-local raw `URLSearchParams` validation rejects missing, repeated and unknown query keys before Fastify can remove them. A pure helper validates the original coordinates, rounds them to three decimals with halfway cases away from zero and negative zero normalized, and resolves accepted IANA timezone aliases through `Intl.DateTimeFormat(...).resolvedOptions().timeZone`.
- **One fixed-origin adapter.** The injected `fetchImpl` seam already exists in `buildApp()`. Build only the approved forecast URL, reject redirects and non-200/non-JSON responses, and enforce the 5-second abort through streaming body consumption with a 65,536-byte decoded-body bound. W3 and W4 use committed, offline fixtures captured from actual Open-Meteo forecast responses, with retrieval date and public-city provenance documented; synthetic mutations are labeled separately for failure branches. Validate consumed provider data from `unknown`, including units, timezone, seven aligned dates and allowed nullable fields.
- **One process composition point.** `app.ts` calls `createCache('weather-forecast')` once and registers the forecast route by default, alongside location search. `server.ts` remains lifecycle-only. The service uses the existing platform executor and single-flight registry, then caches validated successes for exactly 10 minutes.
- **Module ownership stays intact.** Forecast schemas, mapping, adapter, service and route are weather-forecast code. No new shared primitive or weather UI is introduced. Any platform test currently claiming the forecast cache namespace is adjusted only enough to avoid a duplicate claim while preserving its regression coverage.
- **Safe observable failures.** Expected provider failures become one classified, request-correlated warning and safe 503 envelope; unexpected defects remain 500. Tests inspect structured logs for forbidden query, coordinate, timezone, URL and provider content.

## Phases and Checkpoints

### Phase 1: Contract and outbound boundary

- W1 defines the public response schema and pure request validation, including raw-key rejection and canonical cache-key inputs.
- W2 defines WMO-to-condition mappings with every supported code covered by pure tests.
- W3 proves the fixed-origin, bounded transport and failure classification with an injectable fake fetch backed by a captured real response fixture.

Checkpoint W-A runs focused tests and the complete API check before response normalization.

### Phase 2: Normalization and HTTP composition

- W4 validates and normalizes all consumed Open-Meteo fields, including units, timezone, exactly seven local days and per-day `null` rain probability handling, starting from the captured real response fixture.
- W5 composes the 10-minute cache, second cache lookup, single-flight and shared executor; only validated successes cache. Fake-time tests probe just before, exactly at and just after the TTL boundary.
- W6 registers the route once in `buildApp()` with both limiter layers and the exact public errors, attribution and offline HTTP tests.

Checkpoint W-B checks the end-to-end injected route, privacy assertions, limiter interaction and existing platform/location regressions.

### Phase 3: Complete module gate

- W7 verifies the compiled server's health and invalid forecast path, then runs the full API check, coverage and dependency audit.

Checkpoint W-C reviews every local success criterion with the owner. The public-deployment aggregate Open-Meteo usage budget, current license and privacy notice remain explicit `production-delivery` gates, not a claim that this module is production-ready.

## Verification Strategy

- Use red-green-refactor for behavior changes; run the focused forecast tests after each task, then API typecheck, lint and format checks.
- At checkpoints run `npm run check --workspace @nosso-clima/api`; at W7 also run `npm run test:coverage --workspace @nosso-clima/api`, `npm run build --workspace @nosso-clima/api` and `npm audit --audit-level=high`.
- Use fake time, deterministic streams and `app.inject`; no wall-clock sleep or live Open-Meteo call. Preserve the 80% coverage floor and local time budgets.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Fastify strips unknown query keys | Invalid requests can reach the provider | Inspect raw keys in route `preValidation`; assert `?latitude=-23&longitude=-46&timezone=America%2FSao_Paulo&foo=1` returns 400 and causes zero fetches |
| Stalled fetch or body read consumes a shared executor slot | Other providers become unavailable | Keep one finite abort across fetch and stream; test a stalled body and slot release |
| Seven arrays or local dates are misaligned | Wrong daily values are displayed together | Validate every consumed array's length and date sequence before normalization |
| A nullable metric is silently converted to zero or a missing field is accepted | Misleading forecast | Keep `null` only for the approved daily metrics; derive and label null/missing-field variants from an actual response fixture |
| A fixture drifts from the provider's real shape | Adapter tests offer false confidence | Record source URL, public-city coordinates and retrieval date; keep the real sample immutable and label synthetic mutations |
| Weather and platform tests claim the same cache namespace | `buildApp()` fails or tests lose coverage | Register once in `app.ts`; adapt platform test namespace claims without dropping assertions |
| Ten-minute cache plus thirteen requested weather variables increases provider usage | Aggregate free-tier quota is exceeded | Keep public deployment gated on an application-wide geocoding-plus-forecast budget that verifies the provider's effective request cost |

## Open Questions

None for local implementation. The approved spec fixes three-decimal coordinate rounding, canonical timezone, TTL, first-load behavior, daily-condition source and nullable rain probability. Public and commercial delivery gates remain in `production-delivery`.

## Approval Gate

The owner approved this weather-forecast plan and W1–W7 tasks, subject to the W1/W3/W4/W5 amendments now recorded here and in `tasks/todo.md`, on 2026-09-23.

---

# Implementation Plan: Weather UI

Status: Local flow approved at Checkpoint U-C on 2026-09-24; 2026-10-01 corrective checks verified locally
Module id: `weather-ui`
Source spec: `SPEC-weather-ui.md` (approved 2026-09-24)
Task list: `tasks/todo.md`, Weather UI section

## Overview

Create the `@nosso-clima/web` workspace and deliver one local flow: search for a city, explicitly select it, and read current conditions and seven daily cards. The UI consumes the two approved HTTP contracts, starts neutral when no city was saved, maintains accessible request states, and uses only the active decorative background. Public deployment and provider/image-rights review remain in `production-delivery`.

## Dependency Graph

```text
U1 web workspace and neutral shell
└── U2 quality gates and boundary check
    ├── U3 location HTTP boundary
    └── U4 forecast HTTP boundary
U3 + U4 ── Checkpoint U-A
             └── U5 accessible city search
                 └── U6 explicit selection and forecast state
                     └── Checkpoint U-B
                         └── U7 current conditions and local times
                             └── U8 seven daily cards and unavailable metrics
                                 └── U9 background mapping and responsive surfaces
                                     └── U10 browser accessibility and complete gate
                                         └── Checkpoint U-C
```

U6 also needs U4; U8 consumes the U4 forecast model. Attribution is rendered where each response is used: location credit with U5, forecast credit with U7. Each task leaves a buildable app; unfinished data paths use explicit loading or empty states, never placeholder weather values.

## Architecture Decisions

- **Separate application boundary.** `apps/web` is an independent React/Vite/TypeScript workspace. It has web-local response types and runtime parsing from `unknown`; it imports no `apps/api/src` code. A root boundary command checks both application import directions. Development routes `/api` through a fixed Vite proxy; production API origin configuration waits for `production-delivery`.
- **Small native request layer.** Use `fetch`, `URLSearchParams` and `AbortController` without an HTTP or state library. Keep search and forecast requests in separate state machines, abort superseded requests, and reject late responses by request identity. A first visit without a saved city makes no request. After explicit selection, retain only that city in browser-local storage and request a fresh forecast on later visits; do not add automatic retries or a client forecast cache. The owner approved this amendment on 2026-09-28.
- **Explicit city identity.** Only a selected `Location` from the search contract may start a forecast request. Selecting another city clears the prior forecast before loading. Typing new search text leaves the current selected forecast visible until a new result is selected.
- **Presentation follows provider contracts.** Web formatters preserve the offset-less local current time, convert `retrievedAtUtc` in the forecast timezone, compute weekdays from civil dates, keep nullable metrics unavailable, and label daily conditions as the day's most severe. No WMO remapping or backend contract change.
- **Readable imagery.** Bundle ten WebP files under the web asset directory during U9 and retain the ten originals in `backgrounds/`. The five bundled night files are optimized variants of the corresponding originals. A typed map chooses exactly one bundled file from current category and `isDay`; neutral/loading/error states have a neutral fallback. Cards and controls own their contrast so photographs never carry essential text directly. Assets are for local development until publication rights are verified for the originals and shipped variants.
- **Enforced accessibility and quality.** Unit/component tests use offline fixtures and fake time. U10 implements a browser axe command and checks keyboard behavior, 360 px/desktop layouts and all image states. The root boundary gate, web coverage floor and existing API gates stay active; end-to-end and performance release gates belong to `production-delivery`.

## Phases and Checkpoints

### Phase 1: Independent workspace and safe HTTP boundary

- U1 pins compatible approved dependencies and establishes the independently buildable web workspace with a neutral shell.
- U2 activates web typecheck, lint, format, test and coverage commands plus the root cross-app boundary check.
- U3 validates the location response and error envelope from `unknown`, with fixed route construction and offline tests.
- U4 validates the forecast response and fixed route construction, including seven records and nullable daily metrics.

Checkpoint U-A verifies the neutral app, both parsers and the independent web build before asynchronous UI behavior expands.

### Phase 2: Search and selection

- U5 builds the labelled, keyboard-operable search and location attribution with the three-code-point/300 ms rule and stale-response protection.
- U6 connects explicit selection to forecast loading, rate-limit/unavailable errors and manual retry; a changed selection can never display the previous city's forecast.

Checkpoint U-B tests the complete offline search-to-forecast transition, including network races, keyboard selection and safe failure states.

### Phase 3: Weather presentation and module gate

- U7 presents current conditions, local valid time, retrieval time and forecast attribution.
- U8 presents all seven daily cards, separate rain chance/amount and unavailable metrics.
- U9 adds the ten category/day-night image mappings and responsive readable surfaces, fetching only the active image.
- U10 runs browser accessibility and contrast checks, the complete web/root gates, coverage, audit and local preview smoke verification.

Checkpoint U-C reviews every local spec criterion with the owner. Public usage, privacy, current licensing, image rights and production performance stay explicit `production-delivery` gates.

## Verification Strategy

- Use red-green-refactor for each behavior slice; run focused Vitest tests and web typecheck/lint/format after each task, then commit the verified slice.
- At checkpoints run `npm run check --workspace @nosso-clima/web` and the root `npm run check`. At U10 also run `npm run test:coverage --workspace @nosso-clima/web`, `npm run test:a11y`, `npm run check:boundaries`, `npm run build --workspace @nosso-clima/web` and `npm audit --audit-level=high`.
- Mock the API in unit/component and browser accessibility tests. Use fake timers for debounce and deferred promises for races; no live Open-Meteo request or wall-clock sleep. Inspect the rendered UI at 360 px and desktop with every image because an automated axe report alone does not prove photographic contrast.
- Select exact supported dependency versions at U1, pin them in the lockfile, and review its diff and audit before committing. Keep local commands within the 90-second budget; full browser checks use the approved five-minute budget.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| An older search or forecast response wins a race | Wrong city or results appear | Abort superseded requests and check request identity before committing results; test ignored aborts |
| Browser timezone shifts an offset-less local time or civil date | Misleading time/day | Keep `validAtLocal` as local text, format UTC retrieval in response timezone, test a viewer in another timezone |
| Missing rain chance becomes zero | False reassurance | Preserve `null` in web parser and render “Indisponível”; test individual daily nulls |
| Photograph defeats contrast or loads all images | Unreadable/slow page | Opaque surfaces, neutral fallback, one active image request, all ten visual checks at mobile and desktop |
| City suggestions are inaccessible | Core flow blocked for keyboard users | Labelled combobox behavior, active-option semantics, focus tests and browser axe gate |
| Image provenance or provider usage is unresolved | Public release cannot proceed | Keep local module completion separate from `production-delivery` rights, privacy and aggregate-budget gates |

## Open Questions

No unresolved choice blocks the local plan. The approved spec fixes the search threshold, debounce, selected-city behavior, daily-condition wording and image rule. Exact compatible dependency versions and the browser axe runner are selected in U1/U10 without changing those product decisions; any new package is reviewed through the lockfile and audit. Public release questions remain with `production-delivery`.

## Approval Gate

The owner approved this plan and its U1–U10 tasks on 2026-09-24, then approved the completed local user flow at Checkpoint U-C on 2026-09-24.

---

# Implementation Plan: Production Delivery — Cloudflare Free proposal

Status: Draft for owner review; implementation blocked by specification amendments
Module id: `production-delivery`; source modules: `backend-platform`, `location-search`, `weather-forecast`, `weather-ui`
Source: `SPEC-production-delivery.md` (approved only for planning), `docs/deploy/cloudflare-research-2026-10-01.md`
Task list: `tasks/todo.md`, Production Delivery section

## Objective and assumptions

Migrate the existing static React/Vite frontend to Cloudflare Pages and the API to a separate Cloudflare Worker on the Always Free tier, preserving the public `/api/v1/locations`, `/api/v1/forecast` and `/health` contracts. Pages and Worker can initially use their Cloudflare hostnames; a custom domain is optional but its final origins must be reviewed. The owner confirmed non-commercial use and estimated about 100 users per day at random times, each making several consultations. This estimate is not an enforceable traffic ceiling. The owner reported Gemini-generated backgrounds and an AI-generated logo; publication-rights review and public release approval remain open. The current Node app stays functional during migration and can be retired only after parity and approval.

This plan replaces the earlier Node-host deployment proposal. It does not approve a serverless implementation: `SPEC-backend-platform.md` and `SPEC-production-delivery.md` require amendments before P1 onward changes code.

## Decision and dependency graph

```text
P0 approve platform/delivery spec amendments and capability boundaries
  └─ P1 workerd feasibility spike: bundle, runtime behavior, CPU, deploy size
      └─ P2 Worker HTTP foundation, parity with health/errors/config
          └─ P3 atomic shared Open-Meteo budget in D1
              ├─ P4 location path, offline provider fixture
              └─ P5 forecast path, offline provider fixture
                  └─ P6 rate limiting and ephemeral resilience parity
P7 Pages static build and HTTPS origin/CORS configuration ───────┐
P4 + P5 + P6 ──────────────────────────────────────────────────────┴─ P8 browser E2E in workerd
P8 ─ P9 mobile performance and CI/secret gates ─ P10 release evidence ─ P11 private rehearsal/rollback
```

The two integrations can be delivered in either order after P3. Every slice is testable offline and must retain the existing Node path until the Worker flow is verified.

## Architecture decisions to validate

- **Two deployable artifacts.** Build the existing Vite site for Pages and the API Worker independently; retain explicit HTTPS `VITE_API_BASE_URL` and allow only the Pages origin through CORS. `HOST`, `PORT` and process signal handling do not apply inside the Worker. The API `workers.dev` URL is an origin, not a private backend; direct access and abuse controls must be accounted for.
- **Fetch-native API candidate.** Start with a thin `Request`/`Response` entry point. Reuse the current pure request validation, Open-Meteo clients, response normalization and attribution. P1 measures whether a Fastify compatibility adapter is viable; choose the simpler path that passes the 10 ms Free CPU ceiling under real workerd and staging traffic. Node compatibility alone does not establish viability. Keep browser-visible status, body, CORS and request ID parity.
- **One aggregate provider budget.** D1 stores only global minute/hour/day counters. A conditional atomic reservation happens before each outbound provider request, covering both modules and failed attempts; cost weights and strict safety margins come from a dated Open-Meteo calculation. D1 failure fails closed to `SERVICE_UNAVAILABLE`. Prove concurrency and rollovers with workerd tests. The release cap must also keep D1 usage within Free limits.
- **Edge versus local state.** In-memory LRU, `SingleFlight` and executor remain best-effort per isolate only; provider safety depends on D1. Three Cloudflare rate-limit bindings may approximate 60/30/15 per minute, but they are local to a Cloudflare location. Their precise semantics and response headers need owner-approved spec amendments. Do not persist search text, coordinates or forecast payloads in D1, KV or Cache API merely for a better hit ratio.
- **Offline verification and release.** Use `@cloudflare/vitest-plugin` or a pinned workerd/Wrangler harness compatible with the installed Vitest, with intercepted outbound provider calls. Preserve the 80% coverage floor in both apps and add Worker code to a meaningful coverage gate. Pages preview and Worker staging need a private smoke; public exposure still waits for the current usage, privacy, image-rights and owner gates.

## Ordered tasks and checkpoints

1. **P0 — Draft and approve amendments.** Update the backend-platform and production-delivery specs for Worker lifecycle, D1 quota, locality of per-visitor limits, cache behavior, log retention, Pages/Worker topology and offline tests. Update `CAPABILITY-MAP.md` if module responsibilities change. Explicitly decide whether rate-limit headers/semantics or any public API behavior must change. No implementation before owner approval.
2. **P1 — Feasibility spike.** Pin the deployment toolchain; bundle a minimal route and exercise current Fastify/Fetch alternatives in workerd. Capture CPU time, bundle size, memory, compatibility failures and local/staging response results; choose an HTTP adapter with evidence. Stop and revise the design if the Free budget cannot be met.
3. **P2 — Worker platform shell.** Typed bindings/config, `/health`, request IDs, error envelope, CORS, safe logs and unknown route handling, with no live provider path. Verify raw invalid requests, preflight and source parity.
4. **P3 — Global quota primitive.** Create one D1 schema and atomic reservation operation for both integrations. Test simultaneous requests, window reset, weighted cost, partial failure, D1 outage and refusal before fetch; avoid user data in storage.
5. **P4–P5 — Migrate integrations separately.** Wire location search, then forecast through P3, reusing existing validation and provider adapters. Each task ends with one real Worker HTTP path, provider fixture, TTL/attribution/error parity and zero live calls. Keep the legacy API tests green.
6. **P6 — Resilience and inbound rate limits.** Add approved edge bindings and bounded isolate-local cache/flight/executor behavior. Prove malformed/preflight traffic handling, locality implications and no bypass of the shared quota.
7. **P7 — Pages build.** Enforce a production HTTPS API origin, configure Pages deployment and explicit CORS, and test both generated Cloudflare origins without deploying publicly.
8. **Checkpoint A — API and web parity.** Node and Worker fixtures return equivalent public outputs, both apps build independently, workerd suite passes, and root checks/coverage remain green.
9. **P8 — End-to-end browser suite.** Run the built Pages-style web against a real local Worker HTTP listener and offline provider fixtures. Cover first visit, saved city, search/select, seven days, empty/error/retry, keyboard, credits, stale selection and quota rejection.
10. **P9 — Mobile performance and CI.** Add the existing specified LCP/CLS gates to the Cloudflare preview flow; run typecheck, lint, format, unit/integration, boundary, coverage, axe, E2E, independent builds, audit and redacted Gitleaks in CI. Record Workers CPU and D1 usage from staging; no threshold reduction.
11. **Checkpoint B — Production-quality candidate.** All local and hosted gates pass; Free-tier CPU and quota reservations are measured under representative load. Fix or replan if limits fail.
12. **P10 — Release evidence.** Recheck that actual use remains non-commercial under current Open-Meteo terms and calculate a weighted budget using the owner's approximate 100-user/day forecast plus measured calls and peaks. Complete the file-specific rights review for the reported Gemini backgrounds and AI logo, the privacy notice with Pages/Workers logging and retention, and the exact Cloudflare runbook and rollback.
13. **P11 — Private rehearsal.** Deploy to non-public or access-controlled staging, test CORS, `/health`, both routes with fixtures or tightly bounded approved provider calls, inspect usage, and rehearse Pages and Worker rollback with the D1 schema held compatible.
14. **Checkpoint C — Owner release review.** Publication remains blocked until every `SPEC-production-delivery.md` and `CONSTRAINTS.md` gate has evidence and the owner separately approves the final release package.

## Main risks and decision points

| Risk | Action |
|---|---|
| 10 ms Worker CPU or unsupported Node package | P1 measures on workerd and staging; prefer a thin Fetch handler; if still over limit, redesign or reconsider Free hosting before migration. |
| D1 quota race, outage or exhausted Free rows | Use one atomic conditional reservation, conservative cost weights and fail-closed behavior; load-test and monitor read/write rows. |
| Edge rate limit differs from existing per-IP semantics | Document locality and header behavior in an approved backend-platform amendment, with explicit contract tests. |
| Cache loss or cross-location misses consume provider allowance | Count every outbound attempt through D1; model worst case without cache hits. |
| Actual request peaks, provider-call weights and image publication rights unverified | Model misses and abuse, enforce a lower aggregate limit, and finish the file-specific rights review before release. Recheck non-commercial use and terms at release. |
| Rollback leaves an incompatible D1 schema | Use additive migrations, retain prior Worker compatibility and rehearse rollback before release. |

## Sources and open owner decisions

Official sources and dated Free limits: `docs/deploy/cloudflare-research-2026-10-01.md`. Revalidate at P1 and P10. Owner decisions recorded on 2026-10-01: non-commercial site, about 100 users/day at random times with several consultations, Gemini-generated backgrounds and AI-generated logo. Still needed: measured or bounded calls per visit and peak rate, Pages/Worker hostnames or custom domain, exact logo-generation tool/source material, and file-specific public-use review in `docs/deploy/image-rights.md`. GitHub Actions remains the proposed CI host; the repository currently has no configured remote.

## Approval gate

The owner must approve P0's spec amendments and then this revised task list before P1 implementation. A later, separate approval is required to publish the site.
