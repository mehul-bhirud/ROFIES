# Domain Model

## Purpose

Define the vocabulary and invariants used by product requirements, code, database schema, tests, logs, and user-facing text.

## People and access

- **Student applicant:** a user with a confirmed institutional email/password account whose profile and college-ID verification is incomplete, pending, changes-requested, or rejected.
- **Member:** a student whose club membership is active and approved.
- **Borrower of record:** the single member accountable for a request and resulting loan, even when a team uses the equipment.
- **Inventory manager:** staff permission for catalog, stock, handover, return, repair, and reconciliation actions.
- **Approver:** staff permission for request, reservation, and extension decisions.
- **Administrator:** staff permission for membership, role, policy, contact, audit, and system administration.
- **Staff:** any user holding at least one privileged permission. Staff permissions are composable.

Email/password authentication and email confirmation establish account control. Admin review of the college ID establishes student identity and simultaneously activates membership. Staff permissions answer which privileged operations a member may perform.

## Registration concepts

- **Member application:** the applicant's submitted profile and verification lifecycle.
- **College-ID document:** a processed private Storage object used only for membership verification.
- **Verification decision:** an administrator's approval, changes request, or rejection with actor, reason, and timestamp.
- **Final decision:** approval or rejection; it starts the 30-day document-retention clock.
- **Document access event:** append-only evidence that an authorized actor viewed or attempted to view an ID document, without storing its contents or signed URL.

## Inventory concepts

- **Catalog item:** the searchable definition of a kind of equipment or consumable.
- **Pooled reusable:** interchangeable physical units tracked by quantity, not identity.
- **Individual asset:** a unique physical unit tracked separately when useful.
- **Consumable:** inventory deducted permanently at issue and not returned.
- **Usable inventory:** active physical units in Perfect or Minor damage but usable condition, whether currently on hand or temporarily loaned. Availability separately accounts for custody and reservations.
- **Condition:** physical quality of stock or an asset.
- **Availability:** whether usable stock can satisfy a quantity over a time range.
- **Stock adjustment:** append-only correction or operational change to a quantity, with reason and actor.
- **Archive:** removal from new operational use while preserving history.

### Condition values

- **Perfect:** fully functional with no known material issue.
- **Minor damage but usable:** functional with a documented defect that does not prevent approved use.
- **Repair required:** unavailable until inspected/repaired and returned to a usable condition.
- **Not working/showpiece:** nonfunctional and visible for reference/display only.

Condition does not encode custody. An item may be perfect and issued, or damaged and on hand.

## Request and circulation concepts

- **Request:** a member's proposed set of item quantities, dates, purpose, and optional team context.
- **Request line:** one catalog item and requested quantity within a request.
- **Decision:** an approver's per-line approval, reduced approval, rejection, or change request.
- **Reservation:** an approved allocation of usable stock for a defined date range.
- **Ready for pickup:** a reservation whose pickup window is active.
- **Handover:** the in-person, staff-confirmed event that transfers physical custody.
- **Loan:** the active return obligation created by handover.
- **Loan line:** an issued returnable quantity or individual asset, its due date, and remaining obligation.
- **Return:** an in-person, staff-confirmed event reducing an active obligation.
- **Partial return:** a return that leaves some issued quantity unresolved.
- **Extension:** an approved change to a loan's due date.
- **Overdue:** a derived state in which unresolved returnable quantity is past its due time.
- **Waitlist entry:** a member's interest in an earlier availability opportunity.
- **Claim opportunity:** a time-limited invitation created when suitable stock becomes available.
- **Counter issue:** an immediate, staff-recorded issue of policy-eligible low-value consumables.
- **Reconciliation:** entry of an outage-time physical event after service restoration, linked to the manual log.

## Canonical state models

### Request

`draft → submitted → under_review → approved | partially_approved | rejected | changes_requested | cancelled`

`changes_requested` returns to `draft` when the member edits it, after which it may be submitted again.

### Reservation

`reserved → ready_for_pickup → issued | expired | cancelled`

### Loan

`active → partially_returned → returned`

`overdue` is derived from unresolved quantity and due time rather than treated as a destructive replacement for `active`. Lost and written-off quantities are resolutions recorded on loan lines.

### Membership

`inactive | active | suspended | former`

Suspended and former members cannot create new requests. Historical records remain accessible according to privacy policy.

### Member application

`awaiting_email_confirmation → incomplete → pending_review → approved | changes_requested | rejected`

`changes_requested` returns to `incomplete` when the applicant replaces or corrects the submission. Approval atomically moves membership to `active`. Approval and rejection are final decisions for the submitted document and start its 30-day deletion clock.

## Invariants

1. Exactly one borrower of record exists for each submitted request and loan.
2. The borrower of record is an active member at submission and handover.
3. A requester cannot approve their own request or extension.
4. Pending requests do not affect availability.
5. Approved reservations do affect availability.
6. A reservation cannot create more overlapping allocated quantity than usable stock.
7. A handover cannot exceed the remaining approved quantity.
8. A return cannot exceed the unresolved issued quantity.
9. Stock quantities cannot be negative.
10. Consumables create no return obligation.
11. Repair-required and non-working quantities cannot satisfy reservations.
12. Archived catalog items cannot receive new requests.
13. Historical business events are append-only.
14. Every privileged override, correction, write-off, permission change, handover, and return has an actor, timestamp, and audit event.
15. Students can access their own borrowing records but not another borrower's identity.
16. Only a confirmed institutional email account may submit a member application.
17. Only an approved application may activate membership, and approval records the deciding administrator atomically.
18. College-ID bytes are never stored in PostgreSQL, logs, exports, notifications, or audit payloads.
19. A final application decision schedules the private ID object for deletion after 30 days while preserving non-image audit history.
20. Required in-app notifications are created idempotently in the same transaction as their originating business action.

## Date and time rules

- Store timestamps as UTC instants.
- Display operational dates in the configured club timezone, initially `Asia/Kolkata`.
- Requested periods are explicit start/end instants or all-day local dates converted consistently at the boundary.
- End must be after start.
- Due/overdue calculations use server/database time, never a browser-supplied clock.

## Language to avoid

- Do not use **issued** for an approved reservation; issuance begins only after physical handover.
- Do not use **available** for stock that is merely expected to return without labeling it expected.
- Do not use **admin** as a catch-all permission in code; name the required permission.
- Do not call pooled stock an individual asset.
- Do not treat diagnostic logs as the business audit trail.
