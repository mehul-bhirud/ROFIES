# Inventory catalog CRUD — design

Status: approved by product owner (chat, 2026-09-11)
Author: Claude (session), with mehul.c.bhirud@gmail.com

## Problem

The Inventory page (`src/app/admin/inventory/page.tsx`) is read-only: it lists
catalog items, shows usable/repair quantities, accepts equipment-photo
uploads, and offers a CSV export. There is no way for an inventory manager or
admin to create a new catalog item, edit an existing one, retire one, or
adjust its stock from the UI — this is documented as a known gap in
`output/pdf/ROFIES_Equipment_Manager_Club_Handbook.pdf` ("Current interface
boundary... A full create/edit catalog form and stock-adjustment screen are
not yet exposed"). This spec closes that gap.

## Scope

In scope:

- Create a catalog item (metadata + optional opening stock).
- Edit a catalog item's metadata/policy fields.
- Archive a catalog item (soft retire) and restore it (undo an accidental
  archive).
- Permanently delete a catalog item, but only when it has zero history
  (matches the handbook's stated rule: "Only an unused draft may be
  permanently deleted").
- Adjust pooled/consumable stock quantity at a location+condition, with a
  reason (acquisition or correction).
- Add one more unit to an individual-asset item.

Out of scope (YAGNI for v1, noted so it isn't silently forgotten):

- Editing structured aliases/specifications (key-value pairs) — stays
  read/whatever-it-is-today; only a flat, comma-separated tags list is
  editable.
- Editing condition/custody of an existing individual asset outside the
  existing return/repair/loss flows.
- Changing `tracking_mode` after creation (would invalidate the stock model:
  pooled uses `pool_balances`, individual uses `individual_assets`).
- A dedicated "restore" UI affordance beyond an action on an archived row (no
  separate archived-items browsing page).

## Data model

No schema changes. Every table this feature touches already exists:
`catalog_items`, `categories`, `catalog_aliases`, `catalog_tags`,
`catalog_specifications` (untouched by this feature), `pool_balances`,
`individual_assets`, `stock_adjustments`, `storage_locations`,
`audit_events`, `idempotency_keys`.

Relevant existing constraints the commands must respect:

- `catalog_items.return_required = (tracking_mode <> 'consumable')` — derived,
  never user-supplied.
- `catalog_items.maximum_loan_days is null or default_loan_days is null or
maximum_loan_days >= default_loan_days`.
- `pool_balances` uniqueness on `(catalog_item_id, storage_location_id,
condition)`, `quantity_on_hand >= 0`.
- `individual_assets.local_identifier` unique when not null.

## Commands (new migration `supabase/migrations/202609110001_catalog_item_commands.sql`)

All functions follow the exact pattern already used by
`api.counter_issue` / `api.resolve_loss` (`202608080009_extended_lifecycle_commands.sql`):
`security definer`, `set search_path = ''`, capability check via
`private.has_capability(v_actor, 'inventory:manage')`,
`pg_advisory_xact_lock` keyed by actor+command+idempotency key, an
`idempotency_keys` read-before/write-after pair, an `audit_events` insert, and
a `jsonb` result. Revoked from `public, anon`; granted `execute` to
`authenticated`.

1. **`api.create_catalog_item`**
   `(category_id uuid, name text, description text, tracking_mode text,
public_remarks text, internal_remarks text, default_loan_days integer,
maximum_loan_days integer, member_quantity_limit integer,
pickup_window_hours integer, waitlist_enabled boolean,
counter_issue_enabled boolean, low_stock_threshold integer,
acquisition_date date, supplier text, warranty_until date,
replacement_cost numeric, tags jsonb, opening_units jsonb,
idempotency_key text)`
   - `tags`: jsonb array of strings (0–20, each 1–60 chars).
   - `opening_units`: jsonb array. For `pooled_reusable`/`consumable`, each
     element is `{storage_location_id, condition, quantity}` and becomes a
     `pool_balances` row (upserted) plus a `stock_adjustments` row
     (`source = 'acquisition'`). For `individual_asset`, each element is
     `{local_identifier, storage_location_id, condition}` and becomes one
     `individual_assets` row (`custody_state = 'on_hand'`) plus a
     `stock_adjustments` row referencing that asset. May be an empty array
     (create with zero stock, add it later).
   - Sets `return_required` internally from `tracking_mode`. Validates
     `tracking_mode in ('pooled_reusable','individual_asset','consumable')`,
     the loan-day ordering rule, and that `opening_units` entries match the
     chosen tracking mode's shape — raises a plain exception (caught by the
     route as a 400) otherwise.
   - Audit action: `catalog_item.created`.

2. **`api.update_catalog_item`**
   `(catalog_item_id uuid, category_id uuid, name text, description text,
public_remarks text, internal_remarks text, default_loan_days integer,
maximum_loan_days integer, member_quantity_limit integer,
pickup_window_hours integer, waitlist_enabled boolean,
counter_issue_enabled boolean, low_stock_threshold integer,
acquisition_date date, supplier text, warranty_until date,
replacement_cost numeric, tags jsonb, reason text, idempotency_key text)`
   - Editable regardless of archive state (an archived item can still have a
     typo fixed). `tracking_mode` is not a parameter — immutable.
   - Replaces the tag set wholesale (delete + reinsert) for simplicity.
   - Audit action: `catalog_item.updated`, `reason` stored.

3. **`api.archive_catalog_item`** `(catalog_item_id uuid, reason text,
idempotency_key text)`
   - `update ... set archived_at = now() where id = ... and archived_at is
null`; raises if not found or already archived.
   - Audit action: `catalog_item.archived`.

4. **`api.restore_catalog_item`** `(catalog_item_id uuid, reason text,
idempotency_key text)`
   - Mirror of archive: `archived_at = null where archived_at is not null`.
   - Audit action: `catalog_item.restored`.

5. **`api.delete_catalog_item`** `(catalog_item_id uuid, reason text,
idempotency_key text)`
   - Permitted only when **all** of the following hold: no `request_lines`,
     no `stock_adjustments`, no `maintenance_events`, no `waitlist_entries`,
     no `individual_assets` (any row, archived or not) reference the item,
     and every `pool_balances` row for it has `quantity_on_hand = 0`.
   - Otherwise raises `'catalog item has history and cannot be permanently
deleted; archive it instead'` (errcode `P0001`, surfaced by the route
     as a 400 with that message).
   - On success: captures `to_jsonb(v_item)` into `audit_events.before_summary`
     (the row won't exist to inspect afterward), deletes zero-quantity
     `pool_balances` rows, then deletes the `catalog_items` row
     (`catalog_aliases`/`catalog_tags`/`catalog_specifications` cascade via
     existing `ON DELETE CASCADE`).
   - Audit action: `catalog_item.deleted`.

6. **`api.adjust_stock`** `(catalog_item_id uuid, storage_location_id uuid,
condition text, quantity_delta integer, reason text, idempotency_key
text)`
   - Only for `tracking_mode in ('pooled_reusable','consumable')` — raises
     otherwise (individual assets use command 6 below instead).
   - Upserts `pool_balances` (`quantity_on_hand = quantity_on_hand +
quantity_delta`, guarded `>= 0`, else raises `'insufficient stock for
this adjustment'`).
   - Inserts `stock_adjustments` (`source = 'acquisition'` when
     `quantity_delta > 0`, else `'correction'`).
   - Audit action: `stock.adjusted`.

7. **`api.add_individual_asset`** `(catalog_item_id uuid, local_identifier
text, storage_location_id uuid, condition text, reason text,
idempotency_key text)`
   - Only for `tracking_mode = 'individual_asset'`.
   - Inserts one `individual_assets` row (`custody_state = 'on_hand'`) and a
     `stock_adjustments` row (`quantity_delta = 1`, `source = 'acquisition'`,
     `individual_asset_id` set).
   - Audit action: `individual_asset.added`.

## Route wiring (`src/app/api/commands/[command]/route.ts`)

Add seven new keys to the `schemas` map — `createCatalogItem`,
`updateCatalogItem`, `archiveCatalogItem`, `restoreCatalogItem`,
`deleteCatalogItem`, `adjustStock`, `addIndividualAsset` — each backed by a
new Zod schema in `src/lib/validation/commands.ts` (reusing the existing
`boundedText`/`databaseId`/`isoInstant` helpers, `z.array` for tags/opening
units with the same size caps used elsewhere, and a `.refine` for the
`maximumLoanDays >= defaultLoanDays` cross-field rule, mirroring
`requestCommandSchema`). Add a matching `else if (command === "...")` branch
in `POST` that maps camelCase body fields to the RPC's snake_case params,
identical in shape to the existing branches. No changes to the
origin/rate-limit/demo-mode/error-handling scaffolding — it is reused as-is.
Demo mode behavior is therefore automatic and consistent with every other
command: a simulated "committed" response after ~120ms, no real write, no
change to the (static) demo catalog fixture.

## Reads needed by the new UI

`categories` and `storage_locations` already have `select` grants to
`authenticated` plus staff-read RLS policies (`categories_staff_read`,
`locations_staff_read`) gated on `inventory:manage`. Add two small server
query helpers next to `getCatalog` in `src/lib/catalog/queries.ts`:
`getCategories()` and `getStorageLocations()`, each following the exact
`env.demoMode` branch-to-fixture pattern `getCatalog` already uses. Add
`demoCategories` and `demoStorageLocations` fixture arrays to
`src/lib/demo-data.ts`.

## UI

Two new server-rendered pages, both starting with
`await requireAnyCapability(["inventory:manage"])` like every other admin
page:

- `src/app/admin/inventory/new/page.tsx` — create form. Renders category and
  storage-location `<select>`s from the new query helpers, tracking-mode
  radio group that conditionally shows either an opening-quantity-by-condition
  field (pooled/consumable) or a repeatable local-identifier list
  (individual asset).
- `src/app/admin/inventory/[id]/edit/page.tsx` — edit form. `CatalogItemView`
  (returned by `getCatalog`/`getCatalogItem`, sourced from `api.search_catalog`)
  is a member-facing projection and is missing `category_id`,
  `internal_remarks`, and every policy field (loan days, pickup window,
  member quantity limit, low-stock threshold, waitlist/counter-issue flags,
  supplier, warranty, replacement cost) needed to pre-fill this form. Add a
  new staff-only query, `getCatalogItemForEdit(id)` in
  `src/lib/catalog/queries.ts`, that selects directly from
  `public.catalog_items` (+ `public.catalog_tags`) via the Supabase client —
  this is safe because `catalog_items` already has a `select` grant to
  `authenticated` plus the `catalog_staff_read` RLS policy gated on
  `inventory:manage`, so it naturally returns 0 rows for anyone without that
  capability instead of needing its own auth check. In demo mode it reads
  from a new `demoCatalogItemDetail` fixture map in `demo-data.ts` keyed by
  id. Tracking mode is shown read-only (see Scope).

Both forms post through a new client component,
`src/components/inventory/catalog-item-form.tsx`, built the same way as
`OperationForm`: `useTransition`, `crypto.randomUUID()` idempotency key,
`fetch("/api/commands/<name>", ...)`, success/error `command-result` block
reusing existing CSS classes (`command-card`, `form-field`, `command-result`,
`button button-primary`).

The Inventory page (`src/app/admin/inventory/page.tsx`) gets:

- An "Add item" link to `/admin/inventory/new` next to the existing "Safe
  CSV" button.
- Per-row actions: **Edit** (link to the edit page), **Adjust stock** (small
  inline form or link — quantity delta + condition + storage location +
  reason), **Archive**/**Restore** (single button, form posts to
  `archiveCatalogItem`/`restoreCatalogItem` depending on current state),
  **Delete** (always rendered — v1 does not add a server-side
  delete-eligibility precheck to the list query; the command itself is the
  source of truth and returns the specific "has history, archive instead"
  message, which the `catalog-item-form`-style result block surfaces
  verbatim. A precheck badge can be added later without changing the
  command contract).

## Error handling

Unchanged from the existing command route: Zod validation failures return
422 with field errors; RPC errors map `40001` → 409 "record changed, refresh
and review", `42501` → 404 "resource unavailable", everything else → 400
with the command's own message text (e.g. the "has history, archive
instead" message from `delete_catalog_item`). Network failures on the client
show "operation was not confirmed; retry" exactly like `OperationForm`
already does.

## Testing

- `supabase/tests/database/022_catalog_item_commands.test.sql` (pgTAP, next
  free number after `021_manual_password_reset_requests.test.sql`): capability
  enforcement (non-`inventory:manage` actor rejected) for every new function;
  idempotency replay returns the same result without double-writing; create
  with pooled opening stock produces the expected `pool_balances` +
  `stock_adjustments` rows; create with individual-asset units produces the
  expected `individual_assets` rows; `maximum_loan_days < default_loan_days`
  rejected; `delete_catalog_item` succeeds on a fresh draft and is rejected
  (with the specific message) once any history exists (one case per history
  type: a request line, a stock adjustment, an individual asset, a
  waitlist entry, nonzero pool balance); `adjust_stock` rejects going
  negative and rejects individual-asset items; `archive`/`restore` round-trip
  and reject the no-op case (archiving an already-archived item).
- `tests/unit/*` additions for the new Zod schemas (valid/invalid shapes,
  the cross-field loan-day refine, array size caps) following the existing
  style in `tests/unit/authorization.test.ts` / wherever
  `requestCommandSchema` is tested today.
- Manual verification pass in demo mode (now enabled) covering: create
  (all three tracking modes), edit, archive, restore, delete-blocked-by-history
  message, adjust stock, add individual asset — confirming each shows the
  "committed" success state and the correct client-side validation errors
  for bad input, per this repo's `superpowers:verification-before-completion`
  norm. Demo mode cannot verify actual persistence (by design, per the route's
  existing demo branch), so a second pass against the real Supabase project
  (`ROFIES_DEMO_MODE=false`) is needed before calling this done end-to-end —
  noted here so it isn't skipped silently.
