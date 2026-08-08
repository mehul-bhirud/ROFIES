# R.O.F.I.E.S Implementation Plan

> **Current status — 2026-08-08:** the ADR 0003 redesign is implemented and locally reverified. Authentication now uses institutional email/password through Supabase Auth, applicants complete profile plus private college-ID onboarding before catalog access, membership administrators review ID documents through audited private access, and application notifications are direct in-app records. The original Google OAuth/Resend release plan remains visible below only as historical architecture context for the earlier release candidate.

**Goal:** Deliver the approved responsive equipment catalog, reservation, circulation, administration, and operations system as a locally reproducible Next.js/Supabase release candidate.

**Architecture:** A single Next.js App Router application exposes server-rendered queries and focused Route Handler commands. Domain rules live in framework-independent TypeScript modules and authoritative PostgreSQL transactions; PostgreSQL constraints, grants, and RLS provide defense in depth. Supabase Auth/Storage integrate through narrow adapters so local tests can run without external credentials. Application-event notifications are direct in-app database records; no application-email outbox remains.

**Tech stack:** pnpm; Node.js 24; Next.js 16; React 19; strict TypeScript; Zod; Supabase SSR/client; PostgreSQL 17 through the project-local Supabase CLI; Vitest; Testing Library; Playwright + axe; ESLint; Prettier.

## Global constraints

- Production timezone is `Asia/Kolkata`; timestamps are stored as UTC instants.
- Server authorization is deny-by-default and separate from authentication.
- Protected mutations are atomic, idempotent, audited, origin-checked, and never report success before commit.
- Pending requests do not reserve stock; approved reservation lines do.
- No self-approval, negative stock, overlapping over-allocation, cross-borrower disclosure, browser secret, or destructive history rewrite.
- Desktop and mobile are co-equal; staff handover/return flows work at 375 px and WCAG 2.2 AA is the accessibility target.
- No production deployment, resource creation, push, or real-credential use is authorized.

## Phase 1 — Engineering foundation

- [x] Create the pinned pnpm/Next.js project, strict compiler/lint/format settings, environment validation, safe examples, PWA metadata, security headers, CI, and local commands.
- [x] Establish Vitest, Testing Library, Playwright, axe, and database-test harnesses with deterministic fictional identities and data.
- [x] Record package/UI/query/email/observability choices in an accepted ADR.
- [x] Gate: reproducible install, lint, typecheck, base unit tests, and production build pass.

## Phase 2 — Design system and shell

- [x] Document final visual tokens and interaction/accessibility rules in `docs/UI_SYSTEM.md`.
- [x] Implement accessible primitives, responsive navigation, member catalog/detail/request/history, and staff operations screens.
- [x] Implement loading, empty, validation, conflict, permission, stale, degraded/offline, and unexpected-error states.
- [x] Gate: representative 375/768/1024/1440 views, keyboard navigation, axe scan, reduced motion, and no placeholder content.

## Phase 3 — Identity, authorization, and database foundation

- [x] Add Supabase local configuration and versioned migrations for identity, membership, composable roles, policies, idempotency, audit, and maintenance state.
- [x] Implement Google OAuth continuation, server-side verified-domain enforcement, session refresh, active-account checks, capabilities, recent-auth guards, and deactivation.
- [x] Add least-privilege grants and explicit RLS policies/tests for signed-out, student, member, staff-capability, admin, and deactivated cases.
- [x] Gate: clean reset/migrations, domain and authorization matrix, RLS tests, and browser-bundle secret inspection pass.

## Phase 4 — Catalog and inventory

- [x] Implement catalog/categories/aliases/tags/specifications/photos/locations/policies and pooled, individual, and consumable storage models.
- [x] Implement append-only adjustments, condition movement, repair/archive behavior, safe member catalog views, bounded full-text/trigram search, and date-aware availability.
- [x] Implement server queries and staff inventory commands with validation, authorization, audit, telemetry, and safe image handling.
- [x] Gate: constraints/RLS/search/index/upload/privacy/responsive tests and representative query plans pass.

## Phase 5 — Requests, reservations, and waitlists

- [x] Implement request cart, borrower/project/team context, lifecycle guards, per-line decisions, change/reject/override reasons, and cancellations.
- [x] Implement transaction-time availability, deterministic locking, approved reservations, pickup readiness/expiry, waitlist order, claim windows, and override audits.
- [x] Gate: concurrent approvals cannot overbook; pending/approved allocation semantics, self-approval denial, stale conflicts, retries, and privacy tests pass.

## Phase 6 — Handover, loans, returns, and maintenance

- [x] Implement phone-first reservation handover and eligible consumable counter issue with member/stock revalidation.
- [x] Implement loan/due/overdue/extension, partial mixed-condition returns, repair routing, loss/write-off, and append-only outage reconciliation.
- [x] Gate: pooled/individual/consumable journeys, idempotent retry, race, non-negative stock, audit/outbox, and failure rollback tests pass.

## Phase 7 — Notifications and administration

- [x] Implement in-app notifications, outbox claiming/retry/deduplication, email adapter/failure visibility, contacts, policies, notices, and reminders.
- [x] Implement dashboard, reports, safe bounded CSV export, audit browser, health/maintenance/reconciliation screens, and authorization.
- [x] Gate: provider failure isolation, CSV formula neutralization, privacy, scheduled-job observability, and retry tests pass.

## Phase 8 — Hardening and release candidate

- [x] Add CSP/security headers, CSRF/origin enforcement, rate limits, body/pagination bounds, log redaction, upload/export hardening, correlation IDs, and integrity/health instrumentation.
- [x] Exercise local backup/restore and emergency reconciliation; run production-scale seed/query/concurrency checks.
- [x] Run five-axis code review, threat-model review, security diff review, attempt the standard source scan, manually validate/fix findings, and run dependency/secret scans. The standard workbench initialization failure is recorded in `docs/SECURITY_REVIEW.md`.
- [x] Write `docs/VERIFICATION_REPORT.md`, operations runbooks, and update repository guidance with exact commands and honest external-setup limitations.

## Specification traceability

| `PROJECT_SPEC.md` section | Implementation                                | Verification                                                |
| ------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| 1–2 Objective and scale   | Phases 1, 4, 7, 8                             | Production-scale seed and query/load evidence               |
| 3 Roles and authorization | Phase 3 capability model and RLS              | Server + database permission/privacy matrix                 |
| 4 Scope                   | Phases 2–7; exclusions retained               | Acceptance E2E and prohibited-feature review                |
| 5 Inventory               | Phase 4 schema, commands, catalog UI          | Constraint, privacy, search, condition, archive tests       |
| 6 Borrowing               | Phases 5–6 transactions and staff/member UI   | Lifecycle, concurrency, idempotency, full-journey tests     |
| 7 Availability/waitlists  | Phase 5 availability and claims               | Date-range, overlap, privacy, ordering/race tests           |
| 8 Notifications           | Phase 7 transactional outbox                  | Retry/deduplication/provider-failure tests                  |
| 9 Contacts                | Phase 7 visibility-shaped contacts            | Student/member/staff privacy tests                          |
| 10 Main experiences       | Phase 2 shell plus Phases 4–7 screens         | Mobile/desktop Playwright + axe                             |
| 11 Configuration          | Phases 3 and 7 effective-dated policy data    | Capability, validation, timezone/history tests              |
| 12 Errors/outages         | Phases 2, 6, 8 safe errors and reconciliation | Failure injection, degraded-read, maintenance tests         |
| 13 Quality attributes     | All phases                                    | Performance, accessibility, isolation, observability checks |
| 14 Acceptance criteria    | Phase 8 release gate                          | Aggregated verification report                              |
| 15 Delivery sequence      | Phase order above                             | Ledger state and final report                               |
| 16 References             | ADRs and implementation docs                  | Documentation review                                        |

## Verification commands (planned)

`pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm db:start`, `pnpm db:reset`, `pnpm test:db`, `pnpm test:authz`, `pnpm test:concurrency`, `pnpm test:e2e`, `pnpm test:a11y`, `pnpm build`, `pnpm audit --prod`, `pnpm scan:secrets`, `pnpm test:performance`, `pnpm backup:exercise`, and `pnpm reconcile:exercise`.
