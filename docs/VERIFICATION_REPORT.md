# Verification Report — 2026-08-08

## Outcome

The ADR 0003 redesign is implemented and passes the safe local verification matrix. No repository changes were pushed, no pull request was opened, no production deployment occurred, no production schema was changed, no real email was sent, and no external paid/provider resource was created.

The remaining work is external release setup: institution-owned Supabase/Vercel projects, institution SMTP for Supabase Auth confirmation/recovery mail, scheduled retention job invocation, private-storage backup/expiry policy confirmation, alert destinations, production secrets, post-deploy smoke tests, and explicit deployment approval.

## Current evidence

| Command                          | Outcome                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Passed; lockfile already current.                                                                                                                                                                                                                     |
| `pnpm format:check`              | Passed after running `pnpm format` for mechanical formatting.                                                                                                                                                                                         |
| `pnpm lint`                      | Passed with zero warnings.                                                                                                                                                                                                                            |
| `pnpm typecheck`                 | Passed under strict TypeScript.                                                                                                                                                                                                                       |
| `pnpm test`                      | Passed: 21 files, 106 unit/component tests.                                                                                                                                                                                                           |
| `pnpm db:reset`                  | Passed from a clean PostgreSQL 17 database through the current ordered migrations and fictional seed data.                                                                                                                                            |
| `pnpm test:db`                   | Passed: 18 pgTAP files, 175 database/RLS/constraint/command assertions.                                                                                                                                                                               |
| `pnpm db:lint`                   | Exit 0 after fixing the reachable `api.expire_reservations` legacy-outbox reference. The CLI still prints third-party pgTAP `extensions` schema noise, but no app/private/public finding.                                                             |
| `pnpm test:integration`          | Passed: 4 files, 18 integration tests.                                                                                                                                                                                                                |
| `pnpm test:authz`                | Passed: 5 authorization/privacy matrix tests.                                                                                                                                                                                                         |
| `pnpm test:concurrency`          | Passed: approval race test.                                                                                                                                                                                                                           |
| `pnpm test:e2e`                  | Passed: 36 tests, with 4 intentional project-scope skips. Expected `command.failed origin_denied` log lines are emitted by security tests.                                                                                                            |
| `pnpm test:a11y`                 | Passed: 10 accessibility checks.                                                                                                                                                                                                                      |
| `pnpm build`                     | Passed: Next.js 16.3 optimized production build.                                                                                                                                                                                                      |
| `pnpm audit --prod`              | Passed: no known production dependency vulnerabilities.                                                                                                                                                                                               |
| `pnpm scan:secrets`              | Passed: 209 files inspected with no credential pattern or public privileged variable.                                                                                                                                                                 |
| `pnpm test:performance`          | Passed at 2,000 users, 300 active members, 2,000 units, 2,000 requests, and 5,000 audit events; representative queries measured approximately 0.012–0.316 ms; setup/plans took about 120 ms.                                                          |
| `pnpm backup:exercise`           | Passed in isolated database `rofies_restore_1786187950494`; evidence included profiles 8, catalog items 8, audit events 4, member application decisions 1, college-ID metadata 1, no expired-ID object content expectation, and request RLS verified. |
| `pnpm reconcile:exercise`        | Passed: 1 reconciliation integration test.                                                                                                                                                                                                            |

## Visual, UI, and accessibility evidence

Task 7 added and reverified the student signup/recovery/onboarding/pending journeys, membership-admin review journey, connected account shell state, mobile overflow checks, a11y scans, and visual screenshots. The UI keeps the existing calm engineering visual system, includes explicit college-ID privacy/retention copy, supports 375 px mobile layouts, and preserves accessible labels, status text, focus behavior, and non-color status cues.

## Security review

Manual threat and OWASP 2025 reviews are recorded in `docs/THREAT_MODEL.md` and `docs/SECURITY_REVIEW.md`. The final review found and fixed one legacy direct-notification migration gap in `api.expire_reservations`; regression coverage was added. No validated Critical or Important security issue remains in the safe local implementation.

The Codex Security standard repository scan was started once, but its workbench failed while initializing the scan database and returned no scan ID or results. Per the scanner workflow it was not retried or substituted. This is a tooling limitation, not a passed scan. Rerun the standard scan when the workbench is healthy.

## Runtime removal checks

Final runtime scans cover `src`, `.env.example`, `package.json`, and `supabase/seed.sql` for Google OAuth, `signInWithOAuth`, Resend configuration/API usage, and removed outbox delivery names. Remaining repository references to Google OAuth, Resend, and removed outbox names are historical ADR/spec/plan/report text, old migration history, removal/backfill assertions, or test documentation rather than executable application-event email paths.

No push, pull request, deployment, production schema change, real email, or external resource creation occurred.
