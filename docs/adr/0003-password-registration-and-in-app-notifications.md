# ADR 0003: Password Registration, College-ID Verification, and In-App Notifications

**Status:** Accepted  
**Date:** 2026-08-08

## Context

The original release candidate used Google Workspace OAuth for identity and a Resend-compatible outbox for application-event email. The product owner chose a simpler club-controlled verification flow: students enter their details, prove control of an institutional email, upload a college-ID image, and receive an admin decision. Application notifications should remain entirely inside the app.

College-ID images are sensitive identity documents. They require private access, purpose limitation, access auditing, and short retention. Supabase Auth confirmation and password recovery still require email delivery in production, but those authentication messages are separate from application-event notifications.

## Decision

- Use Supabase Auth institutional email/password signup and login.
- Require email confirmation before onboarding submission and use institution SMTP only for Auth confirmation, recovery, and security messages.
- Collect full name, student ID, department, academic year, optional phone, and one college-ID image.
- Decode, validate, re-encode, and strip metadata from the image; store it in a dedicated private Supabase Storage bucket. PostgreSQL stores metadata/object reference only.
- Use the lifecycle `awaiting_email_confirmation → incomplete → pending_review → approved | changes_requested | rejected`.
- Make **Verify and activate member** one atomic membership-admin command.
- Audit every membership-admin document access and decision without storing document content or access URLs.
- Delete the private object 30 days after approval or rejection while retaining non-image decision and audit metadata.
- Create application notifications directly, idempotently, and transactionally in PostgreSQL. Remove the notification outbox, email-delivery records, Resend worker, Resend environment configuration, and application-event email.
- Archive read in-app notifications after 180 days; preserve unread/security-relevant records according to policy.

## Alternatives considered

### Email magic links or OTP for every login

This removes passwords but makes every login dependent on SMTP and creates more email traffic. It conflicts with the goal of minimizing email dependence.

### Local credentials without email confirmation

This avoids SMTP but permits applicants to claim another student's address and makes recovery an ongoing manual admin task.

### PostgreSQL image blobs

Storing document bytes in ordinary relational rows complicates access, delivery, database backups, and deletion. A private Storage bucket with RLS and database metadata provides a clearer security and retention boundary.

## Consequences

- The club must configure reliable institution SMTP for production confirmation and password recovery.
- Registration and recovery are degraded during SMTP outages; existing authenticated application operations remain independent.
- Membership administrators handle a new sensitive-document workflow and need narrowly scoped access.
- ID-document storage/backups and the deletion job require monitoring and retention verification.
- Existing Google OAuth and Resend code, configuration, migrations, tests, and documentation must be removed or superseded through versioned migrations.
- Authentication, upload, RLS, privacy, cleanup, and application-notification tests must be rewritten and expanded.

## References

- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration)
- [Supabase private storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
