# Data Model and Database Standards

## Purpose

Define the relational shape and integrity intent. Names are normative enough to guide implementation but may be refined by a migration-backed ADR without changing domain meaning.

## Entity groups

### Identity and access

- `profiles`: application profile keyed to the Supabase Auth user ID; normalized institutional email, display name, student identifier, department, academic year, optional phone, active flag, and onboarding completeness.
- `member_applications`: applicant, lifecycle state, submission/decision timestamps, deciding administrator, reason, version, and idempotency metadata.
- `college_id_documents`: application/owner, private bucket/object reference, processed media metadata, checksum, upload time, retention deadline, deletion time, and replacement linkage. Image bytes are not stored in PostgreSQL.
- `memberships`: member status, activation actor/time, suspension/former metadata, and reason. Application approval and membership activation occur atomically.
- `role_assignments`: user, permission role, granting admin, grant/revoke timestamps.
- `password_reset_requests`: normalized institutional email, request status, request timestamp, processing administrator, processing timestamp, and bounded verification note. No password, password hash, recovery token, or temporary password is stored.

Institutional email is normalized and uniquely indexed. Authorization must not rely on editable profile fields. A submitted application requires a confirmed Supabase Auth email and a current processed college-ID document.

### Catalog and inventory

- `categories`: hierarchy, name, description, and defaults.
- `catalog_items`: identity, tracking mode, return policy, description, public/internal remarks, archive state, loan-policy override, low-stock threshold, and search document.
- `catalog_aliases`, `catalog_tags`, `catalog_specifications`: normalized searchable metadata.
- `item_photos`: storage object reference, caption, ordering, processing status, and optional individual-asset link.
- `storage_locations`: admin-only room/cabinet/shelf/bin hierarchy.
- `pool_balances`: catalog item, location, condition, and on-hand quantity.
- `individual_assets`: catalog item, optional local identifier/manufacturer serial, condition, custody/maintenance/archive state, location, and remarks.
- `stock_adjustments`: append-only quantity/condition/location movement with reason, actor, source, and optional correction link.
- `maintenance_events`: item/asset, condition transition, action, remarks, actor, and timestamps.

For pooled stock, balances are projections backed by immutable adjustment/circulation events and protected by reconciliation checks.

### Requests and reservations

- `requests`: borrower, status, purpose, project/event, requested period, team context, timestamps, and version.
- `request_lines`: request, catalog item, requested quantity, member remarks, and tracking expectations.
- `request_line_decisions`: append-only approver decision, approved quantity/period, reason, actor, and timestamp.
- `reservations`: borrower/request, status, period, pickup deadline, cancellation/expiry metadata.
- `reservation_lines`: reservation, request line, approved quantity, optional individual asset, and unresolved allocation.
- `waitlist_entries`: member, catalog item, quantity, desired period, join time, eligibility state.
- `waitlist_claims`: entry, offered period/quantity, expiry, and claimed/expired state.

### Loans and returns

- `loans`: borrower, source request/reservation or counter issue, handler, handover time, status, and remarks.
- `loan_lines`: loan, catalog item, optional individual asset, issued quantity, due time, unresolved quantity, outgoing condition, and version.
- `extension_requests`: loan line, proposed due time, member reason, decision, approver, decision reason, and timestamps.
- `return_events`: loan, receiving inventory manager, actual return time, reconciliation link, and remarks.
- `return_lines`: return event, loan line, quantity, incoming condition, destination location, and maintenance routing.
- `loss_resolutions`: loan line, quantity/asset, lost or written-off resolution, reason, actor, and timestamp.
- `outage_reconciliations`: manual-log reference, event time, entry time, entering admin, reason, and review state.

### Communication and administration

- `notifications`: recipient, event type, title/body data, read state, related entity, unique deduplication key, and archival timestamp. Command functions create application notifications directly and idempotently.
- `contacts`: type, name, role, institutional email, optional phone, visibility, availability, ordering, and active state.
- `policy_definitions` and `policy_values`: validated global/category/item settings with effective dates and changing admin.
- `system_notices`: severity, audience, display interval, and active state.
- `audit_events`: immutable actor, action, target, time, request/trace ID, reason, and redacted before/after summary.

## Required constraints

- Quantity fields are integers greater than zero for request/issue/return lines and non-negative for balances.
- Approved quantity cannot exceed requested quantity.
- Returned/resolved quantity cannot exceed issued quantity.
- Reservation/loan end or due time must be after its start/handover time.
- Individual assets cannot be simultaneously assigned to overlapping active reservations or loans.
- Role values and lifecycle states use constrained enums/checks or reference tables, not arbitrary text.
- Used records are protected from hard deletion by foreign keys and application/database policy.
- Audit events cannot be updated or deleted by application roles.
- Every mutation record includes actor and server-generated timestamp.
- Only a confirmed institutional email owner may submit an application.
- At most one current college-ID document exists per application; replacement requires an incomplete or changes-requested state.
- Application approval atomically records the decision, activates membership, and creates required notifications.
- Final approval/rejection sets a retention deadline exactly 30 days after the decision. Object deletion preserves document metadata, decision, and audit references.
- Application roles cannot update or delete audit events documenting ID access and decisions.

## Availability transaction

For pooled availability, evaluate every relevant boundary within the requested interval: current handover/return state, active-loan due times, and reservation start/end times. At each boundary, begin with active usable inventory, subtract loan obligations that have not yet ended, and subtract approved reservation allocations that overlap that moment. The minimum remaining quantity across the requested interval is the expected capacity available for a new reservation.

A due date ends expected loan unavailability for planning purposes, but the UI labels that capacity as expected until the physical return is confirmed. Current handover availability uses confirmed on-hand usable quantity only. The authoritative approval function locks the relevant catalog item, recalculates all overlapping allocations, and rejects any approval that exceeds capacity. Handovers revalidate current on-hand usable quantity.

The exact SQL representation may use projections/materialized aggregates for performance, but the immutable reservation, circulation, and adjustment records remain authoritative.

## RLS intent

| Data                                 | Student                    | Approved member                | Staff with permission             |
| ------------------------------------ | -------------------------- | ------------------------------ | --------------------------------- |
| Public catalog/availability/contacts | Read                       | Read                           | Read/manage as authorized         |
| Own profile                          | Read/update allowed fields | Same                           | Limited support/admin access      |
| Own member application               | Read/update while allowed  | Read historical decision       | Membership admin manages/reviews  |
| College-ID document                  | Own pending/current only   | No access after retention      | Membership admin, audited access  |
| Membership                           | Read own                   | Read own                       | Manage with admin permission      |
| Requests/loans/returns               | None for others            | Read/write own allowed actions | Read/manage for assigned function |
| Borrower identity                    | Own only                   | Own only                       | Operational need only             |
| Internal remarks/location/cost       | None                       | None                           | Authorized staff only             |
| Roles/policies/audit                 | None                       | None                           | Authorized admin/audit access     |
| Notifications                        | Own read/mark-read only    | Own read/mark-read only        | Own plus authorized system views  |

RLS policies are explicit per operation. Absence of a policy means denial. Views exposed to authenticated users must preserve RLS behavior. Security-definer functions are exceptional, narrowly granted, fixed-search-path, reviewed, and tested.

## Indexing plan

At minimum, evaluate and test indexes for:

- Normalized institutional email and auth user ID.
- Membership status and role assignments by user.
- Member applications by state/submission time and college-ID documents by owner/retention deadline/deletion state.
- Catalog category/archive/tracking mode; GIN/trigram indexes for search document, names, aliases, tags, and specs.
- Pool balance by catalog item, condition, and location.
- Requests by borrower/status/created time and pending-review status.
- Reservations by catalog item/status/start/end and pickup deadline.
- Loans by borrower/status/due time; partial indexes for active/overdue obligations.
- Waitlist by catalog item, eligibility, desired dates, and join time.
- Notifications by recipient/read/archive time and unique deduplication key.
- Audit events by actor/action/target/time.

Indexes must follow observed query patterns. Use `EXPLAIN (ANALYZE, BUFFERS)` in safe test environments, avoid over-indexing, and retain performance evidence for non-obvious indexes.

## Migration standards

- Every database change is a reviewed, versioned migration.
- Migrations include schema, constraint, index, grant, function, trigger, RLS, and data-backfill changes.
- Test from an empty database and from a production-like prior schema.
- Prefer additive, backward-compatible expand/migrate/contract changes.
- Long locks and large backfills require an explicit rollout and recovery plan.
- Remote production schema editing is prohibited.
- Seed data contains fictional users and inventory only.
