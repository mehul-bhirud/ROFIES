# Production Release Notes

## Status

As of 2026-08-31, the repository is locally deployable after the production Supabase and Vercel environment is configured. The local database used by tests is Supabase's Docker PostgreSQL instance only; production must use the hosted Supabase project.

Do not run `supabase/seed.sql` against production. Seed data is fictional local/test data only.

## Required Production Configuration

- Apply all files in `supabase/migrations/` to the hosted Supabase project.
- Set `ROFIES_ENVIRONMENT=production`.
- Set `ROFIES_DEMO_MODE=false`.
- Set `ROFIES_APP_ORIGIN` to the HTTPS production origin.
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the production Supabase project.
- Set `SUPABASE_SERVICE_ROLE_KEY` only in server-side Vercel environment variables.
- Set a strong `CRON_SECRET` only in server-side Vercel environment variables.
- Configure Supabase Auth email/password with institution SMTP, email confirmation, site URL, allowed redirect URLs, and password protections.
- Keep `college-ids` and `equipment-photos` storage buckets private.
- Schedule `POST /api/jobs/retention` with `Authorization: Bearer <CRON_SECRET>`.
- Configure backups, storage retention expectations, and alert destinations before admitting real users.

## Access Roles

### Signed-Out Visitor

1. Opens the production URL.
2. Can access sign-in, sign-up, password recovery, auth confirmation/error pages, and offline/static assets.
3. Cannot access catalog, requests, notifications, contacts, or staff pages.
4. Protected pages redirect to sign-in.

### Student Applicant

1. Signs up with an allowed institutional email and password.
2. Confirms email through Supabase Auth.
3. Completes onboarding profile fields.
4. Uploads a college-ID image.
5. The server validates, re-encodes, strips metadata, stores the processed image privately, and submits the application.
6. Applicant waits on the pending page.
7. If changes are requested, the applicant returns to onboarding and submits a replacement document.
8. If rejected, access remains blocked except for the status surface.
9. If approved, membership becomes active and the user enters the member journey.

### Approved Member

1. Opens the catalog.
2. Searches/filter equipment and views item detail pages.
3. Creates bounded borrowing requests with purpose, project, dates, team members, quantities, and remarks.
4. Views own requests, loans, returns, waitlist state, notifications, and member-visible contacts.
5. Can request extensions for own eligible loan lines.
6. Cannot see other borrowers' identities, internal remarks, precise storage locations, cost, privileged audit data, or college-ID images after the allowed review lifecycle.

### Request Approver

1. Enters the staff workspace.
2. Reviews submitted or under-review requests.
3. Approves, adjusts, or rejects request lines with a reason.
4. Cannot approve their own request.
5. Approval recalculates availability in the database transaction and refuses overbooking.
6. May review waitlist/relevant request context, but does not receive inventory-management or membership-document access unless separately granted.

### Inventory Manager

1. Enters the staff workspace.
2. Manages catalog/inventory surfaces and equipment photos.
3. Confirms handovers for ready reservations.
4. Records full or partial returns with incoming condition.
5. Records counter issues, loss/write-off handling, repair routing, stock adjustments, and reconciliation workflows.
6. Can read operational inventory/location details required for custody and stock work.
7. Does not receive membership-document access unless `membership:manage` is separately granted.

### Circulation Handover Staff

1. Opens the handover queue.
2. Confirms in-person identity and custody transfer for approved reservations.
3. Sets/records due dates and handover remarks.
4. Cannot manage unrelated inventory settings unless separately granted.

### Circulation Return Staff

1. Opens the returns queue.
2. Records returned quantities and conditions.
3. Handles partial returns and unresolved quantities according to policy.
4. Cannot manage unrelated inventory settings unless separately granted.

### Membership Manager

1. Opens member approvals.
2. Reviews pending member applications.
3. Views college-ID documents only through the controlled server route.
4. Every admin document access is audit logged.
5. Approves, rejects, or requests changes with a reason.
6. Approval atomically activates membership.
7. Final approval/rejection schedules college-ID image deletion for 30 days after decision.

### Roles Manager

1. Grants or revokes staff capabilities through the controlled admin workflow.
2. Requires recent authentication by policy.
3. Cannot grant permissions by client-provided role fields.
4. Role state is stored in `public.role_assignments`; active grants are capability rows with `revoked_at is null`.

### Report/Audit/System Administrator

1. `reports:export` can export authorized inventory reports.
2. `audit:read` can inspect privileged audit history.
3. `system:manage` can view operational health, notices, policy/system surfaces, and retention status.
4. High-risk actions require recent authentication by policy.
5. These roles must be granted only to trusted production administrators.

## Password and Access Storage

Application tables do not store plaintext passwords. Supabase Auth owns password storage in `auth.users.encrypted_password`, which is provider-managed hashed password data. Application access is controlled separately through membership state and `public.role_assignments`.

## Post-Deploy Smoke

After deployment, test these with real production configuration:

1. Sign up with an institutional email and confirm it.
2. Submit onboarding with a small valid college-ID image.
3. Approve that application as a membership manager.
4. Submit a borrowing request as the approved member.
5. Approve it as a request approver.
6. Confirm handover as circulation/inventory staff.
7. Record a return.
8. Confirm private college-ID access is audited and no document URL is exposed.
9. Confirm `/api/jobs/retention` returns 404 without the secret and succeeds with the scheduler secret.
10. Confirm production has no demo/sample users unless deliberately created through real signup.
