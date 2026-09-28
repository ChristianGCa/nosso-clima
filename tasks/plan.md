# Implementation Plan: Backend Platform

Status: Approved on 2026-09-21
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

Status: Approved by owner with W1/W3/W4/W5 amendments on 2026-09-23
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
| Ten-minute cache plus fourteen variables increases provider usage | Aggregate free-tier quota is exceeded | Keep public deployment gated on an application-wide geocoding-plus-forecast budget |

## Open Questions

None for local implementation. The approved spec fixes three-decimal coordinate rounding, canonical timezone, TTL, first-load behavior, daily-condition source and nullable rain probability. Public and commercial delivery gates remain in `production-delivery`.

## Approval Gate

The owner approved this weather-forecast plan and W1–W7 tasks, subject to the W1/W3/W4/W5 amendments now recorded here and in `tasks/todo.md`, on 2026-09-23.

---

# Implementation Plan: Weather UI

Status: Complete; Checkpoint U-C approved by owner on 2026-09-24
Module id: `weather-ui`
Source spec: `SPEC-weather-ui.md` (approved 2026-09-24)
Task list: `tasks/todo.md`, Weather UI section

## Overview

Create the `@nosso-clima/web` workspace and deliver one local flow: search for a city, explicitly select it, and read current conditions and seven daily cards. The UI consumes the two approved HTTP contracts, starts neutral, maintains accessible request states, and uses only the active decorative background. Public deployment and provider/image-rights review remain in `production-delivery`.

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
- **Small native request layer.** Use `fetch`, `URLSearchParams` and `AbortController` without an HTTP or state library. Keep search and forecast requests in separate state machines, abort superseded requests, and reject late responses by request identity. No initial request, automatic retry, persistence or client cache.
- **Explicit city identity.** Only a selected `Location` from the search contract may start a forecast request. Selecting another city clears the prior forecast before loading. Typing new search text leaves the current selected forecast visible until a new result is selected.
- **Presentation follows provider contracts.** Web formatters preserve the offset-less local current time, convert `retrievedAtUtc` in the forecast timezone, compute weekdays from civil dates, keep nullable metrics unavailable, and label daily conditions as the day's most severe. No WMO remapping or backend contract change.
- **Readable imagery.** Move the ten existing WebP files into the web asset directory during U9. A typed map chooses exactly one file from current category and `isDay`; neutral/loading/error states have a neutral fallback. Cards and controls own their contrast so photographs never carry essential text directly. Assets are for local development until publication rights are verified.
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

# Implementation Plan: Production Delivery

Status: Draft for owner review; implementation not yet approved
Module id: `production-delivery`
Source spec: `SPEC-production-delivery.md` (approved for planning 2026-09-24)
Task list: `tasks/todo.md`, Production Delivery section

## Overview

Make the existing two applications independently buildable and verifiable as one browser flow, then add the production quality gates and a reviewable release package. The first slices are local and offline. Provider usage, privacy, image rights and a host-specific deployment stay explicit release gates until the owner supplies the missing decisions. No task publishes the site.

## Dependency Graph

```text
P1 production configuration and clean builds
 └── P2 local HTTP/browser fixture harness
      └── P3 complete browser journey ── Checkpoint P-A
           └── P4 mobile performance gate
                └── P5 CI and secret scanning ── Checkpoint P-B

P6 provider terms and combined usage model ── P7 privacy notice ──┐
P8 image-rights inventory ────────────────────────────────────────┼── P9 host-specific deployment runbook
P5 CI and secret scanning ─────────────────────────────────────────┘    └── P10 release rehearsal ── Checkpoint P-C
```

P6–P8 may be researched after Checkpoint P-A without changing provider code. P9 needs the owner's host, domain, expected traffic and commercial status; P10 also needs verified publication rights. P1–P4 can be completed locally after this plan and task list are approved. P5 can be prepared locally, but requires a hosted run for completion.

## Architecture Decisions

- **Independent artifacts.** Use `npm ci` with the committed lockfile. Build API and web separately; verify the API's production-dependency installation path and the static web output. A production web build requires an explicit HTTPS API origin, while an isolated E2E fixture build may use a loopback HTTP origin and never becomes a deploy artifact.
- **Real cross-app tests, offline upstream.** Start an actual Fastify HTTP listener from `buildApp({ fetchImpl })` with deterministic geocoding and forecast responses, plus a server for the built static web app. Playwright drives a real browser and checks visible behavior. The fixture intercepts only Open-Meteo calls; browser requests reach the API over HTTP.
- **Small E2E suite.** Keep reusable process/fixture setup separate from user journeys. Cover neutral, search/select, current and seven days, no result, upstream failure/retry, keyboard flow, attribution and stale-city protection. Avoid duplicating parser-unit matrices already owned by source modules.
- **Measured mobile gate.** Use the installed Playwright Chromium and its DevTools protocol for a fixed 360×800 viewport, CPU/network throttling and browser `PerformanceObserver` entries. Assert navigation LCP and page-lifetime CLS through a successful selection; log the measurement profile and numbers. Run the built app so Vite development transforms do not distort results.
- **CI and security.** Propose a GitHub Actions workflow using pinned Node/npm, `npm ci`, workspace/root gates, browser setup, E2E, performance, audit and a pinned Gitleaks installation or action with redacted output. Since the repository has no remote configured, local commands prove the workflow content, while a hosted CI run remains a completion gate once a GitHub remote exists. A different CI host requires a plan amendment.
- **Evidence before publication.** Keep a dated provider-terms review and combined usage calculation, privacy notice, ten-file rights inventory, deployment runbook and rollback record under `docs/deploy/`. Unknowns stay marked as blockers; no inferred image licence or invented traffic forecast fills a missing owner decision.
- **Single-process baseline.** Preserve `TRUST_PROXY=false` and current API platform limits until a selected host supplies specific trusted proxy ranges or a reviewed edge design. Multi-instance deployment changes the platform's process-local assumptions and requires its own approved amendment.

## Phases and Checkpoints

### Phase 1: Repeatable local release candidate

- P1 adds a tested production-origin preflight, explicit environment examples and clean independent build verification without changing API contracts.
- P2 adds the cross-app harness: built static web, real HTTP API, fixed provider fixture transport and reliable startup/cleanup.
- P3 adds the small Playwright user-journey suite with success, error, empty, keyboard and stale-city cases.

Checkpoint P-A verifies root/workspace gates, independent builds and the complete offline browser journey. It also confirms no fixture request reaches Open-Meteo.

### Phase 2: Enforced production checks

- P4 implements and stabilizes the mobile LCP/CLS command under the exact `CONSTRAINTS.md` thresholds and five-minute budget.
- P5 adds CI and the redacted Gitleaks gate, retaining coverage, audit, axe, boundaries and independent build checks.

Checkpoint P-B runs the complete local pipeline from a clean checkout. Hosted CI evidence is required when a remote is available; a local workflow simulation is not represented as a hosted pass.

### Phase 3: Release evidence and deployment

- P6 records current official Open-Meteo terms and a combined geocoding/forecast usage model. The owner-provided traffic and commercial status determine whether the free endpoint is viable or a paid plan is required.
- P7 documents data transfers, provider retention and application logging/retention in a public privacy notice, reviewed against the selected host and current provider material.
- P8 inventories rights and required credit for each WebP file. Missing evidence remains a blocker; any replacement-image project requires explicit approval under the `weather-ui` boundary.
- P9 writes the host-specific API/static-web deployment procedure, HTTPS/CORS/proxy/edge settings, health check, smoke and rollback steps after the host/domain are chosen.
- P10 rehearses deployment and rollback, collects the full gate output and creates a release decision record without making the site public.

Checkpoint P-C is the owner's review of completed release evidence. The actual public deploy requires a separate approval after every gate passes.

## Verification Strategy

- Work in small verified slices. P1–P5 use offline fixtures; no automated test calls live Open-Meteo. Run focused checks per task and root `npm run check` at checkpoints.
- Keep at least 80% lines, branches, functions and statements in each application. Run `npm run test:coverage`, `npm run test:a11y`, `npm run test:e2e`, `npm run test:performance`, `npm run check:boundaries`, `npm audit --audit-level=high` and `gitleaks detect --redact --no-banner` at the final local gate.
- Record command durations against the 90-second local and five-minute browser/security budgets. The E2E and performance commands use bounded readiness waits and always close listeners/browsers after failure.
- Review current official provider and privacy sources while preparing P6/P7, recording URLs and review dates. Do not substitute an old spec statement for a release-time terms check.
- P9/P10 test the chosen host's actual configuration. A generic README is insufficient evidence for the production smoke and rollback criteria.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Fixture browser tests accidentally use the live provider | Quota/privacy failure and flaky CI | Inject only the API's outbound `fetchImpl`; fail on any unmatched provider URL and assert call counts |
| E2E preflight allows a loopback origin into public assets | Insecure deployed client | Keep fixture build mode separate and test that public production mode rejects loopback/HTTP/empty origins |
| LCP/CLS varies with host load | Unreliable quality gate | Pin browser/profile, measure built assets, record numbers and diagnose variance rather than relaxing thresholds |
| Secret scan is missing from local or hosted checks | Undetected credential | Pin Gitleaks setup, redact findings and make scan failure blocking |
| Unknown usage, commercial status or image rights are treated as approval | Provider or publication breach | Record each as an explicit release blocker with owner evidence and dated terms review |
| Host topology silently enables broad proxy trust or multi-instance behavior | Bypass of per-IP limits and aggregate budget | Keep one process and `TRUST_PROXY=false` until specific topology is reviewed |

## Open Decisions

- Owner: confirm commercial status, host/domain, expected peak and daily traffic, and evidence or replacement direction for all ten images. None is inferred from approval of the specification.
- The proposed CI host is GitHub Actions; there is currently no configured remote. The owner can select another CI host before P5, in which case the plan is updated before implementation.
- P9/P10 and public launch depend on these answers. P1–P8 can produce local checks or draft evidence, but P6–P8 cannot be marked complete if required facts remain unknown.

## Approval Gate

Implementation starts only after the owner approves this plan and its P1–P10 tasks in `tasks/todo.md`. Approving them does not authorize public deployment; Checkpoint P-C is a separate release review.
