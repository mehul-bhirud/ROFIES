# Architecture

## Decision summary

Use a server-mediated Next.js application deployed on Vercel, backed by Supabase PostgreSQL, Supabase Auth email/password, institution SMTP for authentication messages, and Supabase Storage. ADR 0003 supersedes the Google OAuth and application-email portions of ADRs 0001 and 0002.

## Architectural shape

The system is one deployable web application with deep internal module boundaries. It is not a microservice system.

### Modules

- **Identity and access:** email/password signup, confirmation, recovery, session validation, institution-domain enforcement, member applications, college-ID review, membership, roles, and permission checks.
- **Catalog and inventory:** item definitions, photos, specifications, pooled balances, individual assets, condition, location, adjustments, and archive.
- **Availability:** date-range capacity, reservation conflicts, pickup windows, and waitlists.
- **Circulation:** requests, decisions, handovers, loans, extensions, returns, loss/write-off, and outage reconciliation.
- **Maintenance:** repair events and changes between usable and unusable condition.
- **Notifications:** direct transactional in-app records, read state, links, and retention.
- **Administration:** contacts, policy configuration, reports, exports, system notices, and health views.
- **Audit and operations:** immutable business audit events, structured diagnostic telemetry, and integrity checks.

Each module exposes focused commands and queries. UI components call these interfaces; they do not implement authoritative business rules.

## Trust boundaries

### Browser

Untrusted. It may hold a user session and public/publishable configuration. It must never receive service-role database credentials, email secrets, or authorization decisions that are not independently checked on the server/database.

### Next.js server

Trusted application boundary for input validation, authorization, orchestration, idempotency, transactions, response shaping, and telemetry. Privileged mutations terminate here.

### PostgreSQL

Authoritative state and integrity boundary. Constraints, grants, RLS, transaction functions, and locks provide defense in depth. RLS applies to every table/view exposed through a data API.

### Object storage

Stores equipment photos and college-ID documents in separate buckets and policy domains. Upload and read access is controlled. Metadata and ownership are stored in PostgreSQL. Uploads are decoded, validated, re-encoded, and stripped of unnecessary metadata before normal use. College-ID objects are private, access-audited, and deleted 30 days after a final decision.

### Authentication email

Supabase Auth sends only account confirmation, recovery, and security messages through institution SMTP. SMTP availability affects registration/recovery but is not part of application-event notification delivery.

## Read and write paths

### Catalog read

1. Browser sends authenticated search/filter/date-range query.
2. Server validates bounds and session.
3. Query layer fetches catalog, sanitized remarks, aggregate condition, and availability without borrower identity.
4. Server returns a paginated view model and controlled image URLs.

### Approval/reservation

1. Approver submits per-line decisions with an idempotency key.
2. Server validates permission, self-approval prohibition, request state, quantities, dates, and reasons.
3. A database transaction locks relevant catalog inventory in stable order.
4. Availability is recalculated inside the transaction.
5. Decisions and reservations are appended; conflicts abort the transaction.
6. Audit and required in-app notification records are written in the same transaction.

### Handover

1. Inventory manager opens an approved ready reservation.
2. Server refreshes member eligibility, overdue restrictions, reservation state, and stock.
3. One transaction consumes reservation quantities, creates loan/lines, records condition and handler, updates inventory projections, and appends audit/notification records.
4. The UI displays success only after commit.

### Return

1. Inventory manager submits returned quantities and incoming condition.
2. Server validates that quantities do not exceed unresolved obligations.
3. One transaction appends return lines, updates stock/condition, creates maintenance routing when needed, closes resolved obligations, and writes audit/notification records.

### Registration and verification

1. Supabase Auth creates an institutional email/password identity and sends a confirmation message through institution SMTP.
2. After confirmation, the applicant submits validated profile fields and a processed college-ID image.
3. The server stores the object in the private ID bucket and atomically registers its metadata/application state; a failed database registration deletes the object.
4. A membership administrator accesses the document through a short-lived authorized path, producing an audit event.
5. One transaction records approval/changes/rejection, activates membership on approval, and creates the relevant in-app notification.
6. A scheduled cleanup command deletes objects whose 30-day final-decision retention has elapsed and records deletion time without erasing the decision audit.

### In-app notification creation

Business command functions insert deduplicated `notifications` rows in the same transaction as the originating action. No application email worker, provider call, retry queue, or delivery table exists.

## Concurrency strategy

- Mutating commands carry unique idempotency keys scoped to actor and command type.
- Transactions lock inventory records in deterministic order to reduce deadlocks.
- Availability is recalculated at approval and handover, not trusted from a prior page load.
- Request/reservation/loan rows use version or state preconditions to reject stale transitions.
- Database constraints provide final protection for non-negative quantities and valid relationships.

## Search and performance

- PostgreSQL full-text search and trigram matching cover names, aliases, tags, descriptions, and specification values.
- Query endpoints are paginated and bounded.
- Server queries fetch complete view models in a small number of set-based queries; do not perform per-row related queries.
- Indexes follow `docs/DATA_MODEL.md` and are verified with realistic query plans.
- Large exports are created asynchronously with authorization rechecked at creation and download.

## Deployment and environments

- Vercel hosts the Next.js application.
- Supabase provides Postgres, Auth, and Storage.
- Local, test, preview, and production environments use separate data and credentials.
- Preview deployments never use production service credentials.
- Schema, grants, functions, triggers, and RLS policies are changed only through versioned migrations.
- Deployment supports maintenance mode for schema or incident work.

## Deliberately deferred implementation choices

Implementation tooling is recorded in ADR 0002. Authentication and notification changes are recorded in ADR 0003. Future provider choices may not weaken the boundaries or invariants in this document and require an ADR before adoption.
