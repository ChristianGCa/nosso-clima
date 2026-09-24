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
├── W2 WMO and UV mapping
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

- **One HTTP contract.** TypeBox owns the exact success response and `null` only for a daily UV maximum, its risk, or precipitation probability. Route-local raw `URLSearchParams` validation rejects missing, repeated and unknown query keys before Fastify can remove them. A pure helper validates the original coordinates, rounds them to three decimals with halfway cases away from zero and negative zero normalized, and resolves accepted IANA timezone aliases through `Intl.DateTimeFormat(...).resolvedOptions().timeZone`.
- **One fixed-origin adapter.** The injected `fetchImpl` seam already exists in `buildApp()`. Build only the approved forecast URL, reject redirects and non-200/non-JSON responses, and enforce the 5-second abort through streaming body consumption with a 65,536-byte decoded-body bound. W3 and W4 use committed, offline fixtures captured from actual Open-Meteo forecast responses, with retrieval date and public-city provenance documented; synthetic mutations are labeled separately for failure branches. Validate consumed provider data from `unknown`, including units, timezone, seven aligned dates and allowed nullable fields.
- **One process composition point.** `app.ts` calls `createCache('weather-forecast')` once and registers the forecast route by default, alongside location search. `server.ts` remains lifecycle-only. The service uses the existing platform executor and single-flight registry, then caches validated successes for exactly 10 minutes.
- **Module ownership stays intact.** Forecast schemas, mapping, adapter, service and route are weather-forecast code. No new shared primitive or weather UI is introduced. Any platform test currently claiming the forecast cache namespace is adjusted only enough to avoid a duplicate claim while preserving its regression coverage.
- **Safe observable failures.** Expected provider failures become one classified, request-correlated warning and safe 503 envelope; unexpected defects remain 500. Tests inspect structured logs for forbidden query, coordinate, timezone, URL and provider content.

## Phases and Checkpoints

### Phase 1: Contract and outbound boundary

- W1 defines the public response schema and pure request validation, including raw-key rejection and canonical cache-key inputs.
- W2 defines WMO-to-condition and UV-risk mappings with every boundary covered by pure tests.
- W3 proves the fixed-origin, bounded transport and failure classification with an injectable fake fetch backed by a captured real response fixture.

Checkpoint W-A runs focused tests and the complete API check before response normalization.

### Phase 2: Normalization and HTTP composition

- W4 validates and normalizes all consumed Open-Meteo fields, including units, timezone, exactly seven local days and per-day `null` UV/probability handling, starting from the captured real response fixture.
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

None for local implementation. The approved spec fixes three-decimal coordinate rounding, canonical timezone, TTL, first-load behavior, UV bands, daily-condition source and nullable metrics. Public and commercial delivery gates remain in `production-delivery`.

## Approval Gate

The owner approved this weather-forecast plan and W1–W7 tasks, subject to the W1/W3/W4/W5 amendments now recorded here and in `tasks/todo.md`, on 2026-09-23.
