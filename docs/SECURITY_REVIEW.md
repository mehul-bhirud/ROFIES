# Security Review — 2026-08-08

## Scope and method

This review covers the local implementation after the ADR 0003 redesign: Supabase institutional email/password authentication, applicant onboarding, private college-ID processing and review, admin membership activation, direct in-app notifications, the retention job, inventory commands, PostgreSQL grants/RLS/functions, Storage usage, telemetry redaction, browser security headers, tests, and operational scripts.

The review used the source-of-truth documents, OWASP 2025 categories, manual source/grant/RLS review, pgTAP role tests, authorization/privacy tests, Playwright browser checks, dependency audit, secret scan, runtime-reference scans, and clean-database migration verification.

The installed Codex Security standard-scan workbench was invoked once for the repository but failed while initializing its scan database and returned no scan ID or findings. Per the tool workflow it was not retried or replaced. This document therefore records a manual security review, not a successful Codex Security scanner run. A selective deep scan remains a release-gate option that requires explicit authorization because of expected runtime/cost.

## Validated finding fixed during this review

The final database lint/review found one reachable legacy maintenance path: `api.expire_reservations` still attempted to write through the removed application-email outbox after `notification_outbox` was dropped. This could make reservation expiry fail in maintenance even though direct in-app notifications were otherwise implemented.

Fix: migration `202608080018_expire_reservations_direct_notifications.sql` redefines `api.expire_reservations(batch_size)` as a service-role-only, fixed-search-path function that expires eligible reservations and writes `reservation_expired` notifications directly via `private.create_notification`. `supabase/tests/database/018_direct_notifications.test.sql` now verifies the expiry command creates a direct notification without the removed outbox.

No other Critical or Important issue was validated in the reviewed local implementation.

## Security-sensitive controls verified locally

- Authentication uses institutional email/password accounts through Supabase Auth; signup and recovery responses remain generic.
- Applicants remain blocked from catalog/borrowing until profile onboarding, processed college-ID submission, and admin approval are complete.
- Membership approval is server-mediated, self-review is denied, activation is atomic, and application notifications are created transactionally.
- College-ID images are processed server-side, stored in a private bucket, never exposed as durable public URLs, audited when viewed by membership admins, and scheduled for deletion 30 days after final decision.
- The retention job requires `Authorization: Bearer <CRON_SECRET>`, returns generic 404 for missing/wrong secrets, deletes Storage objects before marking metadata deleted, releases failed claims for retry, and emits only aggregate counts.
- Application-event email, Resend worker/configuration, OAuth sign-in routes, and notification outbox delivery tables/functions are removed from runtime paths.
- Inventory-changing commands remain bounded, origin-checked, idempotent, authorized server-side, audited, and protected by PostgreSQL constraints/RLS.
- Logs and telemetry redact email, phone, student identifiers, object names, URLs, and other private document material.
- Production build passes with security headers and nonce CSP behavior intact.

## OWASP 2025 outcome

| Area                      | Result                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broken access control     | Capability checks, active-account/member gates, applicant lockout, RLS, private document access audit, storage denial, and role matrix tests are in place.       |
| Security misconfiguration | Production forbids demo mode and requires secrets; no production deployment is configured; retention cron, SMTP, alerts, and domains remain external setup.      |
| Supply chain              | Frozen pnpm lockfile, minimal third-party runtime code, production dependency audit, and secret scan passed locally.                                             |
| Cryptographic failures    | No custom cryptography; managed Supabase Auth/session primitives and constant-time cron-secret comparison are used.                                              |
| Injection                 | Zod bounds, parameterized RPC, React escaping, generated object names, processed images, safe CSV, and redacted structured logs are used.                        |
| Insecure design           | ADR 0003, threat model, atomic state machines, no self-approval, idempotency, locks, append-only history, retention observability, and recovery exercises exist. |
| Authentication failures   | Confirmed institutional email ownership, generic auth responses, recovery flow, active-profile checks, and command-time authorization are covered.               |
| Integrity failures        | Versioned migrations, immutable event triggers, direct-notification dedupe, clean reset tests, concurrency tests, and backup/reconciliation exercises passed.    |
| Logging/alerting failures | Correlation IDs and redacted aggregate events exist; production alert destinations and thresholds require institution-owned setup.                               |
| Exceptional conditions    | Fail-closed mutations, generic errors, storage-delete retry behavior, maintenance mode, and recovery exercises are covered.                                      |

## External release controls

The local repository is not deployed. Before pilot or production, the institution must configure isolated Supabase/Vercel projects, institution SMTP for Supabase Auth confirmation/recovery mail, private Storage policies/backups, scheduled retention invocation, alerting, production secrets, and post-deploy smoke checks. Rerun the standard Codex Security scan when its workbench is healthy, and authorize the selective deep scan before first production release if desired.
