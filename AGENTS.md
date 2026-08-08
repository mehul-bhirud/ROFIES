# R.O.F.I.E.S Equipment Manager — Agent Instructions

## Purpose

Build and maintain the responsive equipment catalog, reservation, issuance, and return system defined in `PROJECT_SPEC.md`.

## Sources of truth

Read the smallest relevant set before changing behavior:

1. `PROJECT_SPEC.md` — authoritative product behavior and scope.
2. `docs/DOMAIN_MODEL.md` — canonical terms, states, and invariants.
3. `docs/ARCHITECTURE.md` — system boundaries and data flows.
4. `docs/DATA_MODEL.md` — relational model, constraints, indexes, and RLS intent.
5. `docs/SECURITY.md` — mandatory security and privacy controls.
6. `docs/OPERATIONS.md` — failures, observability, recovery, and reconciliation.
7. `docs/TEST_STRATEGY.md` — required verification.
8. `docs/adr/` — accepted architectural decisions.

When documents conflict, stop and resolve the conflict in the documents before implementing behavior. A narrower ADR may refine architecture, but it may not silently override product requirements.

## Non-negotiable invariants

- Authentication uses Supabase institutional-email/password accounts with confirmed email ownership. Authorization is separate and deny-by-default.
- A student must complete profile onboarding, submit a processed college-ID image, and receive admin approval before becoming an active member or accessing the catalog/borrowing workflows.
- College-ID images are sensitive private objects: access is audited, only the applicant and membership administrators may view them as allowed by state, and the object is deleted 30 days after a final decision.
- A borrowing request requires an authorized approval and an in-person, admin-confirmed handover.
- The requester may not approve their own request or extension.
- Pending requests do not reserve stock. Approved reservation lines do.
- Inventory-changing actions are atomic, idempotent, authorized on the server, and audit logged.
- Stock never becomes negative and approved overlapping reservations never exceed usable stock.
- Completed business history is append-only. Correct it with linked adjustment events; do not rewrite or delete it.
- Condition and availability are separate concepts.
- Repair-required and non-working items remain searchable but cannot be requested.
- Students never see other borrowers' identities, internal remarks, precise storage locations, or privileged audit data.
- No secret or privileged database credential may be shipped to the browser, committed, or logged.
- A failed database write must never be presented as a successful approval, handover, return, or stock change.

## Architecture rules

- Use a server-mediated Next.js application on Vercel with Supabase PostgreSQL, Auth, and Storage.
- Privileged mutations go through focused server-side command functions and PostgreSQL transactions.
- RLS is defense in depth and must cover every exposed table and view.
- Keep modules aligned with the boundaries in `docs/ARCHITECTURE.md`; do not place business rules only in UI components.
- Write application notifications directly and idempotently inside the originating database transaction. Application-event notifications are in-app only.
- Email is limited to Supabase Auth confirmation, recovery, and security messages sent through institution SMTP.
- Scheduled maintenance uses authenticated server jobs for college-ID retention cleanup and read-notification archival. Job responses, logs, and dashboards must stay aggregate/redacted and must not expose document object names, signed URLs, or applicant identifiers.
- Use migrations for every schema or policy change. Never edit the production schema manually.
- Keep preview, test, and production credentials and data isolated.

## Change workflow

- Update the applicable specification when behavior, terminology, permissions, data retention, or operational policy changes.
- Add or change a migration for schema, index, grant, function, trigger, or RLS changes.
- Treat concurrency, authorization, exceptional states, and rollback behavior as part of feature design.
- Preserve unrelated user changes.
- Do not add QR/barcode scanning, camera workflows, native apps, SMS/WhatsApp, payments, deposits, monetary fines, or mandatory per-unit labels unless the product specification is explicitly revised.

## Verification

- Follow `docs/TEST_STRATEGY.md` and run the repository's documented checks before claiming completion.
- Every inventory-integrity, authorization, privacy, or business-logic bug needs a regression test.
- Review OWASP 2025 implications for security-sensitive changes.
- Verify migrations from a clean database and test RLS as each supported role.
- Do not claim a feature complete until its authorization, validation, error states, audit events, observability, migration impact, and tests are handled.

Use the committed `package.json` scripts and `README.md` for executable setup and verification commands; keep both current when tooling changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
