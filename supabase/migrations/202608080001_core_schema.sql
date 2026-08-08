create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgtap with schema extensions;
create schema if not exists private;
create schema if not exists api;

revoke all on schema private from public, anon, authenticated;
revoke all on schema api from public;
grant usage on schema api to authenticated;

create type public.membership_state as enum ('inactive', 'active', 'suspended', 'former');
create type public.tracking_mode as enum ('pooled_reusable', 'individual_asset', 'consumable');
create type public.condition_state as enum ('perfect', 'minor_damage', 'repair_required', 'not_working');
create type public.request_state as enum ('draft', 'submitted', 'under_review', 'approved', 'partially_approved', 'rejected', 'changes_requested', 'cancelled');
create type public.decision_state as enum ('approved', 'reduced', 'rejected', 'changes_requested');
create type public.reservation_state as enum ('reserved', 'ready_for_pickup', 'issued', 'cancelled', 'expired');
create type public.loan_state as enum ('active', 'partially_returned', 'returned');
create type public.delivery_state as enum ('pending', 'processing', 'delivered', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  institutional_email text not null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  student_identifier text,
  department text,
  study_year smallint check (study_year between 1 and 8),
  phone text check (phone is null or char_length(phone) between 7 and 24),
  active boolean not null default true,
  last_authenticated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_unique_idx on public.profiles (lower(institutional_email));

create table public.memberships (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  status public.membership_state not null default 'inactive',
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  reason text check (reason is null or char_length(reason) <= 500),
  updated_at timestamptz not null default now()
);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  capability text not null check (capability in ('request:approve','inventory:manage','circulation:handover','circulation:return','membership:manage','roles:manage','audit:read','reports:export','system:manage')),
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index role_assignments_active_unique_idx on public.role_assignments (profile_id, capability) where revoked_at is null;
create index role_assignments_profile_idx on public.role_assignments (profile_id, revoked_at);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  default_loan_days smallint not null default 7 check (default_loan_days between 1 and 90),
  default_pickup_hours smallint not null default 24 check (default_pickup_hours between 1 and 168),
  archived_at timestamptz
);
create unique index categories_active_name_unique_idx on public.categories (lower(name)) where archived_at is null;
create index categories_parent_idx on public.categories (parent_id);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  tracking_mode public.tracking_mode not null,
  return_required boolean not null,
  public_remarks text not null default '' check (char_length(public_remarks) <= 2000),
  internal_remarks text not null default '' check (char_length(internal_remarks) <= 4000),
  default_loan_days smallint check (default_loan_days between 1 and 90),
  maximum_loan_days smallint check (maximum_loan_days between 1 and 180),
  member_quantity_limit integer check (member_quantity_limit > 0),
  pickup_window_hours smallint check (pickup_window_hours between 1 and 168),
  waitlist_enabled boolean not null default true,
  counter_issue_enabled boolean not null default false,
  acquisition_date date,
  supplier text,
  warranty_until date,
  replacement_cost numeric(12,2) check (replacement_cost >= 0),
  low_stock_threshold integer check (low_stock_threshold >= 0),
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(public_remarks, '')), 'C')
  ) stored,
  check (return_required = (tracking_mode <> 'consumable')),
  check (maximum_loan_days is null or default_loan_days is null or maximum_loan_days >= default_loan_days)
);
create index catalog_items_category_active_idx on public.catalog_items (category_id, tracking_mode) where archived_at is null;
create index catalog_items_search_idx on public.catalog_items using gin (search_document);
create index catalog_items_name_trgm_idx on public.catalog_items using gin (name extensions.gin_trgm_ops);

create table public.catalog_aliases (
  id bigint generated always as identity primary key,
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 120),
  unique (catalog_item_id, alias)
);
create index catalog_aliases_item_idx on public.catalog_aliases (catalog_item_id);

create table public.catalog_tags (
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 60),
  primary key (catalog_item_id, tag)
);

create table public.catalog_specifications (
  id bigint generated always as identity primary key,
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 80),
  value text not null check (char_length(value) between 1 and 300),
  unique (catalog_item_id, key)
);
create index catalog_specifications_item_idx on public.catalog_specifications (catalog_item_id);

create table public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.storage_locations(id) on delete restrict,
  room text not null,
  cabinet text,
  shelf text,
  bin text,
  active boolean not null default true
);
create index storage_locations_parent_idx on public.storage_locations (parent_id);

create table public.pool_balances (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  storage_location_id uuid references public.storage_locations(id) on delete restrict,
  condition public.condition_state not null,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  version integer not null default 1 check (version > 0),
  unique nulls not distinct (catalog_item_id, storage_location_id, condition)
);
create index pool_balances_item_condition_idx on public.pool_balances (catalog_item_id, condition, storage_location_id);

create table public.individual_assets (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  local_identifier text,
  manufacturer_serial text,
  condition public.condition_state not null,
  custody_state text not null default 'on_hand' check (custody_state in ('on_hand','reserved','issued','maintenance','written_off')),
  storage_location_id uuid references public.storage_locations(id) on delete restrict,
  internal_remarks text not null default '',
  archived_at timestamptz
);
create unique index individual_assets_local_id_unique_idx on public.individual_assets (local_identifier) where local_identifier is not null;
create index individual_assets_item_state_idx on public.individual_assets (catalog_item_id, custody_state, condition) where archived_at is null;

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  individual_asset_id uuid references public.individual_assets(id) on delete restrict,
  condition_from public.condition_state,
  condition_to public.condition_state,
  quantity_delta integer not null check (quantity_delta <> 0),
  reason text not null check (char_length(reason) between 3 and 1000),
  source text not null check (source in ('acquisition','correction','handover','return','repair','write_off','reconciliation')),
  correction_of uuid references public.stock_adjustments(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index stock_adjustments_item_created_idx on public.stock_adjustments (catalog_item_id, created_at desc);

create table public.maintenance_events (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  individual_asset_id uuid references public.individual_assets(id) on delete restrict,
  condition_from public.condition_state not null,
  condition_to public.condition_state not null,
  action text not null,
  remarks text not null default '',
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index maintenance_events_item_created_idx on public.maintenance_events (catalog_item_id, created_at desc);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  borrower_id uuid not null references public.profiles(id) on delete restrict,
  status public.request_state not null default 'draft',
  purpose text not null check (char_length(purpose) between 3 and 1000),
  project_name text,
  team_members jsonb not null default '[]'::jsonb check (jsonb_typeof(team_members) = 'array'),
  requested_start timestamptz not null,
  requested_end timestamptz not null,
  version integer not null default 1,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requested_end > requested_start)
);
create index requests_borrower_status_created_idx on public.requests (borrower_id, status, created_at desc);
create index requests_review_queue_idx on public.requests (status, submitted_at) where status in ('submitted','under_review');

create table public.request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete restrict,
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  requested_quantity integer not null check (requested_quantity > 0),
  member_remarks text not null default '' check (char_length(member_remarks) <= 1000),
  unique (request_id, catalog_item_id)
);
create index request_lines_request_idx on public.request_lines (request_id);
create index request_lines_item_idx on public.request_lines (catalog_item_id);

create table public.request_line_decisions (
  id uuid primary key default gen_random_uuid(),
  request_line_id uuid not null references public.request_lines(id) on delete restrict,
  decision public.decision_state not null,
  approved_quantity integer not null default 0 check (approved_quantity >= 0),
  approved_start timestamptz,
  approved_end timestamptz,
  reason text,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((decision in ('approved','reduced')) = (approved_quantity > 0)),
  check (approved_end is null or approved_start is null or approved_end > approved_start),
  check (decision = 'approved' or reason is not null)
);
create index request_decisions_line_created_idx on public.request_line_decisions (request_line_id, created_at desc);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete restrict,
  borrower_id uuid not null references public.profiles(id) on delete restrict,
  status public.reservation_state not null default 'reserved',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  pickup_deadline timestamptz not null,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (pickup_deadline >= starts_at)
);
create index reservations_borrower_status_idx on public.reservations (borrower_id, status, starts_at);
create index reservations_pickup_deadline_idx on public.reservations (pickup_deadline) where status in ('reserved','ready_for_pickup');

create table public.reservation_lines (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete restrict,
  request_line_id uuid not null references public.request_lines(id) on delete restrict,
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  individual_asset_id uuid references public.individual_assets(id) on delete restrict,
  approved_quantity integer not null check (approved_quantity > 0),
  remaining_quantity integer not null check (remaining_quantity >= 0 and remaining_quantity <= approved_quantity),
  unique (reservation_id, request_line_id)
);
create index reservation_lines_item_idx on public.reservation_lines (catalog_item_id, reservation_id);

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete restrict,
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  desired_start timestamptz not null,
  desired_end timestamptz not null,
  state text not null default 'waiting' check (state in ('waiting','offered','claimed','expired','cancelled','ineligible')),
  joined_at timestamptz not null default now(),
  check (desired_end > desired_start)
);
create index waitlist_order_idx on public.waitlist_entries (catalog_item_id, state, joined_at);

create table public.waitlist_claims (
  id uuid primary key default gen_random_uuid(),
  waitlist_entry_id uuid not null references public.waitlist_entries(id) on delete restrict,
  offered_quantity integer not null check (offered_quantity > 0),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now()
);
create index waitlist_claims_expiry_idx on public.waitlist_claims (expires_at) where claimed_at is null and expired_at is null;

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  borrower_id uuid not null references public.profiles(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete restrict,
  handler_id uuid not null references public.profiles(id) on delete restrict,
  handover_at timestamptz not null default now(),
  status public.loan_state not null default 'active',
  remarks text not null default '',
  created_at timestamptz not null default now()
);
create index loans_borrower_status_due_idx on public.loans (borrower_id, status, handover_at desc);

create table public.loan_lines (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  reservation_line_id uuid references public.reservation_lines(id) on delete restrict,
  individual_asset_id uuid references public.individual_assets(id) on delete restrict,
  issued_quantity integer not null check (issued_quantity > 0),
  unresolved_quantity integer not null check (unresolved_quantity >= 0 and unresolved_quantity <= issued_quantity),
  outgoing_condition public.condition_state not null,
  due_at timestamptz,
  version integer not null default 1,
  check ((due_at is null) = (unresolved_quantity = 0))
);
create index loan_lines_loan_idx on public.loan_lines (loan_id);
create index loan_lines_active_due_idx on public.loan_lines (due_at) where unresolved_quantity > 0;

create table public.extension_requests (
  id uuid primary key default gen_random_uuid(),
  loan_line_id uuid not null references public.loan_lines(id) on delete restrict,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  proposed_due_at timestamptz not null,
  member_reason text not null,
  decision text not null default 'pending' check (decision in ('pending','approved','rejected')),
  approver_id uuid references public.profiles(id) on delete restrict,
  decision_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index extension_requests_queue_idx on public.extension_requests (decision, created_at);

create table public.outage_reconciliations (
  id uuid primary key default gen_random_uuid(),
  manual_log_reference text not null unique,
  actual_event_at timestamptz not null,
  entered_at timestamptz not null default now(),
  entered_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  review_state text not null default 'pending' check (review_state in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz
);

create table public.return_events (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  receiver_id uuid not null references public.profiles(id) on delete restrict,
  actual_return_at timestamptz not null default now(),
  reconciliation_id uuid references public.outage_reconciliations(id) on delete restrict,
  remarks text not null default '',
  created_at timestamptz not null default now()
);
create index return_events_loan_idx on public.return_events (loan_id, created_at desc);

create table public.return_lines (
  id uuid primary key default gen_random_uuid(),
  return_event_id uuid not null references public.return_events(id) on delete restrict,
  loan_line_id uuid not null references public.loan_lines(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  incoming_condition public.condition_state not null,
  destination_location_id uuid references public.storage_locations(id) on delete restrict,
  routed_to_maintenance boolean not null default false
);
create index return_lines_event_idx on public.return_lines (return_event_id);
create index return_lines_loan_line_idx on public.return_lines (loan_line_id);

create table public.loss_resolutions (
  id uuid primary key default gen_random_uuid(),
  loan_line_id uuid not null references public.loan_lines(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  resolution text not null check (resolution in ('lost','written_off')),
  reason text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index loss_resolutions_loan_line_idx on public.loss_resolutions (loan_line_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null,
  title text not null,
  body text not null,
  related_entity_type text,
  related_entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  deduplication_key text not null unique,
  state public.delivery_state not null default 'pending',
  attempts smallint not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  terminal_error_class text,
  created_at timestamptz not null default now()
);
create index outbox_claim_idx on public.notification_outbox (state, next_attempt_at) where state in ('pending','processing');

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox(id) on delete restrict,
  provider_message_id text,
  attempt smallint not null check (attempt > 0),
  state public.delivery_state not null,
  error_class text,
  created_at timestamptz not null default now(),
  unique (outbox_id, attempt)
);
create index email_deliveries_outbox_idx on public.email_deliveries (outbox_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  contact_type text not null check (contact_type in ('equipment','club_leadership','app_support')),
  name text not null,
  responsibility text not null,
  institutional_email text not null,
  phone text,
  visibility text not null check (visibility in ('student','member','staff')),
  availability text not null default '',
  sort_order smallint not null default 0,
  active boolean not null default true
);

create table public.policy_values (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global','category','item')),
  scope_id uuid,
  key text not null,
  value jsonb not null,
  effective_from timestamptz not null default now(),
  changed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index policy_values_lookup_idx on public.policy_values (scope_type, scope_id, key, effective_from desc);

create table public.system_notices (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('information','warning','critical')),
  audience text not null check (audience in ('all','members','staff')),
  title text not null,
  body text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  check (ends_at is null or ends_at > starts_at)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text,
  request_id text,
  before_summary jsonb,
  after_summary jsonb,
  created_at timestamptz not null default now()
);
create index audit_target_created_idx on public.audit_events (target_type, target_id, created_at desc);
create index audit_actor_action_created_idx on public.audit_events (actor_id, action, created_at desc);

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  command text not null,
  key text not null,
  response jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (actor_id, command, key)
);
create index idempotency_created_idx on public.idempotency_keys (created_at);

create or replace function private.prevent_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit events are append-only';
end;
$$;

create trigger audit_events_append_only
before update or delete on public.audit_events
for each row execute function private.prevent_history_mutation();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','memberships','role_assignments','categories','catalog_items','catalog_aliases','catalog_tags','catalog_specifications','storage_locations','pool_balances','individual_assets','stock_adjustments','maintenance_events','requests','request_lines','request_line_decisions','reservations','reservation_lines','waitlist_entries','waitlist_claims','loans','loan_lines','extension_requests','outage_reconciliations','return_events','return_lines','loss_resolutions','notifications','notification_outbox','email_deliveries','contacts','policy_values','system_notices','audit_events','idempotency_keys'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
