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
