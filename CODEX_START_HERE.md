# Codex: Finish the R.O.F.I.E.S Equipment Manager

You are taking over an existing, partially migrated Next.js/Supabase application. Continue the work in this repository and finish the approved product end to end. Do not stop at analysis, mockups, scaffolding, or a new plan. Implement, test, review, fix, and verify all remaining work that can be completed locally.

## First actions

1. Read `AGENTS.md` completely and obey it.
2. Read these source-of-truth documents in order:
   - `PROJECT_SPEC.md`
   - `docs/DOMAIN_MODEL.md`
   - `docs/ARCHITECTURE.md`
   - `docs/DATA_MODEL.md`
   - `docs/SECURITY.md`
   - `docs/THREAT_MODEL.md`
   - `docs/OPERATIONS.md`
   - `docs/TEST_STRATEGY.md`
   - `docs/adr/0003-password-registration-and-in-app-notifications.md`
3. Read the approved design:
   - `docs/superpowers/specs/2026-08-08-password-registration-id-verification-design.md`
4. Execute the existing plan rather than replacing it:
   - `docs/superpowers/plans/2026-08-08-password-registration-id-verification.md`
5. Read the durable progress ledger and task reports before changing code:
   - `.superpowers/sdd/2026-08-08-password-registration-id-verification/progress.md`
   - `.superpowers/sdd/2026-08-08-password-registration-id-verification/task-1-report.md`
   - `.superpowers/sdd/2026-08-08-password-registration-id-verification/task-1-review.md`
   - `.superpowers/sdd/2026-08-08-password-registration-id-verification/task-1-fix-round-1-review.md`
   - `.superpowers/sdd/2026-08-08-password-registration-id-verification/task-2-report.md`
   - `.superpowers/sdd/2026-08-08-password-registration-id-verification/task-2-review.md`
   - `.superpowers/sdd/2026-08-08-password-registration-id-verification/task-2-fix-round-1-review.md`
   - `.superpowers/sdd/2026-08-08-password-registration-id-verification/task-3-report.md`

## Current resume point

- Task 1, database applications/private college-ID boundary: implemented, fixed, reviewed, and complete.
- Task 2, password authentication/recovery: implemented, fixed, reviewed, and complete.
- Task 3, applicant onboarding/private college-ID upload: implementation and verification report are complete, but its independent task review was interrupted. Start by reviewing Task 3 against its brief and report. Fix every Critical/Important finding through a focused re-review before marking it complete.
- Tasks 4–8 are pending: admin member review, complete direct in-app notification migration/outbox removal, retention/observability/recovery, full UI/E2E/accessibility work, and final security/release verification.

Do not redo Tasks 1–2. Trust the ledger and reports, then inspect current files to confirm the working state. Preserve all existing user changes.

## Required working method

- Use `superpowers:subagent-driven-development` to resume the plan task-by-task. Use a fresh implementer and independent spec/code-quality review for each task, including Task 3's missing review.
- Use `superpowers:test-driven-development` for every feature or fix.
- Use `supabase-postgres-best-practices` before changing migrations, PostgreSQL functions, indexes, grants, Storage policies, or RLS.
- Use `ui-ux-pro-max`, `frontend-design`, and `vercel-react-best-practices` for all remaining UI work. Keep the current sleek, calm robotics/engineering design system and responsive 375 px behavior.
- Use `playwright-best-practices` before changing Playwright tests.
- Use the applicable Codex Security skills for security review and finding validation.
- Use `code-review-and-quality` and `superpowers:verification-before-completion` before any completion claim.
- Keep `.superpowers/sdd/2026-08-08-password-registration-id-verification/progress.md` current so work survives context compaction.

This directory currently has no `.git` metadata. The owner explicitly authorized editing it in place. Do not initialize Git, manufacture commits, push, deploy, or create external resources. Use test-backed checkpoints and the SDD ledger instead.

## Product decisions that must not regress

- Authentication is institutional email/password through Supabase Auth—not Google OAuth.
- Supabase Auth may send confirmation, recovery, and security messages through institution-owned SMTP. Application events must never send email.
- Students provide their profile details and upload a college-ID image. The image is processed server-side and stored in a separate private Supabase Storage bucket; PostgreSQL stores metadata/object reference, never image bytes.
- Only an authorized admin can review an ID and atomically “Verify and activate member.” Applicants cannot approve themselves.
- A confirmed but unapproved applicant cannot browse the catalog, request equipment, read member notifications/contacts, or access staff pages.
- Admins may approve, request changes, or reject. College-ID objects for every current/superseded document are due for deletion exactly 30 days after approval or rejection; decision/audit metadata remains.
- Application notifications are in-app only, direct, transactional, and idempotent. Remove Resend, the runtime worker, notification outbox, email-delivery tables/functions/configuration, and all active application-email copy.
- Read notifications archive after 180 days.
- Every borrowing request requires authorized admin approval and an in-person admin-confirmed handover.
- No monetary fines, payments, deposits, SMS, WhatsApp, QR/barcode/camera workflow, native app, or mandatory per-unit label feature.
- Equipment remarks remain admin-editable. High-importance reusable equipment has due dates visible as privacy-safe availability dates.
- Inventory mutations remain atomic, idempotent, authorized server-side, audited, non-negative, and concurrency-safe.
- Students never see another borrower’s identity, private ID, internal remarks, precise storage location, or privileged audit information.

## Task 3 review gate

Before Task 4, independently review the files listed in `task-3-report.md`, especially:

- `src/lib/auth/application-access.ts`
- `src/lib/auth/member-application.ts`
- `src/app/api/member-application/route.ts`
- `src/proxy.ts`
- `src/components/onboarding/member-application-form.tsx`
- `src/app/onboarding/page.tsx`
- `src/app/pending/page.tsx`
- `src/lib/safety/images.ts`
- Task 3 unit, integration, component, and E2E tests

Check authorization/state confusion, cross-user replacement, malicious images, multipart bounds, metadata stripping, server-only service access, orphan cleanup, ambiguous RPC results, response/log redaction, lack of camera capture, pending/rejected confinement, `changes_requested` resubmission, and 375 px accessibility. Write the review into the existing SDD workspace and use the standard fix/re-review loop.

## Completion requirements

Continue through Tasks 4–8 without asking whether to continue. Stop only for a real external/user-owned blocker or a product decision not resolved by the source-of-truth documents.

Before declaring completion, run fresh versions of all applicable commands and record exact results:

```powershell
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:reset
pnpm test:db
pnpm db:lint
pnpm test:integration
pnpm test:authz
pnpm test:concurrency
pnpm test:e2e
pnpm test:a11y
pnpm build
pnpm audit --prod
pnpm scan:secrets
pnpm test:performance
pnpm backup:exercise
pnpm reconcile:exercise
```

Run forbidden-runtime scans for Google OAuth, Resend, application-email delivery, `notification_outbox`, and `email_deliveries`. Historical migrations/ADRs/reports may retain clearly labeled historical references; current runtime, environment configuration, active schema, UI copy, and current source-of-truth behavior may not.

Resolve the existing repository-wide Prettier warnings rather than carrying them into the final report. Re-run security review after all changes. Update `README.md`, the implementation plan/ledger, `docs/SECURITY_REVIEW.md`, and `docs/VERIFICATION_REPORT.md` with current evidence. Historical evidence must not be presented as proof of the revised implementation.

Do not claim institution SMTP, Vercel deployment, production Storage retention, production backups, or external alerts work unless they are verified in institution-owned environments. Clearly list those as external setup, but finish every safe local implementation and test first.
