# Test Strategy

## Principles

- Test behavior at the lowest reliable layer, then protect critical journeys end to end.
- Treat authorization, inventory integrity, concurrency, privacy, migrations, and failure handling as primary product behavior.
- Use deterministic clocks and fictional seeded identities/inventory.
- Every confirmed security or integrity defect receives a regression test.

## Test layers

### Unit

- Date-range overlap and availability calculations.
- Loan duration/quantity policy resolution.
- State-transition guards.
- Condition and stock arithmetic.
- Waitlist ordering and claim expiry.
- Reminder schedule calculation.
- Registration-state transitions, 30-day retention timing, and direct notification deduplication.
- CSV neutralization and safe error mapping.

### Database

- Clean migration application and upgrade from prior schema snapshots.
- Check/foreign-key/unique/exclusion constraints.
- Non-negative stock and append-only audit protections.
- RLS and grants for each operation and role.
- Security-definer function permissions and search path.
- Index presence and representative query plans.
- Member-application/college-ID constraints, direct notification idempotency, document-access audit immutability, and retention cleanup.

### Integration

- Email/password signup, confirmation, login, logout, recovery, password update, institutional-domain denial, and account-enumeration-safe responses.
- Profile/college-ID onboarding, pending access restrictions, admin document access, approval with atomic membership activation, change request/resubmission, rejection, suspension, and deactivation.
- Full and partial approval.
- Reservation creation, expiry, cancellation, and conflict.
- Handover, counter issue, partial return, repair routing, extension, loss/write-off, and reconciliation.
- Direct transactional in-app notification creation, deduplication, read-all, and archival behavior.
- Equipment and college-ID upload validation/processing, cross-user denial, audited admin access, orphan cleanup, and controlled read access.
- Reports and exports with authorization and CSV injection defense.

### Concurrency

- Two approvers competing for the last pooled quantity.
- Approval racing with cancellation or expiry.
- Two handovers consuming the same reservation.
- Return racing with extension or write-off.
- Duplicate browser submission and network retry.
- Waitlist claim racing with another claim or new reservation.

The expected result is one valid commit, deterministic conflict responses for losers, no negative stock, and no duplicate business event.

### Authorization and privacy

For every protected query/command, test:

- Signed out.
- Authenticated non-member.
- Approved member acting on own record.
- Approved member acting on another member's record.
- Inventory manager, approver, and administrator individually.
- Staff user missing one required permission.
- Deactivated/suspended user.
- Applicant in awaiting-confirmation, incomplete, pending-review, changes-requested, and rejected states.
- Inventory/approver staff attempting membership-document access without the membership-admin capability.
- Direct server request with hidden UI bypassed.
- Stale session/role changed after page load.

Verify that borrower identity, internal remarks, cost, storage location, audit events, and provider data do not leak through primary responses, errors, search, exports, image URLs, or telemetry.

### End to end

Critical desktop and mobile journeys:

1. Student registers, confirms institutional email, completes profile/ID onboarding, and remains isolated from catalog/borrowing while pending.
2. Membership admin reviews the private document and verifies/activates the member; the member then creates a multi-item request.
3. Approver partially approves without self-approval.
4. Reservation becomes ready; inventory manager confirms physical handover.
5. Member requests extension; conflict behavior is correct.
6. Inventory manager records a partial return with mixed condition, then completes it.
7. Waitlist claim flows after cancellation/early return.
8. Changes-requested/resubmission and rejection paths preserve privacy and create in-app notifications.
9. The 30-day cleanup deletes the private object but preserves decision/access audit metadata.
10. Outage event is reconciled with separate actual and audit times.

### Accessibility and responsive behavior

- Automated accessibility scans on representative pages.
- Keyboard-only completion of sign-in continuation, search, request, approval, handover, and return.
- Visible focus, associated labels/errors, status announcements, and non-color status cues.
- Manual mobile checks at narrow widths and touch-target review.

### Operational and recovery

- Maintenance mode blocks mutations and preserves safe reads.
- Backup restoration into isolation followed by integrity checks.
- ID-retention cleanup delay/retry and alert behavior.
- Institution SMTP outage behavior for confirmation/recovery and storage provider timeout/malformed response handling.
- Log/trace redaction tests.
- Post-deploy smoke tests.

## Security assurance

- Dependency and secret scanning on every change.
- Static/type/lint checks on every change.
- Threat-model review for auth, RLS, uploads, exports, and lifecycle changes.
- OWASP 2025 checklist before pilot and general release.
- Sharp-edges review before major release.
- Selective Deepsec scan before first production release and after substantial security-sensitive changes.

Scanner output is a lead, not proof. Validate exploitability, fix confirmed findings, and retain regression evidence.

## Performance verification

- Seed production-scale data: 2,000 users, 300 active members, 2,000 inventory units plus realistic requests/audit history.
- Measure catalog search, date availability, admin dashboard, pending approvals, borrower history, and overdue queries.
- Check N+1 behavior and query counts.
- Use query plans for slow/high-frequency queries and verify intended indexes.
- Exercise concurrent approval/handover load rather than relying only on single-user latency.

## Release gates

- Required migrations pass clean and upgrade tests.
- Unit, database, integration, authorization, and critical end-to-end suites pass.
- No unexplained stock-integrity discrepancy.
- No unresolved critical/high security finding without the documented exception process.
- Error, audit, metrics, and traces exist for new critical workflows.
- Backup restoration and emergency reconciliation are exercised before general release.
- Pilot-blocking accessibility or usability defects are resolved.
- Runtime/configuration scans find no Google OAuth or Resend integration and no application-event email path.
- Supabase lint may report third-party pgTAP `extensions` schema noise, but any app/private/public schema finding is release-blocking until fixed or explicitly documented.

## Definition of done for a feature

A feature is complete only when requirements, authorization, validation, transaction/concurrency behavior, errors, audit events, telemetry, migrations, tests, documentation, and responsive/accessibility behavior are complete in proportion to its risk.
