# Password Registration and College-ID Verification Design

**Status:** Approved  
**Date:** 2026-08-08

## Objective

Replace Google Workspace OAuth with confirmed institutional email/password registration plus admin college-ID verification. Remove Resend and all application-event email, retaining direct in-app notifications. Authentication confirmation and recovery email remains through Supabase Auth and institution SMTP.

## Registration flow

1. Student signs up with an allowed institutional email and strong password.
2. Supabase Auth sends a confirmation email through institution SMTP.
3. After confirmation, the student enters full name, student ID, department, academic year, optional phone, and uploads one college-ID image.
4. The server validates, decodes, re-encodes, strips metadata, and stores the image under a generated name in a dedicated private bucket.
5. The applicant submits the application and remains limited to onboarding/status/recovery/sign-out experiences.
6. A membership administrator views the document through authorized short-lived access and selects **Verify and activate member**, **Request changes**, or **Reject**.
7. Approval atomically records the decision and activates membership. Changes requests allow replacement/resubmission. Approval or rejection starts a 30-day document-retention clock.
8. A scheduled cleanup deletes expired objects and preserves non-image metadata and audit history.

## Access and privacy

- Only the applicant in allowed pre-decision states and membership administrators can access the private document.
- Inventory managers and equipment approvers do not gain document access through their unrelated roles.
- Admin views and decisions are audited without document bytes or URLs.
- ID images never appear in notifications, exports, logs, traces, seed data, or PostgreSQL byte columns.
- Generic auth responses, rate limits, password controls, recent authentication, and server-side domain checks protect the workflow.

## Notifications

Business commands write deduplicated in-app notifications in their own transaction. There is no application email provider, notification worker, delivery retry queue, or email-delivery table. Admin dashboards remain the authoritative work queues. Read notifications archive after 180 days.

## Failure behavior

- SMTP outage delays confirmation/recovery only.
- A failed upload or processing operation creates no submitted application.
- If Storage succeeds and metadata registration fails, the server deletes the orphaned object.
- If approval fails, membership and decision remain unchanged.
- If document deletion fails, the cleanup job records/retries the failure and alerts administrators without deleting audit metadata.

## Verification

Cover signup, confirmation, login, recovery, password update, domain denial, enumeration resistance, all application states, admin approval, changes/resubmission, rejection, document RLS, malicious uploads, access audits, 30-day cleanup, membership activation atomicity, direct notification deduplication, and absence of Google OAuth/Resend runtime paths.
