# Operations, Reliability, and Observability

## Service behavior

- Protected writes require healthy authentication, authorization, application, and database paths.
- The system fails closed when identity or permission checks are unavailable.
- A write is successful only after the authoritative transaction commits.
- Safe catalog content may be cached for read-only degraded use and must display a stale-data warning.
- Institution SMTP failure may delay signup confirmation or password recovery but cannot affect already-authenticated application business transactions.

## Error model

- Validation errors identify correctable fields.
- Conflict errors return refreshed state/availability where safe.
- Authorization errors disclose no inaccessible-record details.
- Unexpected errors return a user-safe message and correlation ID.
- Logs include the correlation/trace ID and redacted technical context.
- Idempotent commands allow a client to retry ambiguous network failures safely.

## Logs

Use structured logs with timestamp, severity, environment, service/module, event name, request/trace ID, route/command, duration, outcome, and safe entity identifiers.

Never log passwords, confirmation/recovery tokens, college-ID content or object URLs, cookies, authorization headers, database URLs, provider secrets, full authentication email bodies, or unrestricted personal fields.

Separate diagnostic logs from immutable business audit events.

Retention jobs log only counts, durations, outcomes, and safe opaque document IDs. They must not log applicant names, student identifiers, phone numbers, institutional emails, college-ID object names, signed URLs, authorization headers, or provider credentials.

## Metrics

### Technical

- Request volume, latency percentiles, error rate, and timeout rate.
- Database query latency, slow queries, connection pressure, lock waits, and transaction failures.
- Authentication confirmation/recovery request outcomes, SMTP failures, login failures, permission denials, and rate-limit counts without account-enumerating labels.
- Registration state counts, college-ID processing failures, ID-retention cleanup backlog/age, and private-object deletion failures.
- Image processing failures and storage errors.

### Business integrity

- Pending approval age and count.
- Ready-for-pickup and expiring reservation counts.
- Due/overdue loan count and age.
- Stock-integrity check failures.
- Reservation conflicts and admin overrides.
- Repair queue age and low-stock items.
- Unresolved outage reconciliations.

Do not use business metrics to create public student rankings or automated penalties.

## Tracing

Instrument end-to-end traces for signup continuation, onboarding submission, admin verification, ID cleanup, catalog search, request submission, approval/reservation, handover, return, extension, waitlist claim, and export creation.

Custom spans should expose duration and safe identifiers without raw request bodies or personal remarks.

## Alerts

Alert administrators on sustained server error rate, database unavailability, repeated migration/job failures, overdue ID-document deletion, repeated authorization denials, unusual authentication failures, stock-integrity violation, backup failure, and unresolved reconciliation work.

Avoid one-alert-per-event floods. Use thresholds, grouping, deduplication, and recovery notifications.

## Health and admin operations view

Show current application/database state, authentication-email health, last successful ID cleanup, overdue retention count, last integrity check, maintenance mode, active system notice, backup status, and unresolved reconciliations. Do not expose addresses, document paths, provider secrets, or internal stack traces.

The operations view reports in-app notification backlog, archive lag, overdue college-ID deletion count, oldest overdue deletion age, last successful retention cleanup, and 24-hour deletion failure count. These are aggregate operational signals only.

## Retention cleanup runbook

`POST /api/jobs/retention` is invoked by the scheduler with `Authorization: Bearer <CRON_SECRET>`. Missing or incorrect secrets return a generic 404. The job claims at most 100 due college-ID metadata rows, deletes each private `college-ids` storage object, marks metadata deleted only after storage deletion succeeds, releases failed claims for retry, archives read notifications older than 180 days, and returns only `{ collegeIdsDeleted, notificationsArchived, failures }`.

If storage deletion fails, operators should:

1. Check the aggregate retention failure count and logs using the job correlation time, not document paths.
2. Re-run the retention job after the storage provider recovers.
3. For persistent database/storage disagreement, verify whether the object still exists in the private bucket using provider tooling, then either delete the object and re-run the job or record a reconciliation note if metadata points to an already-absent object.
4. Prove the 30-day requirement with aggregate evidence: final decision timestamp, deletion due timestamp, deletion job timestamp, provider deletion confirmation, and the metadata `deleted_at` timestamp. Do not copy college-ID images into tickets or long-lived logs.

## Backup and recovery

- Enable automated database backups.
- Initial recovery-point objective: at most 24 hours of database data loss.
- Initial recovery-time objective: restore essential operations within four hours.
- Prefer point-in-time recovery when the selected budget supports it.
- Back up/retain object-storage photos according to provider capabilities and club retention policy; database backup alone is not assumed to cover storage objects.
- College-ID objects use a separate retention class. Restore procedures must not re-expose an ID object whose 30-day live retention has expired; provider backup expiry must be documented and bounded.
- Backup exercises verify member-application decisions and college-ID document metadata, but they deliberately do not require expired college-ID object bytes to remain recoverable.
- Test restoration periodically into an isolated environment.
- Record evidence: restore start/end, recovered version/time, integrity checks, missing objects, and follow-up actions.

## Deployment and migration safety

- Run automated checks and clean-database migrations before deployment.
- Prefer additive expand/migrate/contract changes.
- Back up before risky production migrations.
- Enable maintenance mode for incompatible or high-risk work.
- Validate authentication, catalog read, request read, and one safe operational smoke test after deployment.
- Roll back application code only when compatible with the current database; otherwise use a forward-fix migration.

## Emergency manual log

When the service is unavailable and club operations cannot wait, an authorized inventory manager records on paper or an approved offline form:

- Borrower name and institutional email.
- Actual event date/time.
- Catalog items and quantities/assets.
- Outgoing or incoming condition.
- Due date for handovers.
- Handling staff name.
- Reason the emergency procedure was used.
- Signatures/acknowledgement if club policy requires them outside the application.

No emergency action may bypass the normal physical identity check. Staff should avoid handover if identity, membership, existing overdue status, or stock cannot be established with reasonable confidence.

After restoration, an inventory manager enters the event using reconciliation mode with the original event time and manual-log reference. A second authorized staff member reviews high-impact or conflicting reconciliations. The app records entry time separately and never backdates the audit timestamp.

## Incident runbooks

Maintain concise runbooks for database outage, Supabase Auth outage, institution SMTP outage, leaked secret, compromised account/admin, bad migration, college-ID exposure or cleanup failure, storage/upload incident, stock inconsistency, and suspected unauthorized access.

## Primary references

- [Vercel Observability](https://vercel.com/docs/observability)
- [Vercel tracing](https://vercel.com/docs/tracing)
- [Supabase database monitoring](https://supabase.com/docs/guides/database/inspect)
- [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations)
