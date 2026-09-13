# ADR 0004: Skip Email Confirmation for Registration

**Status:** Accepted
**Date:** 2026-09-13

## Context

ADR 0003 required students to confirm control of their institutional email address (via a Supabase Auth confirmation link) before onboarding could begin, and explicitly rejected skipping this step because it would let an applicant claim another student's address.

In production, Supabase Auth's confirmation email is sent through a Resend-backed SMTP relay whose configured sending domain (`iiitp.ac.in`) was never verified with Resend. Every signup attempt failed outright (`/signup` returned 500 with "domain is not verified") before an account could even be created. Verifying that domain requires DNS records on the institution's domain, which is outside this application's and this team's direct control and has no fixed timeline. Email confirmation as designed was therefore not just degraded but completely non-functional, blocking all new account creation.

## Decision

- Create accounts pre-confirmed via the Supabase service-role admin API (`auth.admin.createUser({ email_confirm: true })`) instead of the anonymous `auth.signUp()` call. No confirmation email is sent, and no email-delivery dependency exists in the registration path.
- Keep the institutional-domain allowlist check on the submitted email (unchanged from ADR 0003) as a cheap first filter.
- Rely entirely on mandatory admin review of the uploaded college-ID image to establish student identity, since email ownership is no longer confirmed.
- Drop the `awaiting_email_confirmation` state from the member application lifecycle; it now starts directly at `incomplete`.
- `signUpAction` continues to return a single generic acknowledgement regardless of outcome and never establishes a session itself, preserving the existing account-enumeration-safe behavior: the applicant takes an explicit, separate sign-in step afterward, and the existing proxy/middleware redirect (unchanged) routes a newly confirmed, incomplete applicant into `/onboarding`.

## Consequences

- The risk ADR 0003 flagged is now real and accepted: an applicant can submit an application under an institutional-looking email address they do not actually control. This must be caught, if at all, by the admin reviewing the college-ID image against the claimed identity during manual approval — the admin review step is now the *only* identity check.
- Registration no longer depends on institution SMTP/Resend domain verification at all. Auth confirmation and password recovery messages (if ever re-enabled) are unaffected by this change and remain a separate concern.
- If the institution later verifies its Resend sending domain and wants email-confirmed registration back, that is a reversal of this ADR, not a config toggle — it would need to restore the `auth.signUp()` + confirmation-link path this ADR removes.

## References

- [Supabase Admin API: createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [ADR 0003](0003-password-registration-and-in-app-notifications.md)
