# Security and Privacy Specification

## Security objectives

1. A student cannot view or mutate another student's private borrowing data.
2. Membership and staff permissions cannot be forged through client input.
3. Inventory cannot be overbooked, duplicated, silently lost, or rewritten without attribution.
4. Provider, database, storage, and email secrets never reach the browser or repository.
5. Failure of identity, authorization, database, or external services fails closed for protected actions.
6. Security telemetry is useful without becoming a source of sensitive-data leakage.
7. College-ID documents are accessible only for the approved verification purpose and are deleted after their 30-day post-decision retention.
8. Password authentication resists enumeration, guessing, session abuse, and unsafe recovery.

## Threat model summary

### Protected assets

- Institutional identities and contact information.
- Password-authentication sessions, confirmation/recovery tokens, member applications, and college-ID documents.
- Borrower history and current custody.
- Inventory quantities, condition, location, cost, and photographs.
- Staff roles and policy settings.
- Database/storage/email credentials.
- Audit history, exports, backups, and recovery capability.

### Likely adversaries and failure sources

- An authenticated student attempting cross-user access or staff actions.
- An unauthenticated attacker enumerating accounts, guessing passwords, abusing recovery, or flooding registration.
- A member exploiting workflow races, duplicate requests, stale state, or self-approval.
- A compromised or careless staff account.
- Malicious uploads, remarks, search input, or CSV content.
- Leaked secret or misconfigured preview deployment/RLS/storage policy.
- Dependency or CI supply-chain compromise.
- Provider outage, partial failure, retry storm, or exceptional-state mishandling.

## OWASP Top 10:2025 control matrix

| Risk                                       | Required controls and verification                                                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control                  | Deny-by-default server authorization; RLS per operation; ownership tests; permission matrix; no self-approval; protected storage and exports.                                                 |
| A02 Security Misconfiguration              | Environment isolation; least-privilege grants; secure headers/CSP; no debug output; reviewed defaults; deployment checklist.                                                                  |
| A03 Software Supply Chain Failures         | Lockfile; reviewed dependencies; automated vulnerability checks; provenance-conscious CI; minimal third-party scripts; timely patch process.                                                  |
| A04 Cryptographic Failures                 | TLS; provider-managed encryption; secure cookies; no custom cryptography; secrets in protected configuration; avoid sensitive data in URLs/logs.                                              |
| A05 Injection                              | Parameterized SQL; validated structured input; plain-text/sanitized output; safe filenames; CSV formula neutralization; no shell construction from user data.                                 |
| A06 Insecure Design                        | Threat modeling; state machines; transaction-time invariants; abuse cases; least privilege; privacy review; explicit outage behavior.                                                         |
| A07 Authentication Failures                | Supabase email/password; confirmed institutional email; strong/leaked-password controls; generic responses; rate limits; secure sessions; safe recovery; recent authentication; deactivation. |
| A08 Software or Data Integrity Failures    | Immutable audit/business events; migration review; idempotency; signed/provider-verified callbacks where applicable; trusted deployment pipeline.                                             |
| A09 Security Logging and Alerting Failures | Structured authz/security events; redaction; alerts for repeated denial, role changes, secret/config failures, and integrity violations.                                                      |
| A10 Mishandling of Exceptional Conditions  | Atomic writes; bounded retries; timeouts; global error handling; fail-closed authorization; no false success; tested outage reconciliation.                                                   |

## Authentication and session requirements

- Accept only configured institutional email domains and validate the normalized confirmed email server-side during onboarding and protected actions.
- Use Supabase password hashing, strong-password settings, leaked-password protection where available, email confirmation, and PKCE-compatible SSR flows.
- Use generic signup, login, and recovery responses that do not disclose whether an account exists.
- Rate-limit signup, login, confirmation resend, recovery, and password changes by safe combinations of IP, account, and server-side context.
- Send only authentication confirmation, recovery, and security messages through institution SMTP; never place application data in those messages.
- Use secure, HTTP-only, SameSite cookies as supported by the chosen auth flow.
- Rotate/refresh sessions through supported provider mechanisms.
- Recheck active account, membership, and staff permissions on protected commands.
- Require recent authentication for granting/revoking roles, changing institution domains, or accessing high-risk exports.

## Authorization requirements

- Centralize permission checks by named capability.
- Do not authorize from client-provided role/profile fields.
- Enforce object ownership and current state, not only route access.
- RLS covers direct table/view access; grants are minimal.
- Service-role credentials are server-only and used through narrow modules.
- Security-definer database functions have fixed search paths, narrow execute grants, and dedicated tests.

## Business-logic defenses

- Server-enforced lifecycle transitions reject skipped or repeated states.
- Idempotency keys protect every high-value mutation.
- Transaction locks and constraints prevent concurrent overbooking or negative stock.
- Availability is recomputed at approval and handover.
- Self-approval and self-granted roles are forbidden.
- Admin overrides require explicit reason, audit event, and affected-party notification where relevant.
- Completed records are corrected append-only.
- Rate limits apply to signup, login, confirmation resend, recovery, onboarding, ID upload/resubmission, admin document access, verification decisions, request creation, waitlist actions, exports, and privileged mutations.

## Input, output, upload, and export safety

- Validate all input on the server with bounded lengths, enumerations, quantities, and date ranges.
- Store remarks as plain text unless a reviewed sanitizer is introduced.
- Escape output by default and avoid unsafe HTML rendering.
- Validate image magic bytes, decoded format, dimensions, and size; reject unsupported/polyglot files.
- Generate storage object names; never use a user path directly.
- Re-encode images and strip unnecessary metadata before normal delivery.
- Authorize object reads/writes and use short-lived controlled URLs where appropriate.
- Store college-ID images only in a dedicated private bucket under generated names; never store image bytes in PostgreSQL.
- Permit only the applicant in allowed pre-decision states and membership administrators to access an ID document. Audit every admin access without recording the object URL or contents.
- Delete failed/orphaned uploads and automatically delete final-decision ID objects after 30 days.
- Prefix dangerous CSV cell values so spreadsheet software cannot interpret them as formulas.

## Browser and API defenses

- Restrictive Content Security Policy, frame protection, MIME sniffing protection, referrer policy, and permissions policy.
- CSRF protection appropriate to the cookie/session model, including origin validation for mutations.
- CORS restricted to required origins.
- Bounded request bodies and pagination.
- Generic public errors with correlation IDs; detailed errors remain in redacted server telemetry.

## Secret management

- Secrets live only in protected environment settings or an approved secret manager.
- Separate credentials for local, preview, test, and production environments.
- Preview deployments never use production data or secrets.
- Public/publishable keys are named distinctly from secrets.
- Secret scanning runs before merge; logs and traces redact tokens, cookies, authorization headers, connection strings, and email-provider credentials.
- Rotation procedures cover Supabase, institution SMTP, Vercel, and observability credentials.

## Privacy and retention

- Collect one college-ID image only for membership verification, after confirmed institutional-email ownership and explicit submission.
- Retain the private image while review is active and for 30 days after approval or rejection, then delete it automatically. Preserve only non-image decision metadata and audit events.
- Exclude college-ID images and contents from logs, traces, notifications, exports, analytics, demo data, and long-lived application backups. Provider backup retention must be documented and bounded.
- Phone is optional, used only as restricted contact information, and not used for messaging in the initial release.
- Do not expose borrower identity in catalog availability.
- Do not expose internal remarks, cost, or precise storage location to students/members.
- Collect only necessary profile fields.
- Deactivation removes operational access without destroying required history.
- Retention/deletion actions must preserve legal/operational audit needs while minimizing inactive personal data.
- Export creation and download are authorized and audited.

## Assurance workflow

- CI runs dependency, secret, static, type, test, migration, RLS, and authorization checks.
- Review security-sensitive diffs with the threat model and Trail of Bits sharp-edges guidance.
- Run Deepsec selectively before the first production release and after substantial authentication, authorization, upload, export, or business-logic changes.
- Validate scanner findings manually, fix confirmed issues, and add regression tests.
- No unresolved critical/high issue proceeds to release without an explicit owner, rationale, compensating controls, expiry date, and administrator acceptance.

## Incident response

1. Detect and preserve evidence without logging additional secrets.
2. Contain: maintenance mode, revoke sessions/roles/keys, or disable affected integration.
3. Assess affected users, records, time window, and inventory integrity.
4. Eradicate and patch with regression evidence.
5. Restore from a verified state and reconcile queued/manual actions.
6. Notify affected stakeholders according to institution policy.
7. Document root cause and preventive changes.

## Primary references

- [OWASP Top 10:2025](https://owasp.org/Top10/)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase private storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Deepsec](https://github.com/vercel-labs/deepsec)
- [Trail of Bits skills](https://github.com/trailofbits/skills)
