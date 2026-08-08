# Password Registration and College-ID Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace Google OAuth and Resend-backed application email with secure institutional email/password registration, private college-ID review, admin-controlled membership activation, and direct in-app notifications.

**Architecture:** Supabase Auth owns passwords, confirmation, recovery, and sessions; institution SMTP is configured only in Supabase Auth. Next.js server routes validate applicant input and process private images, while PostgreSQL functions atomically enforce application state, authorization, membership activation, audits, and in-app notifications. A versioned migration supersedes the old outbox without rewriting historical migrations.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript 6, Zod 4, Supabase Auth/PostgreSQL/Storage, PostgreSQL 17, Sharp, Vitest, pgTAP, Playwright, axe.

## Global Constraints

- `PROJECT_SPEC.md`, `docs/DOMAIN_MODEL.md`, ADR 0003, and the approved design spec are authoritative.
- Accept only confirmed addresses in `ROFIES_ALLOWED_EMAIL_DOMAINS`; normalize comparisons to lowercase and never trust client-supplied verification state.
- A confirmed applicant has no catalog, request, notification, or staff access until an authorized admin approves the application.
- “Verify and activate member” is one PostgreSQL transaction; the applicant cannot approve their own application.
- College-ID images use a separate private bucket, generated object names, server-side decoding/re-encoding, audited reviewer access, and deletion 30 days after approval or rejection.
- Application notifications are in-app only, created in the originating transaction with a unique deduplication key, and read notifications are archived after 180 days.
- Do not edit prior migrations. Add forward-only migrations and verify both clean reset and upgrade behavior.
- No Google OAuth, Resend, application-email worker, application-email delivery table, or browser-visible privileged secret may remain.
- Preserve append-only business history and existing approved members during migration.
- This directory currently has no `.git`; do not initialize a repository or claim commits. End each task with a test-backed file checkpoint.

---

## File Structure

### Create

- `supabase/migrations/202608080015_member_applications.sql` — application state, private document metadata, notification deduplication helper, RLS, review/access/cleanup functions, and storage bucket policies.
- `supabase/migrations/202608080016_direct_notifications.sql` — final command definitions, data migration, outbox removal, archive function, and health views.
- `supabase/tests/database/017_member_applications.test.sql` — application, membership, RLS, self-approval, document-access, and retention tests.
- `supabase/tests/database/018_direct_notifications.test.sql` — atomic notification, deduplication, archive, and removed-outbox tests.
- `src/lib/auth/schemas.ts` — signup, login, recovery, password-update, onboarding, and admin-decision schemas.
- `src/lib/auth/actions.ts` — server actions for password-auth flows with generic errors and trusted redirects.
- `src/lib/auth/application-access.ts` — canonical application-state route decision.
- `src/app/auth/sign-in/page.tsx`, `src/app/auth/sign-up/page.tsx`, `src/app/auth/check-email/page.tsx`, `src/app/auth/confirm/route.ts`, `src/app/auth/forgot-password/page.tsx`, `src/app/auth/update-password/page.tsx` — password-auth experience.
- `src/components/auth/auth-form.tsx` — accessible reusable auth form shell.
- `src/app/onboarding/page.tsx`, `src/app/pending/page.tsx`, `src/components/onboarding/member-application-form.tsx` — profile and college-ID submission/resubmission plus pending/final-decision status.
- `src/app/api/member-application/route.ts` — authenticated multipart application submission.
- `src/app/api/member-application/id-document/route.ts` — authorized short-lived private college-ID delivery.
- `src/app/admin/members/page.tsx`, `src/components/admin/member-review-card.tsx` — reviewer queue and decisions.
- `src/app/api/jobs/retention/route.ts` — authenticated document deletion and notification archival job.
- `tests/unit/auth-schemas.test.ts`, `tests/unit/application-access.test.ts` — pure validation/routing tests.
- `tests/integration/member-application.test.ts`, `tests/integration/retention.test.ts` — server/database/storage coordination tests.
- `tests/e2e/auth-onboarding.spec.ts`, `tests/e2e/member-review.spec.ts` — responsive user and admin journeys.

### Modify

- `.env.example`, `src/lib/env/server.ts` — remove Resend values; retain a generic job secret and document Supabase Auth SMTP as provider-side configuration.
- `src/lib/auth/identity.ts`, `src/lib/auth/profile-provisioning.ts`, `src/lib/auth/access.ts`, `src/proxy.ts` — password identity, applicant state, and route gating.
- `src/components/layout/app-shell.tsx`, `src/components/layout/navigation.tsx`, `src/app/auth/error/page.tsx`, `src/app/globals.css` — real account state, member-review navigation, and polished responsive auth/onboarding/review UI.
- `src/app/api/commands/[command]/route.ts`, `src/lib/validation/commands.ts` — admin verification/change/rejection commands if the dedicated review action delegates to the shared command boundary.
- `src/lib/operations/queries.ts`, `src/app/notifications/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/operations/page.tsx` — application queue, direct-notification copy, and new health metrics.
- `supabase/seed.sql`, test fixtures, and performance/backup scripts — fictional applications, direct notifications, and new table coverage.
- `README.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/SECURITY_REVIEW.md`, `docs/VERIFICATION_REPORT.md` — current status and fresh evidence after all gates pass.

### Delete after replacement tests pass

- `src/app/auth/sign-in/route.ts`, `src/app/auth/callback/route.ts` — Google OAuth endpoints.
- `src/app/api/jobs/outbox/route.ts`, `src/lib/domain/outbox.ts`, `tests/unit/outbox.test.ts`, `supabase/tests/database/013_outbox_delivery.test.sql` — application-email delivery path.

---

### Task 1: Database Application and Private-Document Boundary

**Files:**

- Create: `supabase/migrations/202608080015_member_applications.sql`
- Create: `supabase/tests/database/017_member_applications.test.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**

- Produces enum `public.member_application_state` with `incomplete`, `pending_review`, `changes_requested`, `approved`, `rejected`.
- Produces tables `public.member_applications` and `public.college_id_documents`.
- Adds `notifications.deduplication_key` and produces `private.create_notification(uuid,text,text,text,text,uuid,text)` so review decisions can notify atomically before Task 5 migrates the remaining business commands.
- Produces functions `api.submit_member_application(text,text,smallint,text,text)`, `api.member_application_status()`, `api.review_member_application(uuid,text,text,text)`, `api.college_id_object(uuid)`, and `api.claim_expired_college_ids(integer)`.
- `api.review_member_application` returns JSON containing `application_id`, `state`, and `membership_status`.

- [x] **Step 1: Write failing pgTAP schema and invariant tests**

```sql
select has_table('public', 'member_applications');
select has_table('public', 'college_id_documents');
select function_returns('api', 'review_member_application', array['uuid','text','text','text'], 'jsonb');
select throws_ok(
  $$ select api.review_member_application('00000000-0000-0000-0000-000000000101','approved','self approval','self-key-0001') $$,
  '42501',
  'requester may not review own application'
);
```

- [x] **Step 2: Run the new database test and confirm it fails before the migration exists**

Run: `pnpm db:reset; pnpm exec supabase test db supabase/tests/database/017_member_applications.test.sql`

Expected: failures for the missing enum, tables, and functions.

- [x] **Step 3: Add the application schema and upgrade-safe existing-member migration**

Implement UUID primary keys, one application per profile, one current document per application, decision metadata, `object_name` without image bytes, `deletion_due_at`, `deleted_at`, and timestamps. Set `profiles.active` default to `false`, preserve existing rows, and seed existing active memberships as approved applications without fabricating ID documents.

Use constraints equivalent to:

```sql
check ((state in ('approved','rejected')) = (decided_at is not null)),
check (deleted_at is null or deletion_due_at is not null)
```

- [x] **Step 4: Implement atomic application and review functions**

`submit_member_application` must use `auth.uid()`, require `email_confirmed_at`, compare the JWT email domain against the configured institution domain table, lock the application, require a registered current document, and move `incomplete` or `changes_requested` to `pending_review`. `review_member_application` must require `membership:manage`, reject self-review, use an idempotency key, lock the row, and for `approved` update the application plus `memberships.status='active'` in one transaction. Every decision inserts an audit event and a deduplicated in-app notification.

- [x] **Step 5: Add the private `college-ids` bucket and RLS policies**

Allow no public read/list. Applicants may register/replace only their own document while `incomplete` or `changes_requested`; reviewers with `membership:manage` receive an object name only through `api.college_id_object`, which also inserts `college_id.accessed` into append-only audit history. Set `cacheControl: private, no-store` at delivery time.

- [x] **Step 6: Complete pgTAP role, state, and retention coverage**

Cover unconfirmed email denial, wrong-domain denial, cross-applicant denial, direct storage denial, resubmission, self-review, unauthorized review, approval/member atomicity, rejection without membership, access audit, `deletion_due_at = decided_at + interval '30 days'`, and retry-safe cleanup claims.

- [x] **Step 7: Run the database gate and record the checkpoint**

Run: `pnpm db:reset; pnpm test:db; pnpm db:lint`

Expected: reset succeeds, all pgTAP tests pass, and no application-schema lint warning remains.

---

### Task 2: Password Authentication and Generic Recovery Flows

**Files:**

- Create: `src/lib/auth/schemas.ts`
- Create: `src/lib/auth/actions.ts`
- Create: `src/components/auth/auth-form.tsx`
- Create: auth pages/routes listed in File Structure
- Create: `tests/unit/auth-schemas.test.ts`
- Modify: `src/lib/auth/identity.ts`, `src/lib/auth/profile-provisioning.ts`, `src/app/auth/error/page.tsx`, `.env.example`, `src/lib/env/server.ts`
- Delete: `src/app/auth/sign-in/route.ts`, `src/app/auth/callback/route.ts`

**Interfaces:**

- Produces `signUpAction`, `signInAction`, `requestPasswordResetAction`, `updatePasswordAction`, and `signOutAction` returning `{ ok: boolean; message: string; fieldErrors?: Record<string,string[]> }`.
- Produces `validateInstitutionalEmail(email, allowedDomains)` and schemas with normalized lowercase email.

- [x] **Step 1: Write failing schema and identity tests**

```ts
expect(
  signUpSchema.safeParse({ email: "student@gmail.com", password: "Correct-Horse-42" }).success
).toBe(false);
expect(normalizeInstitutionalEmail(" STUDENT@IIITP.AC.IN ")).toBe("student@iiitp.ac.in");
```

- [x] **Step 2: Run the focused unit test and verify the red state**

Run: `pnpm exec vitest run tests/unit/auth-schemas.test.ts`

Expected: module-not-found or missing-export failure.

- [x] **Step 3: Implement Zod schemas and server actions**

Use Supabase `signUp`, `signInWithPassword`, `resetPasswordForEmail`, and `updateUser`. Construct confirmation/recovery redirects only from `ROFIES_APP_ORIGIN`. Use the same generic acknowledgement for existing/non-existing signup and recovery accounts; never log passwords, tokens, or raw Supabase auth errors.

- [x] **Step 4: Implement `/auth/confirm` token exchange**

Accept only Supabase-supported `token_hash` and `type` values, call `verifyOtp`, clear failed sessions, and redirect confirmed users to `/onboarding`. Reject an untrusted `next` parameter and use fixed local routes.

- [x] **Step 5: Build accessible responsive auth screens**

Use real labels, autocomplete values (`email`, `current-password`, `new-password`), error summaries, disabled/submitting states, password requirements, confirmation guidance, and links between sign-in/signup/recovery. Do not expose whether an account exists.

- [x] **Step 6: Remove OAuth/Resend configuration and scan runtime references**

Delete OAuth routes and remove `RESEND_API_KEY`/`ROFIES_EMAIL_FROM` from environment parsing and `.env.example`. Retain a generic `CRON_SECRET` for retention/archive jobs. Add provider-side Supabase Auth SMTP setup notes without placing SMTP credentials in the repository.

- [x] **Step 7: Run focused and static gates**

Run: `pnpm test -- tests/unit/auth-schemas.test.ts; pnpm typecheck; rg -n -i "signInWithOAuth|provider:\s*[\"']google|RESEND_API_KEY|api\.resend\.com" src .env.example`

Expected: tests/typecheck pass and the reference scan returns no runtime/config match.

---

### Task 3: Applicant Onboarding and College-ID Upload

**Files:**

- Create: `src/lib/auth/application-access.ts`, `src/app/onboarding/page.tsx`, `src/app/pending/page.tsx`, `src/components/onboarding/member-application-form.tsx`, `src/app/api/member-application/route.ts`, `tests/unit/application-access.test.ts`, `tests/integration/member-application.test.ts`
- Modify: `src/lib/safety/images.ts`, `src/lib/auth/profile-provisioning.ts`, `src/proxy.ts`, `src/app/globals.css`

**Interfaces:**

- Produces `applicationDestination(input): '/onboarding' | '/pending' | '/' | '/auth/error'`.
- `POST /api/member-application` consumes multipart fields `fullName`, `studentIdentifier`, `department`, `studyYear`, optional `phone`, and `collegeId`.
- Returns `{ status: 'pending_review'; referenceId: string }` only after storage registration and database submission commit.

- [x] **Step 1: Write failing route-state and upload tests**

```ts
expect(
  applicationDestination({
    emailConfirmed: true,
    active: false,
    applicationState: "changes_requested"
  })
).toBe("/onboarding");
expect(
  applicationDestination({
    emailConfirmed: true,
    active: false,
    applicationState: "pending_review"
  })
).toBe("/pending");
```

Integration cases must include non-image bytes, oversized files, cross-user replacement, storage success/database failure cleanup, and idempotent resubmission.

- [x] **Step 2: Run focused tests and confirm failure**

Run: `pnpm exec vitest run tests/unit/application-access.test.ts tests/integration/member-application.test.ts`

Expected: missing modules/routes cause failure.

- [x] **Step 3: Implement applicant routing without catalog leakage**

After `getUser`, require confirmed institutional email. Query only the caller’s application status. Route `incomplete`/`changes_requested` to onboarding, `pending_review`/`rejected` to a status page, `approved` plus active membership to the member app, and all inconsistent combinations to a fail-closed error.

- [x] **Step 4: Implement secure multipart upload coordination**

Bound the request body and all text fields, run Sharp decode/frame/dimension/pixel/byte validation, strip metadata, re-encode WebP, generate `applications/{applicationId}/{uuid}.webp`, upload through the server-only client, register metadata, and delete the newly uploaded object if the database transaction fails. Never return an object name or signed URL to the applicant.

- [x] **Step 5: Build onboarding and status UI**

Include full name, student ID, department, academic year, optional phone, college-ID file input, privacy/30-day-retention copy, image requirements, review states, admin feedback, resubmission, and sign-out. The UI must use the existing visual system and work at 375 px without horizontal overflow.

- [x] **Step 6: Run focused, accessibility, and privacy gates**

Run: `pnpm exec vitest run tests/unit/application-access.test.ts tests/integration/member-application.test.ts; pnpm test:a11y -- --grep "onboarding"; pnpm typecheck`

Expected: all pass and response snapshots contain no object name, service secret, or other applicant data.

---

### Task 4: Admin Review and Atomic Member Activation

**Files:**

- Create: `src/app/admin/members/page.tsx`, `src/components/admin/member-review-card.tsx`, `src/app/api/member-application/id-document/route.ts`, `tests/e2e/member-review.spec.ts`
- Modify: `src/lib/operations/queries.ts`, `src/components/layout/navigation.tsx`, `src/app/api/commands/[command]/route.ts`, `src/lib/validation/commands.ts`, `tests/authorization/privacy-matrix.test.ts`

**Interfaces:**

- Produces `getMemberApplicationQueue()` with profile fields, state, submitted time, and reviewer feedback but no durable object URL.
- Adds command `memberDecision` consuming `{ applicationId, decision: 'approved'|'changes_requested'|'rejected', reason, idempotencyKey }`.
- `GET /api/member-application/id-document?applicationId=<uuid>` returns processed image bytes only after capability check and audit insertion.

- [x] **Step 1: Write failing authorization and browser tests**

Cover ordinary member denial, reviewer access, self-review denial, stale double decision, audited image access, approval activation, changes request feedback, rejection, and mobile review controls.

- [x] **Step 2: Run focused tests and verify failure**

Run: `pnpm test:authz; pnpm exec playwright test tests/e2e/member-review.spec.ts`

Expected: missing route/UI/command failures.

- [x] **Step 3: Implement review query, image delivery, and command boundary**

Require `membership:manage` on every server entry. Use the user-scoped Supabase client for the review RPC. For image delivery, call `api.college_id_object`, then stream/download from the private bucket with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and no object path in error bodies.

- [x] **Step 4: Build the responsive review queue**

Show identity details, document preview, submitted/resubmitted timestamp, state, and mandatory reason. Make “Verify and activate member” explicit and visually distinct; require confirmation; provide separate “Request changes” and “Reject” actions; prevent repeat submission while pending.

- [x] **Step 5: Add navigation and operational counts**

Add “Member review” to staff navigation for capable users and expose pending application count in the staff dashboard without exposing IDs to unauthorized users.

- [x] **Step 6: Run authorization, E2E, and accessibility gates**

Run: `pnpm test:authz; pnpm exec playwright test tests/e2e/member-review.spec.ts; pnpm test:a11y -- --grep "member review"`

Expected: all pass, including 375 px and desktop projects.

---

### Task 5: Direct Transactional In-App Notifications and Outbox Removal

**Files:**

- Create: `supabase/migrations/202608080016_direct_notifications.sql`, `supabase/tests/database/018_direct_notifications.test.sql`
- Modify: `src/lib/operations/queries.ts`, `src/app/notifications/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/operations/page.tsx`, `supabase/seed.sql`, database tests that assert outbox state
- Delete: `src/app/api/jobs/outbox/route.ts`, `src/lib/domain/outbox.ts`, `tests/unit/outbox.test.ts`, `supabase/tests/database/013_outbox_delivery.test.sql`

**Interfaces:**

- Consumes `private.create_notification(recipient_id,event_type,title,body,related_entity_type,related_entity_id,deduplication_key)` from Task 1 and applies it to every remaining business command.
- Produces `api.archive_read_notifications(batch_size integer default 500)` returning an integer count.
- `notifications` gains `archived_at timestamptz`; Task 1 already added the unique deduplication key required by application-review notifications.

- [x] **Step 1: Write failing pgTAP tests for atomic creation and schema removal**

```sql
select has_column('public','notifications','archived_at');
select hasnt_table('public','notification_outbox');
select hasnt_table('public','email_deliveries');
```

Exercise request, decision, handover, return, extension, waitlist, counter issue, loss, expiry, and membership review; each committed command must create exactly one expected notification and an idempotent retry must not create another.

- [x] **Step 2: Run the direct-notification test and confirm the red state**

Run: `pnpm exec supabase test db supabase/tests/database/018_direct_notifications.test.sql`

Expected: new columns/functions are missing and outbox tables still exist.

- [x] **Step 3: Use the direct-notification helper and redefine every final command**

Copy each latest function definition into the forward migration and replace its outbox insert with the Task 1 `private.create_notification` helper. Use event-specific human-readable title/body text and entity links. Because the helper runs in the same PostgreSQL transaction, a notification failure must roll back the business command.

- [x] **Step 4: Migrate historical outbox records and remove delivery infrastructure**

Backfill the Task 1 `deduplication_key` for legacy notification rows, convert outbox records not already represented by `notifications`, make the column non-null, drop the `notifications.outbox_id` foreign key/column, revoke/drop `claim_outbox`, `complete_outbox`, and `outbox_recipient_email`, then drop `email_deliveries`, `notification_outbox`, and the unused `delivery_state` enum. Redefine health views/functions to report unread/archivable notifications and retention failures instead of provider backlog.

- [x] **Step 5: Implement read and 180-day archive behavior**

Keep read marking owner-scoped and column-limited. Archive only rows with non-null `read_at` older than 180 days; archived rows disappear from normal user queries but remain available to authorized operational review if the specification requires investigation.

- [x] **Step 6: Remove worker/runtime code and update UI copy**

Delete the Resend worker and outbox retry helper/tests. Replace notification-page email/retry copy with clear in-app-authoritative copy. Replace dashboard `outboxPending` with `pendingMemberApplications` and `retentionFailures` or the exact new health fields established in the migration.

- [x] **Step 7: Run database, unit, type, and forbidden-reference gates**

Run: `pnpm db:reset; pnpm test:db; pnpm test; pnpm typecheck; rg -n -i "notification_outbox|email_deliveries|claim_outbox|complete_outbox|RESEND|api\.resend\.com" src supabase .env.example`

Expected: all tests pass; runtime/current migrations have no obsolete delivery dependency. Historical migrations may match and must remain untouched.

---

### Task 6: Retention Job, Observability, and Recovery

**Files:**

- Create: `src/app/api/jobs/retention/route.ts`, `tests/integration/retention.test.ts`
- Modify: `src/lib/env/server.ts`, `src/lib/telemetry.ts`, `src/lib/operations/queries.ts`, `scripts/backup-restore-exercise.ts`, `docs/OPERATIONS.md`

**Interfaces:**

- `POST /api/jobs/retention` requires `Authorization: Bearer <CRON_SECRET>`.
- Returns counts `{ collegeIdsDeleted, notificationsArchived, failures }` without object names or identities.

- [x] **Step 1: Write failing retention integration tests**

Cover missing/wrong secret as non-disclosing 404, due/non-due documents, storage deletion failure, retry after failure, metadata preservation, notification archive cutoff, and redacted logs.

- [x] **Step 2: Run the focused test and confirm failure**

Run: `pnpm exec vitest run tests/integration/retention.test.ts`

Expected: missing route failure.

- [x] **Step 3: Implement bounded cleanup coordination**

Claim at most 100 due document rows with skip-locked semantics, delete each object from `college-ids`, mark metadata deleted only after storage confirms success, record a redacted audit/operational event, then call `api.archive_read_notifications(500)`. Return 503 when the database is unavailable and never mark an object deleted after a failed storage call.

- [x] **Step 4: Add metrics, traces, alerts, and health data**

Emit counts and durations only. Health data must show oldest overdue ID deletion, deletion failures, last successful cleanup, and archived-notification lag. Do not log applicant identity, phone, student ID, object name, signed URL, password, token, or SMTP data.

- [x] **Step 5: Extend recovery evidence**

Update backup/restore exercise assertions for application decisions and document metadata while excluding expired ID object content from long-lived backup expectations. Document how an operator reconciles storage/database disagreement and proves 30-day deletion.

- [x] **Step 6: Run retention and recovery gates**

Run: `pnpm exec vitest run tests/integration/retention.test.ts; pnpm backup:exercise; pnpm reconcile:exercise`

Expected: all pass with no sensitive values in captured logs.

---

### Task 7: Complete User Journeys and Visual/Accessibility Review

**Files:**

- Create: `tests/e2e/auth-onboarding.spec.ts`
- Modify: `tests/e2e/fixtures.ts`, `tests/e2e/member.spec.ts`, `tests/e2e/staff.spec.ts`, `tests/e2e/security.spec.ts`, `tests/e2e/visual-review.spec.ts`, `src/components/layout/app-shell.tsx`, `src/app/globals.css`, `docs/UI_SYSTEM.md`

**Interfaces:**

- Uses the auth/application/review interfaces from Tasks 2–4.
- Produces current screenshot evidence for signup/onboarding and admin review at mobile and desktop widths.

- [x] **Step 1: Invoke UI skills before changing journey UI**

Read and apply `ui-ux-pro-max`, `frontend-design`, and `vercel-react-best-practices`; read `playwright-best-practices` before changing Playwright tests. Preserve the calm engineering visual system while improving auth/onboarding/review states.

- [x] **Step 2: Write failing end-to-end journeys**

Cover signup, generic confirmation message, confirmed first login, onboarding submission, pending lockout, admin review, approval, member catalog access, changes requested/resubmission, rejection, recovery, deactivation, and sign-out. Use fictional ID images generated for tests and never real student data.

- [x] **Step 3: Run the new journeys and verify failures are requirement-specific**

Run: `pnpm exec playwright test tests/e2e/auth-onboarding.spec.ts tests/e2e/member-review.spec.ts`

Expected: failures identify missing or incomplete journey behavior rather than test infrastructure errors.

- [x] **Step 4: Finish application-shell account state and responsive polish**

Replace hard-coded demo identity/unread counts in connected mode, show accurate applicant/member/admin status, add sign-out, keep status text independent of color, retain visible focus, avoid horizontal overflow, and respect reduced motion.

- [x] **Step 5: Run browser, accessibility, and visual gates**

Run: `pnpm test:e2e; pnpm test:a11y`

Expected: all supported desktop/mobile projects pass; any intentional skip is documented with a specific reason.

---

### Task 8: Security Review, Full Verification, and Documentation Handoff

**Files:**

- Modify: `README.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/SECURITY_REVIEW.md`, `docs/VERIFICATION_REPORT.md`, `docs/THREAT_MODEL.md`, `docs/TEST_STRATEGY.md`, `AGENTS.md`

**Interfaces:**

- Consumes all prior tasks and produces current, dated release evidence.

- [x] **Step 1: Run source-of-truth and forbidden-feature scans**

Run: `rg -n -i "Google OAuth|signInWithOAuth|Resend|api\.resend\.com|application-event email|notification_outbox|email_deliveries" -g '!docs/adr/0001-*' -g '!docs/adr/0002-*' -g '!docs/IMPLEMENTATION_PLAN.md' -g '!docs/VERIFICATION_REPORT.md' -g '!docs/SECURITY_REVIEW.md' .`

Expected: only explicit “removed/not supported” statements or immutable historical migrations remain; no runtime/config dependency remains.

- [x] **Step 2: Run code-quality and security review skills**

Use `code-review-and-quality`, the applicable Codex Security diff/standard scan skills, validate every candidate finding, fix confirmed issues with regression tests, and use `superpowers:verification-before-completion` before any readiness claim.

- [x] **Step 3: Run the complete fresh verification matrix**

Run:

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

Expected: every command passes, or the final report names the exact failure and does not claim completion.

- [x] **Step 4: Replace historical status with current evidence**

Update README status, mark this plan complete only for passed tasks, write a new dated security review, and replace the verification report with exact current command outputs, limitations, SMTP/Supabase/Vercel external setup, retention scheduling, and deployment blockers. Do not claim institution SMTP or production retention works without an environment-owned smoke test.

- [x] **Step 5: Record the final file checkpoint**

List created/modified/deleted files and confirm no `.git` operations, push, deployment, real email, or production mutation occurred.

---

## Self-Review Results

- Spec coverage: registration, confirmation, recovery, profile fields, ID upload/review/access/retention, admin decisions, atomic membership, authorization, direct notifications, archival, observability, error handling, RLS, migration, performance, accessibility, and security gates are mapped to Tasks 1–8.
- Placeholder scan: the plan contains no deferred implementation marker or unspecified error/test instruction.
- Type consistency: application states, action result shape, route field names, review command, cleanup response, and database function signatures are consistent across producer/consumer tasks.
