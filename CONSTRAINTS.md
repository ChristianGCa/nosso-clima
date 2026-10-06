# Constraints

Last reviewed: 2026-09-21 by the project owner

This file defines the minimum quality bar for NossoClima. A failing constraint blocks delivery when its activation module has been implemented. Constraints may be tightened without special approval; weakening or bypassing one requires explicit approval and a documented exception.

## Floor

- No new suppression comments such as `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `biome-ignore`, `istanbul ignore`, `nosemgrep` or `gitleaks:allow` without an approved exception.
- No unimplemented stubs, placeholder returns, empty `catch` blocks or `throw new Error("Not implemented")` in completed work.
- No skipped or deleted tests merely to make a check pass.
- No secrets, credentials or private keys in source, fixtures, logs or documentation.
- No stack traces or internal exception details in public HTTP responses.
- No direct dependency from `apps/web` to runtime code in `apps/api`, or the reverse.
- `CONSTRAINTS.md` must not be weakened in the same change that fails a constraint.

## Enforced Constraints

| Dimension | Rule | Checked by | Activation | Runs at |
|---|---|---|---|---|
| Types | Zero TypeScript errors | `npm run typecheck` | `backend-platform` | Every task |
| Lint and format | Zero errors from the committed Biome configuration | `npm run lint && npm run format:check` | `backend-platform` | Every task |
| Tests | All relevant unit and integration tests pass | `npm test` | `backend-platform` | Every task |
| Coverage | At least 80% lines, branches, functions and statements in each application | `npm run test:coverage` | Owning application | Task end and CI |
| Critical behavior | Validation, cache expiry/eviction, rate limiting and public error mapping cover every specified branch | Named tests reviewed against the active spec, then `npm run test:coverage` | Owning module | Task end and review |
| Dependency security | No unmitigated high or critical advisory | `npm audit --audit-level=high` | First lockfile | Task end and CI |
| Secret scanning | No detected secret; findings are always redacted | `gitleaks detect --redact --no-banner` | `production-delivery` | CI and release |
| Architecture | Zero prohibited imports across application and adapter boundaries | `npm run check:boundaries` | `weather-ui` | Task end and CI |
| Accessibility | Zero critical or serious axe violations | `npm run test:a11y` | `weather-ui` | Preview and CI |
| Performance | Mobile LCP ≤ 2.5 s and CLS ≤ 0.1 | `npm run test:performance` | `production-delivery` | Preview and CI |

## Time Budgets

- Local checks run before handoff must complete within 90 seconds on the project development machine.
- Full browser, Lighthouse and security checks may take up to five minutes and run only at task end or in CI.
- A check that exceeds its budget must be moved to a later lifecycle stage or optimized; it must not be silently removed.

## Enforcement Stages

- During specification, constraints are recorded but no application dependencies are installed.
- During each module bootstrap, the commands activated by that module must be implemented and demonstrated before the module is considered complete.
- Performance and accessibility are measured while `weather-ui` is built and become blocking gates in `production-delivery`.
- Checks should be scoped to the changed application where practical, while root commands remain the canonical project entry points.

## Exceptions

Approved exception, 2026-10-05:

| Rule | Path / fingerprint | Reason | Owner | Expires |
|---|---|---|---|---|
| Secret scanning: Gitleaks `generic-api-key` historical finding only | `apps/api/test/unit/open-meteo-transport.test.ts`; rewritten commit `45b204c564c524e7be1a4c17a663fa5a21dcb2f0`, line 27; exact fingerprint in `.gitleaksignore` | The old test used the Open-Meteo forecast host with port 8443 as a non-secret allowlist fixture. The current test builds this URL in parts, and a full current-tree scan is clean. The owner approved the one-fingerprint exception in this conversation on 2026-10-05. | ChristianGCa | 2026-12-31 |

Any future exception must record the rule, path, reason, owner and an expiry date no more than 90 days away.
