# R.O.F.I.E.S Equipment Manager — Project Specification

**Status:** Approved product design, revised authentication and notifications  
**Design date:** 2026-08-08  
**Primary platform:** Responsive web application with lightweight PWA installability

## 1. Product objective

Provide R.O.F.I.E.S with one dependable source of truth for equipment discovery, availability, reservations, physical custody, returns, condition, repairs, and consumable stock.

The application must let club heads answer:

- What equipment and consumables do we own?
- How much is usable and available now or for a future date range?
- Who currently holds returnable equipment?
- What is awaiting approval, pickup, return, repair, or reconciliation?
- When is equipment expected to become available?
- Who authorized and physically performed each important action?

## 2. Expected scale

- 1,000–2,000 signed-in students.
- 200–300 approved members.
- 1,000–2,000 inventory units.
- 5–15 staff users with one or more privileged roles.

This scale does not require microservices or a separate search engine.

## 3. Roles and authorization

### Student applicant

A user with a confirmed institutional email/password account who is completing or awaiting admin review of their profile and college-ID document. Applicants may access only authentication, onboarding, application-status, recovery, and sign-out experiences.

### Approved member

A student approved by a club administrator. May create and cancel requests, reserve future availability, join waitlists, request extensions, and view only their own requests, loans, returns, and notifications.

### Inventory manager

May maintain catalog and stock data, record adjustments and condition, confirm handovers and returns, manage repairs, and reconcile outage records.

### Approver

May approve, partially approve, reject, or request changes to borrowing requests and extensions. May manage reservation and waitlist exceptions. May not approve their own request or extension.

### Administrator

May approve membership, assign or revoke composable staff permissions, manage global policies and contacts, review audit history, archive records, and control maintenance/system notices.

Privileged roles are composable. Authorization is checked in the UI, in server-side commands, and through PostgreSQL RLS.

## 4. Scope

### Included

- Supabase email/password authentication restricted to configured institution domains, with email confirmation and password recovery through institution SMTP.
- Profile onboarding and private college-ID upload followed by an admin decision that simultaneously verifies identity and activates club membership.
- Searchable catalog with photographs, aliases, tags, specifications, remarks, condition, and availability.
- Pooled reusable, individual-asset, and consumable tracking.
- Multi-item requests with one accountable borrower and optional project/team context.
- Per-line partial approval.
- Future reservations, pickup expiry, extensions, overdue handling, and waitlists.
- In-person, admin-confirmed handover and return.
- Partial returns, repair routing, write-offs, adjustments, and immutable history.
- In-app application notifications.
- Admin dashboard, reports, CSV exports, contacts, audit, health, and reconciliation.
- Responsive desktop/mobile experience and lightweight PWA installation.

### Explicitly excluded from the initial release

- Camera workflows and QR/barcode scanning.
- Native Android or iOS applications.
- SMS and WhatsApp notifications.
- Application-event email notifications; email is reserved for authentication confirmation, recovery, and security notices.
- Payments, deposits, automated fines, or monetary penalties.
- Offline inventory mutations.
- Advanced predictive analytics.
- Mandatory serialization or physical IDs for interchangeable components.

### 4.1 Registration and identity verification

The registration lifecycle is:

`Email/password submitted → Email confirmation required → Profile and ID upload → Pending admin review → Active member | Changes requested | Rejected`

- Registration accepts only a configured institutional email domain. The server revalidates the normalized domain during onboarding and protected actions.
- The student confirms email ownership through Supabase Auth before completing onboarding.
- Required profile fields are full name, student ID, department, and academic year; phone is optional.
- The student uploads one JPEG, PNG, or WebP college-ID image. The server validates decoded type, dimensions, and size; re-encodes it; strips unnecessary metadata; and stores it under a generated name in a dedicated private Supabase Storage bucket.
- PostgreSQL stores only the object reference, processing metadata, application state, decision, reviewer, timestamps, retention deadline, and audit history—not the image bytes.
- While pending, the applicant may view their own processed image. Replacement is allowed only before submission or after an admin requests changes.
- A membership administrator may view pending documents through authorized short-lived access and must provide a reason when requesting changes or rejecting an application.
- **Verify and activate member** is one atomic admin action. It records the decision and activates membership.
- Every admin document view and verification decision is audit logged without logging document contents or access URLs.
- A final approval or rejection schedules the image for deletion after 30 days. The object is deleted automatically while the non-image decision and audit history remain.
- Authentication errors do not reveal whether an email is already registered. Signup, login, recovery, upload, document access, resubmission, and decisions are rate limited.

## 5. Inventory

### 5.1 Catalog record

Each catalog item supports:

- Name, description, category, aliases, tags, and free-form searchable key/value specifications.
- One or more photos. Photos are required for important reusable equipment and optional for basic consumables.
- Public remarks and internal admin remarks.
- Tracking mode and return policy.
- Current and future availability.
- Admin-only room/cabinet/shelf/bin location.
- Configurable default and maximum loan duration, member quantity limit, extension policy, pickup window, and waitlist policy.
- Optional acquisition date, supplier, warranty, replacement cost, and low-stock threshold.

### 5.2 Tracking modes

1. **Pooled reusable:** interchangeable components tracked by quantity and condition. The system knows that a borrower has a quantity of a model, not which physical unit.
2. **Individual asset:** unique or important equipment that benefits from per-unit identity, photo, condition, and history. Per-asset identification is optional.
3. **Consumable:** permanently deducted at issue and not expected back.

### 5.3 Condition

Core condition values are:

- Perfect.
- Minor damage but usable.
- Repair required.
- Not working/showpiece.

Condition is separate from availability. Repair-required and non-working stock remains visible but is not requestable. For pooled items, condition is represented as quantities. A return may split a quantity across conditions.

### 5.4 Inventory rules

- Stock may not become negative.
- Archived items remain in historical records and cannot receive new requests.
- Used catalog records are archived, not deleted. Only unused draft records may be permanently deleted.
- Completed history is corrected by linked adjustments with a reason, actor, and timestamp.
- Students cannot see precise storage location, internal remarks, cost, or other borrowers.

## 6. Borrowing workflow

### 6.1 Request

An approved member creates a request containing one or more item lines, quantities, requested date range, purpose, optional project/event, and optional team members. Exactly one member is the borrower of record.

The request-level lifecycle is:

`Draft → Submitted → Under review → Fully/partially approved | Rejected | Changes requested | Cancelled`

Each line has its own decision and approved quantity. Pending requests do not block stock.

### 6.2 Approval and reservation

- An approver reviews availability, member eligibility, overdue status, limits, purpose, and conflicts.
- The approver may approve, reduce, reject, or request changes per line and must provide a reason for reductions, rejection, or override.
- Approved future lines create a real reservation and block the approved quantity for the approved period.
- Availability is calculated across the full requested date range.
- Admin overrides are allowed only with explicit warnings, reasons, and audit events.
- The requester may not approve their own request.

The reservation lifecycle is:

`Reserved → Ready for pickup → Issued | Cancelled | Expired`

Uncollected reservations expire after the configured pickup window and release their allocation.

### 6.3 Physical handover

The inventory manager verifies the borrower in person and reviews the approved lines. They confirm actual quantities, outgoing condition, due date, and handover remarks, then press **Confirm handover**.

That confirmation atomically creates the loan, consumes the reservation, updates current custody/stock, records the handler and timestamp, appends audit events, and creates in-app notifications. A failed transaction changes nothing and is never shown as success.

Configurable low-value consumables may use a counter-issue flow in which an inventory manager records and confirms a withdrawal to an active member without a separate earlier approval. It remains attributable and audited.

### 6.4 Active loan and extension

- A member may request an extension before or after the due date.
- An authorized approver other than the requester approves or rejects it.
- A conflict with an approved future reservation rejects the extension by default.
- An admin may override only with a reason and affected-member notifications.
- A member with overdue returnable equipment may not submit a new borrowing request.
- No monetary fine is calculated or collected.

### 6.5 Return

- Returns require in-person confirmation by an inventory manager.
- Partial returns are allowed and retain the remaining obligation.
- Incoming quantities and condition are recorded per line.
- Damaged returns may move directly to repair-required stock.
- The obligation closes only when every returnable quantity is returned, lost, or written off through an authorized resolution.
- Lost and written-off resolutions require a reason and audit record.

## 7. Availability and waitlists

- Members can search current availability or select a future date range and quantity.
- The system displays usable quantity available now, whether the requested range can be satisfied, and expected future availability.
- Expected return dates are visible without borrower identity and are labeled as expected, not guaranteed.
- Approved overlapping reservations may not exceed usable stock.
- A member may join a first-come-first-notified waitlist for a quantity and date range.
- When stock becomes available early, the first eligible member receives a configurable claim window.
- An unclaimed opportunity passes to the next eligible member.
- Admin priority overrides require a reason and audit event.

## 8. Notifications

Application notifications are in-app only. Authentication confirmation, recovery, and security email is handled separately by Supabase Auth through institution SMTP.

Events include membership decisions, request changes, approval/rejection, pickup readiness, reservation expiry, upcoming due date, overdue status, extension decision, cancellation, waitlist opportunity, repair-related availability changes, and system notices.

Notification creation is direct, transactional, and idempotent: a business action and its required notification either commit together or fail together. Users can mark one or all notifications read. Read notifications are archived after 180 days; unread and security-relevant records follow the configured retention policy. Admin dashboards expose pending work independently of notification-read state.

## 9. Points of contact

Signed-in users can see contact name, responsibility, institutional email, and availability. Phone numbers are optional and visible only to approved members. App Support is a separate contact category from equipment and club leadership.

## 10. Main experiences

### Member

- Email/password registration, email confirmation, login, recovery, password update, onboarding, and application status.
- Catalog search/filter and category browsing.
- Equipment details and availability calendar.
- Request cart.
- My requests, reservations, loans, returns, and history.
- Extension, cancellation, and waitlist actions.
- Notification center and contacts.

### Staff

- Operational dashboard.
- Approval workspace with per-line decisions.
- Phone-friendly handover and return workspace.
- Catalog, inventory, photograph, location, condition, repair, and archive management.
- Member and permission administration.
- Reservation/waitlist management.
- Registration review, private college-ID access, retention status, policy, contact, and system-notice configuration.
- Reports, CSV export, audit log, and system health/reconciliation views.

## 11. Admin configuration

Admins may configure category/global defaults for loan duration, maximum duration, quantity limits, extensions, pickup windows, waitlists, reminder timing, low-stock thresholds, contacts, club timezone, and catalog metadata.

The production club timezone is `Asia/Kolkata`; timestamps are stored as UTC instants. Policy changes affect new decisions and do not silently rewrite completed history.

## 12. Error and outage behavior

- Field validation explains how to correct input.
- Permission failures reveal no inaccessible record details.
- Conflicts show refreshed availability and safe alternatives.
- Unexpected errors show a reference ID, not internal details.
- State-changing operations are idempotent and have definitive success/failure responses.
- Authorization and writes fail closed.
- Clearly marked cached catalog data may remain readable during an outage.
- Inventory mutations require a healthy database.
- Emergency physical activity uses the documented manual log and audited reconciliation procedure.

## 13. Quality attributes

- Typical catalog and operational interactions should complete within about two seconds under normal conditions.
- Search and lists are paginated; queries and exports are bounded.
- Photos are resized and optimized.
- The UI supports keyboard navigation, meaningful labels, visible focus, screen-reader status messages, and statuses that do not rely on color alone.
- Development, preview, test, and production data and secrets are isolated.
- Logs, metrics, traces, alerts, backups, and restoration follow `docs/OPERATIONS.md`.
- Security controls and assurance follow `docs/SECURITY.md`.
- Verification follows `docs/TEST_STRATEGY.md`.

## 14. Initial acceptance criteria

The first general release is acceptable only when:

- Every role can perform allowed actions and is denied forbidden ones through both UI and direct server requests.
- A full request-to-return workflow works for pooled, individual, and consumable items.
- Partial approval and partial return preserve correct quantities.
- Concurrent reservation/handover tests cannot overbook stock.
- Availability and expected-return views disclose no borrower identity.
- Audit history explains every privileged inventory transition.
- Registration, ID-document retention, and direct in-app notification flows satisfy their state, privacy, and idempotency requirements.
- Migrations apply successfully to a clean database and RLS tests pass.
- Backup restoration and emergency reconciliation have been exercised.
- Critical accessibility flows pass automated and manual checks.
- No unresolved critical/high security finding remains without an approved, documented risk decision.

## 15. Delivery sequence

1. Foundation: repository guidance, environments, CI, authentication, authorization, audit, migrations, and observability.
2. Catalog: inventory modes, photos, search, condition, location, and staff management.
3. Borrowing: requests, partial approval, availability, reservations, pickup expiry, and waitlists.
4. Circulation: handover, loans, partial returns, extensions, overdue, repair, and reconciliation.
5. Communication and operations: notifications, dashboard, contacts, reports, and exports.
6. Hardening and pilot: security, concurrency, accessibility, restore exercise, seeded demo, and limited rollout.
7. General release after pilot findings are resolved.

## 16. References

- [OWASP Top 10:2025](https://owasp.org/Top10/)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase private storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Vercel Observability](https://vercel.com/docs/observability)
- [Vercel tracing](https://vercel.com/docs/tracing)
- [Vercel Labs Deepsec](https://github.com/vercel-labs/deepsec)
- [Trail of Bits security skills](https://github.com/trailofbits/skills)
