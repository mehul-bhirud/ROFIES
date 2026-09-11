# Inventory Catalog CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an inventory manager or admin create, edit, archive/restore, permanently delete (when unused), and adjust stock for catalog items from the ROFIES Equipment Manager app, instead of needing direct database access.

**Architecture:** Nine new `security definer` Postgres functions in the `api` schema (one migration), wired through the existing generic `/api/commands/[command]` dispatcher with new Zod schemas, plus two new admin pages and two small client components built the same way as the existing `OperationForm`/`EquipmentPhotoUpload`.

**Tech Stack:** Next.js (App Router, server components + `"use client"` islands), Supabase Postgres (PL/pgSQL `security definer` functions, RLS, pgTAP tests), Zod v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-inventory-catalog-crud-design.md`

## Global Constraints

- Every new mutating SQL function is `security definer`, `set search_path = ''`, checks `private.has_capability(v_actor, 'inventory:manage')` first, uses `pg_advisory_xact_lock` + the `idempotency_keys` table exactly like `api.counter_issue`/`api.resolve_loss` (`supabase/migrations/202608080009_extended_lifecycle_commands.sql`), and writes one `audit_events` row.
- No new capability is introduced — everything is gated by the existing `inventory:manage` capability.
- No RLS policy changes and no new table grants — all new reads go through `security definer` RPCs (`api.catalog_item_detail`, `api.inventory_list`), matching how `api.search_catalog` already works; `categories` and `storage_locations` already have direct `select` grants + staff RLS policies, so those two are read directly via the Supabase client.
- `tracking_mode` is immutable after `create_catalog_item` — no update path may change it.
- `delete_catalog_item` only succeeds when the item has zero history (no `request_lines`, `stock_adjustments`, `maintenance_events`, `waitlist_entries`, `individual_assets` rows, and no `pool_balances` row with `quantity_on_hand > 0`); everything else must go through `archive_catalog_item` instead.
- Demo mode (`ROFIES_DEMO_MODE=true`, already set in `.env.local`) requires zero special-casing in the new code — the existing `/api/commands/[command]` route already fakes a committed response before touching Supabase, and every new query helper follows the same `env.demoMode` branch-to-fixture pattern `getCatalog` already uses.

---

### Task 1: SQL commands migration + pgTAP tests

**Files:**
- Create: `supabase/migrations/202609110001_catalog_item_commands.sql`
- Create: `supabase/tests/database/022_catalog_item_commands.test.sql`

**Interfaces:**
- Consumes: `private.has_capability(uuid, text)` (existing), `public.catalog_items`/`categories`/`catalog_tags`/`pool_balances`/`individual_assets`/`stock_adjustments`/`audit_events`/`idempotency_keys` (existing tables).
- Produces (for later tasks): `api.create_catalog_item(...)`, `api.update_catalog_item(...)`, `api.archive_catalog_item(uuid,text,text)`, `api.restore_catalog_item(uuid,text,text)`, `api.delete_catalog_item(uuid,text,text)`, `api.adjust_stock(uuid,uuid,text,integer,text,text)`, `api.add_individual_asset(uuid,text,uuid,text,text,text)`, `api.catalog_item_detail(uuid) returns jsonb`, `api.inventory_list() returns table(...)`.

- [ ] **Step 1: Write the failing pgTAP test file**

Create `supabase/tests/database/022_catalog_item_commands.test.sql`:

```sql
begin;
select plan(38);

select has_function('api','create_catalog_item',array['uuid','text','text','text','text','text','integer','integer','integer','integer','boolean','boolean','integer','date','text','date','numeric','jsonb','jsonb','text'],'catalog item create command exists');
select has_function('api','update_catalog_item',array['uuid','uuid','text','text','text','text','integer','integer','integer','integer','boolean','boolean','integer','date','text','date','numeric','jsonb','text','text'],'catalog item update command exists');
select has_function('api','archive_catalog_item',array['uuid','text','text'],'catalog item archive command exists');
select has_function('api','restore_catalog_item',array['uuid','text','text'],'catalog item restore command exists');
select has_function('api','delete_catalog_item',array['uuid','text','text'],'catalog item delete command exists');
select has_function('api','adjust_stock',array['uuid','uuid','text','integer','text','text'],'stock adjustment command exists');
select has_function('api','add_individual_asset',array['uuid','text','uuid','text','text','text'],'individual asset add command exists');
select has_function('api','catalog_item_detail',array['uuid'],'catalog item detail read command exists');
select has_function('api','inventory_list','staff inventory listing command exists');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select api.create_catalog_item('00000000-0000-0000-0000-000000000201','Unauthorized Item',null,'pooled_reusable',null,null,null,null,null,null,true,false,null,null,null,null,null,'[]'::jsonb,'[]'::jsonb,'create-test-unauth-0001')$$,
  '42501',null,'members without inventory:manage cannot create catalog items'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);

select lives_ok(
  $$select api.create_catalog_item(
    '00000000-0000-0000-0000-000000000201','Plan Test Pooled Item','A pooled test fixture','pooled_reusable',
    'Public remarks','Internal remarks',7,21,3,24,true,false,2,null,null,null,null,
    '["fixture","pooled"]'::jsonb,
    '[{"storage_location_id":"00000000-0000-0000-0000-000000000301","condition":"perfect","quantity":5}]'::jsonb,
    'create-test-0001'
  )$$,
  'inventory manager can create a pooled catalog item with opening stock'
);
select results_eq(
  $$select tracking_mode::text from public.catalog_items where name='Plan Test Pooled Item'$$,
  $$values ('pooled_reusable'::text)$$,
  'the created item has the requested tracking mode'
);
select results_eq(
  $$select quantity_on_hand from public.pool_balances where catalog_item_id=(select id from public.catalog_items where name='Plan Test Pooled Item') and storage_location_id='00000000-0000-0000-0000-000000000301' and condition='perfect'$$,
  $$values (5)$$,
  'the opening stock created the expected pool balance'
);
select results_eq(
  $$select count(*)::bigint from public.stock_adjustments where catalog_item_id=(select id from public.catalog_items where name='Plan Test Pooled Item')$$,
  $$values (1::bigint)$$,
  'the opening stock recorded one acquisition adjustment'
);
select lives_ok(
  $$select api.create_catalog_item('00000000-0000-0000-0000-000000000201','Plan Test Pooled Item','A pooled test fixture','pooled_reusable','Public remarks','Internal remarks',7,21,3,24,true,false,2,null,null,null,null,'["fixture","pooled"]'::jsonb,'[{"storage_location_id":"00000000-0000-0000-0000-000000000301","condition":"perfect","quantity":5}]'::jsonb,'create-test-0001')$$,
  'replaying the same idempotency key does not error'
);
select results_eq(
  $$select count(*)::bigint from public.catalog_items where name='Plan Test Pooled Item'$$,
  $$values (1::bigint)$$,
  'replaying the same idempotency key did not create a duplicate item'
);
select throws_ok(
  $$select api.create_catalog_item('00000000-0000-0000-0000-000000000201','Bad Loan Days',null,'pooled_reusable',null,null,10,5,null,null,true,false,null,null,null,null,null,'[]'::jsonb,'[]'::jsonb,'create-test-baddays-0001')$$,
  'P0001',null,'maximum loan days below default loan days is rejected'
);

select lives_ok(
  $$select api.update_catalog_item(
    (select id from public.catalog_items where name='Plan Test Pooled Item'),
    '00000000-0000-0000-0000-000000000201','Plan Test Pooled Item Renamed','Updated description',
    'Updated public remarks','Updated internal remarks',7,21,3,24,true,false,2,null,null,null,null,
    '["fixture","pooled","renamed"]'::jsonb,'Renamed during test','update-test-0001'
  )$$,
  'inventory manager can update catalog item metadata'
);
select results_eq(
  $$select name from public.catalog_items where name='Plan Test Pooled Item Renamed'$$,
  $$values ('Plan Test Pooled Item Renamed'::text)$$,
  'catalog item name reflects the update'
);

select lives_ok(
  $$select api.archive_catalog_item((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'Retiring test fixture','archive-test-0001')$$,
  'inventory manager can archive a catalog item'
);
select results_eq(
  $$select archived_at is not null from public.catalog_items where name='Plan Test Pooled Item Renamed'$$,
  $$values (true)$$,
  'archived item has archived_at set'
);
select results_eq(
  $$select archived_at is not null from api.inventory_list() where name='Plan Test Pooled Item Renamed'$$,
  $$values (true)$$,
  'the staff inventory list includes archived items'
);
select throws_ok(
  $$select api.archive_catalog_item((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'Retry','archive-test-0002')$$,
  'P0001',null,'archiving an already-archived item is rejected'
);
select lives_ok(
  $$select api.restore_catalog_item((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'Bringing fixture back','restore-test-0001')$$,
  'inventory manager can restore an archived catalog item'
);
select results_eq(
  $$select archived_at is null from public.catalog_items where name='Plan Test Pooled Item Renamed'$$,
  $$values (true)$$,
  'restored item no longer has archived_at set'
);

select lives_ok(
  $$select api.adjust_stock((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'00000000-0000-0000-0000-000000000301','perfect',3,'Extra units received','adjust-test-0001')$$,
  'inventory manager can add stock to a pooled item'
);
select results_eq(
  $$select quantity_on_hand from public.pool_balances where catalog_item_id=(select id from public.catalog_items where name='Plan Test Pooled Item Renamed') and storage_location_id='00000000-0000-0000-0000-000000000301' and condition='perfect'$$,
  $$values (8)$$,
  'stock quantity reflects the opening balance plus the adjustment'
);
select throws_ok(
  $$select api.adjust_stock((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'00000000-0000-0000-0000-000000000301','perfect',-100,'Too many removed','adjust-test-0002')$$,
  'P0001',null,'a correction that would go negative is rejected'
);
select throws_ok(
  $$select api.adjust_stock('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000301','perfect',1,'Should be rejected','adjust-test-0003')$$,
  'P0001',null,'stock adjustments are rejected for individual-asset items'
);

select lives_ok(
  $$select api.add_individual_asset('00000000-0000-0000-0000-000000000103','RN-JET-02','00000000-0000-0000-0000-000000000301','perfect','Second unit acquired','asset-test-0001')$$,
  'inventory manager can add a unit to an individual-asset item'
);
select results_eq(
  $$select count(*)::bigint from public.individual_assets where catalog_item_id='00000000-0000-0000-0000-000000000103'$$,
  $$values (2::bigint)$$,
  'the individual-asset item now has two units on record'
);

select throws_ok(
  $$select api.delete_catalog_item('00000000-0000-0000-0000-000000000101','Attempting to delete a used item','delete-test-0001')$$,
  'P0001',null,'an item with request history cannot be permanently deleted'
);
select throws_ok(
  $$select api.delete_catalog_item((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'Attempting to delete a stocked item','delete-test-0002')$$,
  'P0001',null,'an item with stock adjustment history cannot be permanently deleted'
);
select lives_ok(
  $$select api.create_catalog_item('00000000-0000-0000-0000-000000000204','Plan Test Empty Draft',null,'consumable',null,null,null,null,null,null,true,false,null,null,null,null,null,'[]'::jsonb,'[]'::jsonb,'create-test-draft-0001')$$,
  'inventory manager can create a draft item with no opening stock'
);
select lives_ok(
  $$select api.delete_catalog_item((select id from public.catalog_items where name='Plan Test Empty Draft'),'Removing unused draft','delete-test-0003')$$,
  'an unused draft item can be permanently deleted'
);
select results_eq(
  $$select count(*)::bigint from public.catalog_items where name='Plan Test Empty Draft'$$,
  $$values (0::bigint)$$,
  'the deleted draft no longer exists'
);

select results_eq(
  $$select (api.catalog_item_detail((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'))->>'name')$$,
  $$values ('Plan Test Pooled Item Renamed'::text)$$,
  'catalog_item_detail returns the current name'
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select api.catalog_item_detail('00000000-0000-0000-0000-000000000101')$$,
  '42501',null,'members without inventory:manage cannot read catalog item detail'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm db:start` (if not already running), then `pnpm test:db`
Expected: FAIL — `has_function` assertions fail because none of the `api.*` functions exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202609110001_catalog_item_commands.sql`:

```sql
create or replace function api.create_catalog_item(
  category_id uuid, name text, description text, tracking_mode text,
  public_remarks text, internal_remarks text, default_loan_days integer,
  maximum_loan_days integer, member_quantity_limit integer,
  pickup_window_hours integer, waitlist_enabled boolean,
  counter_issue_enabled boolean, low_stock_threshold integer,
  acquisition_date date, supplier text, warranty_until date,
  replacement_cost numeric, tags jsonb, opening_units jsonb,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing jsonb;
  v_item_id uuid;
  v_return_required boolean;
  v_tag text;
  v_unit jsonb;
  v_location uuid;
  v_condition public.condition_state;
  v_quantity integer;
  v_asset_id uuid;
  v_result jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'inventory:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  if tracking_mode not in ('pooled_reusable','individual_asset','consumable') then
    raise exception 'invalid tracking mode';
  end if;
  if maximum_loan_days is not null and default_loan_days is not null and maximum_loan_days < default_loan_days then
    raise exception 'maximum loan days must be at least default loan days';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':create_catalog_item:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys
    where actor_id=v_actor and command='create_catalog_item' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;

  v_return_required := (tracking_mode <> 'consumable');

  insert into public.catalog_items(
    category_id, name, description, tracking_mode, return_required,
    public_remarks, internal_remarks, default_loan_days, maximum_loan_days,
    member_quantity_limit, pickup_window_hours, waitlist_enabled,
    counter_issue_enabled, low_stock_threshold, acquisition_date, supplier,
    warranty_until, replacement_cost, created_by
  ) values (
    create_catalog_item.category_id, create_catalog_item.name, coalesce(create_catalog_item.description,''),
    create_catalog_item.tracking_mode::public.tracking_mode, v_return_required,
    coalesce(create_catalog_item.public_remarks,''), coalesce(create_catalog_item.internal_remarks,''),
    create_catalog_item.default_loan_days, create_catalog_item.maximum_loan_days,
    create_catalog_item.member_quantity_limit, create_catalog_item.pickup_window_hours,
    coalesce(create_catalog_item.waitlist_enabled,true), coalesce(create_catalog_item.counter_issue_enabled,false),
    create_catalog_item.low_stock_threshold, create_catalog_item.acquisition_date, create_catalog_item.supplier,
    create_catalog_item.warranty_until, create_catalog_item.replacement_cost, v_actor
  ) returning id into v_item_id;

  for v_tag in select value from jsonb_array_elements_text(coalesce(tags,'[]'::jsonb)) loop
    insert into public.catalog_tags(catalog_item_id, tag) values (v_item_id, v_tag)
      on conflict (catalog_item_id, tag) do nothing;
  end loop;

  for v_unit in select value from jsonb_array_elements(coalesce(opening_units,'[]'::jsonb)) loop
    v_location := nullif(v_unit->>'storage_location_id','')::uuid;
    v_condition := coalesce(v_unit->>'condition','perfect')::public.condition_state;
    if tracking_mode = 'individual_asset' then
      insert into public.individual_assets(catalog_item_id, local_identifier, condition, custody_state, storage_location_id)
        values (v_item_id, nullif(v_unit->>'local_identifier',''), v_condition, 'on_hand', v_location)
        returning id into v_asset_id;
      insert into public.stock_adjustments(catalog_item_id, individual_asset_id, condition_to, quantity_delta, reason, source, actor_id)
        values (v_item_id, v_asset_id, v_condition, 1, 'Opening stock recorded at item creation', 'acquisition', v_actor);
    else
      v_quantity := (v_unit->>'quantity')::integer;
      if v_quantity is null or v_quantity <= 0 then
        raise exception 'opening quantity must be a positive number';
      end if;
      insert into public.pool_balances(catalog_item_id, storage_location_id, condition, quantity_on_hand)
        values (v_item_id, v_location, v_condition, v_quantity)
        on conflict (catalog_item_id, storage_location_id, condition)
        do update set quantity_on_hand = public.pool_balances.quantity_on_hand + excluded.quantity_on_hand,
                      version = public.pool_balances.version + 1;
      insert into public.stock_adjustments(catalog_item_id, condition_to, quantity_delta, reason, source, actor_id)
        values (v_item_id, v_condition, v_quantity, 'Opening stock recorded at item creation', 'acquisition', v_actor);
    end if;
  end loop;

  insert into public.audit_events(actor_id, action, target_type, target_id, reason)
    values (v_actor, 'catalog_item.created', 'catalog_item', v_item_id, 'Created via inventory admin');
  v_result := jsonb_build_object('catalog_item_id', v_item_id, 'status', 'committed');
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at)
    values (v_actor, 'create_catalog_item', idempotency_key, v_result, now());
  return v_result;
end;
$$;

create or replace function api.update_catalog_item(
  catalog_item_id uuid, category_id uuid, name text, description text,
  public_remarks text, internal_remarks text, default_loan_days integer,
  maximum_loan_days integer, member_quantity_limit integer,
  pickup_window_hours integer, waitlist_enabled boolean,
  counter_issue_enabled boolean, low_stock_threshold integer,
  acquisition_date date, supplier text, warranty_until date,
  replacement_cost numeric, tags jsonb, reason text, idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing jsonb;
  v_found boolean;
  v_tag text;
  v_result jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'inventory:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  if maximum_loan_days is not null and default_loan_days is not null and maximum_loan_days < default_loan_days then
    raise exception 'maximum loan days must be at least default loan days';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':update_catalog_item:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys
    where actor_id=v_actor and command='update_catalog_item' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select true into v_found from public.catalog_items where id=update_catalog_item.catalog_item_id for update;
  if not found then raise exception 'catalog item not found'; end if;

  update public.catalog_items set
    category_id = update_catalog_item.category_id,
    name = update_catalog_item.name,
    description = coalesce(update_catalog_item.description,''),
    public_remarks = coalesce(update_catalog_item.public_remarks,''),
    internal_remarks = coalesce(update_catalog_item.internal_remarks,''),
    default_loan_days = update_catalog_item.default_loan_days,
    maximum_loan_days = update_catalog_item.maximum_loan_days,
    member_quantity_limit = update_catalog_item.member_quantity_limit,
    pickup_window_hours = update_catalog_item.pickup_window_hours,
    waitlist_enabled = coalesce(update_catalog_item.waitlist_enabled,true),
    counter_issue_enabled = coalesce(update_catalog_item.counter_issue_enabled,false),
    low_stock_threshold = update_catalog_item.low_stock_threshold,
    acquisition_date = update_catalog_item.acquisition_date,
    supplier = update_catalog_item.supplier,
    warranty_until = update_catalog_item.warranty_until,
    replacement_cost = update_catalog_item.replacement_cost,
    updated_at = now()
  where id = update_catalog_item.catalog_item_id;

  delete from public.catalog_tags where catalog_item_id = update_catalog_item.catalog_item_id;
  for v_tag in select value from jsonb_array_elements_text(coalesce(tags,'[]'::jsonb)) loop
    insert into public.catalog_tags(catalog_item_id, tag) values (update_catalog_item.catalog_item_id, v_tag)
      on conflict (catalog_item_id, tag) do nothing;
  end loop;

  insert into public.audit_events(actor_id, action, target_type, target_id, reason)
    values (v_actor, 'catalog_item.updated', 'catalog_item', update_catalog_item.catalog_item_id, reason);
  v_result := jsonb_build_object('catalog_item_id', update_catalog_item.catalog_item_id, 'status', 'committed');
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at)
    values (v_actor, 'update_catalog_item', idempotency_key, v_result, now());
  return v_result;
end;
$$;

create or replace function api.archive_catalog_item(catalog_item_id uuid, reason text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_existing jsonb; v_result jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'inventory:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':archive_catalog_item:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys
    where actor_id=v_actor and command='archive_catalog_item' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;

  update public.catalog_items set archived_at = now(), updated_at = now()
    where id = archive_catalog_item.catalog_item_id and archived_at is null;
  if not found then raise exception 'catalog item not found or already archived'; end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, reason)
    values (v_actor, 'catalog_item.archived', 'catalog_item', archive_catalog_item.catalog_item_id, reason);
  v_result := jsonb_build_object('catalog_item_id', archive_catalog_item.catalog_item_id, 'status', 'committed');
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at)
    values (v_actor, 'archive_catalog_item', idempotency_key, v_result, now());
  return v_result;
end;
$$;

create or replace function api.restore_catalog_item(catalog_item_id uuid, reason text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_existing jsonb; v_result jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'inventory:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':restore_catalog_item:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys
    where actor_id=v_actor and command='restore_catalog_item' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;

  update public.catalog_items set archived_at = null, updated_at = now()
    where id = restore_catalog_item.catalog_item_id and archived_at is not null;
  if not found then raise exception 'catalog item not found or not archived'; end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, reason)
    values (v_actor, 'catalog_item.restored', 'catalog_item', restore_catalog_item.catalog_item_id, reason);
  v_result := jsonb_build_object('catalog_item_id', restore_catalog_item.catalog_item_id, 'status', 'committed');
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at)
    values (v_actor, 'restore_catalog_item', idempotency_key, v_result, now());
  return v_result;
end;
$$;

create or replace function api.delete_catalog_item(catalog_item_id uuid, reason text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing jsonb;
  v_item public.catalog_items%rowtype;
  v_result jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'inventory:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':delete_catalog_item:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys
    where actor_id=v_actor and command='delete_catalog_item' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select * into v_item from public.catalog_items where id=delete_catalog_item.catalog_item_id for update;
  if not found then raise exception 'catalog item not found'; end if;

  if exists(select 1 from public.request_lines where catalog_item_id=delete_catalog_item.catalog_item_id)
    or exists(select 1 from public.stock_adjustments where catalog_item_id=delete_catalog_item.catalog_item_id)
    or exists(select 1 from public.maintenance_events where catalog_item_id=delete_catalog_item.catalog_item_id)
    or exists(select 1 from public.waitlist_entries where catalog_item_id=delete_catalog_item.catalog_item_id)
    or exists(select 1 from public.individual_assets where catalog_item_id=delete_catalog_item.catalog_item_id)
    or exists(select 1 from public.pool_balances where catalog_item_id=delete_catalog_item.catalog_item_id and quantity_on_hand>0)
  then
    raise exception 'catalog item has history and cannot be permanently deleted; archive it instead' using errcode='P0001';
  end if;

  delete from public.pool_balances where catalog_item_id = delete_catalog_item.catalog_item_id;
  delete from public.catalog_items where id = delete_catalog_item.catalog_item_id;

  insert into public.audit_events(actor_id, action, target_type, target_id, reason, before_summary)
    values (v_actor, 'catalog_item.deleted', 'catalog_item', delete_catalog_item.catalog_item_id, reason, to_jsonb(v_item));
  v_result := jsonb_build_object('catalog_item_id', delete_catalog_item.catalog_item_id, 'status', 'committed');
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at)
    values (v_actor, 'delete_catalog_item', idempotency_key, v_result, now());
  return v_result;
end;
$$;

create or replace function api.adjust_stock(
  catalog_item_id uuid, storage_location_id uuid, condition text,
  quantity_delta integer, reason text, idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing jsonb;
  v_item public.catalog_items%rowtype;
  v_condition public.condition_state := condition::public.condition_state;
  v_balance public.pool_balances%rowtype;
  v_source text;
  v_result jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'inventory:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  if quantity_delta = 0 then raise exception 'quantity delta must not be zero'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':adjust_stock:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys
    where actor_id=v_actor and command='adjust_stock' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select * into v_item from public.catalog_items where id=adjust_stock.catalog_item_id for update;
  if not found or v_item.tracking_mode = 'individual_asset' then
    raise exception 'stock adjustments are only for pooled or consumable items';
  end if;

  select * into v_balance from public.pool_balances
    where pool_balances.catalog_item_id=adjust_stock.catalog_item_id
      and pool_balances.storage_location_id is not distinct from adjust_stock.storage_location_id
      and pool_balances.condition=v_condition
    for update;
  if found then
    if v_balance.quantity_on_hand + quantity_delta < 0 then
      raise exception 'insufficient stock for this adjustment';
    end if;
    update public.pool_balances set quantity_on_hand = quantity_on_hand + quantity_delta, version = version + 1
      where id = v_balance.id;
  else
    if quantity_delta < 0 then raise exception 'insufficient stock for this adjustment'; end if;
    insert into public.pool_balances(catalog_item_id, storage_location_id, condition, quantity_on_hand)
      values (adjust_stock.catalog_item_id, adjust_stock.storage_location_id, v_condition, quantity_delta);
  end if;

  v_source := case when quantity_delta > 0 then 'acquisition' else 'correction' end;
  insert into public.stock_adjustments(catalog_item_id, condition_to, quantity_delta, reason, source, actor_id)
    values (adjust_stock.catalog_item_id, v_condition, quantity_delta, reason, v_source, v_actor);

  insert into public.audit_events(actor_id, action, target_type, target_id, reason)
    values (v_actor, 'stock.adjusted', 'catalog_item', adjust_stock.catalog_item_id, reason);
  v_result := jsonb_build_object('catalog_item_id', adjust_stock.catalog_item_id, 'status', 'committed');
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at)
    values (v_actor, 'adjust_stock', idempotency_key, v_result, now());
  return v_result;
end;
$$;

create or replace function api.add_individual_asset(
  catalog_item_id uuid, local_identifier text, storage_location_id uuid,
  condition text, reason text, idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing jsonb;
  v_item public.catalog_items%rowtype;
  v_condition public.condition_state := coalesce(condition,'perfect')::public.condition_state;
  v_asset_id uuid;
  v_result jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'inventory:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':add_individual_asset:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys
    where actor_id=v_actor and command='add_individual_asset' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select * into v_item from public.catalog_items where id=add_individual_asset.catalog_item_id for update;
  if not found or v_item.tracking_mode <> 'individual_asset' then
    raise exception 'individual assets can only be added to individual-asset items';
  end if;

  insert into public.individual_assets(catalog_item_id, local_identifier, condition, custody_state, storage_location_id)
    values (add_individual_asset.catalog_item_id, nullif(add_individual_asset.local_identifier,''), v_condition, 'on_hand', add_individual_asset.storage_location_id)
    returning id into v_asset_id;

  insert into public.stock_adjustments(catalog_item_id, individual_asset_id, condition_to, quantity_delta, reason, source, actor_id)
    values (add_individual_asset.catalog_item_id, v_asset_id, v_condition, 1, reason, 'acquisition', v_actor);

  insert into public.audit_events(actor_id, action, target_type, target_id, reason)
    values (v_actor, 'individual_asset.added', 'individual_asset', v_asset_id, reason);
  v_result := jsonb_build_object('individual_asset_id', v_asset_id, 'status', 'committed');
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at)
    values (v_actor, 'add_individual_asset', idempotency_key, v_result, now());
  return v_result;
end;
$$;

create or replace function api.catalog_item_detail(catalog_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'category_id', i.category_id, 'name', i.name, 'description', i.description,
    'tracking_mode', i.tracking_mode, 'public_remarks', i.public_remarks, 'internal_remarks', i.internal_remarks,
    'default_loan_days', i.default_loan_days, 'maximum_loan_days', i.maximum_loan_days,
    'member_quantity_limit', i.member_quantity_limit, 'pickup_window_hours', i.pickup_window_hours,
    'waitlist_enabled', i.waitlist_enabled, 'counter_issue_enabled', i.counter_issue_enabled,
    'low_stock_threshold', i.low_stock_threshold, 'acquisition_date', i.acquisition_date,
    'supplier', i.supplier, 'warranty_until', i.warranty_until, 'replacement_cost', i.replacement_cost,
    'archived_at', i.archived_at,
    'tags', coalesce((select jsonb_agg(t.tag order by t.tag) from public.catalog_tags t where t.catalog_item_id=i.id),'[]'::jsonb)
  )
  from public.catalog_items i
  where i.id = catalog_item_detail.catalog_item_id
    and private.has_capability((select auth.uid()),'inventory:manage');
$$;

create or replace function api.inventory_list()
returns table (
  id uuid,
  name text,
  category_name text,
  tracking_mode public.tracking_mode,
  archived_at timestamptz,
  usable_on_hand integer,
  repair_quantity integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.name, c.name, i.tracking_mode, i.archived_at,
    case when i.tracking_mode='individual_asset'
      then (select count(*) from public.individual_assets a where a.catalog_item_id=i.id and a.archived_at is null and a.custody_state='on_hand' and a.condition in ('perfect','minor_damage'))
      else (select coalesce(sum(b.quantity_on_hand),0) from public.pool_balances b where b.catalog_item_id=i.id and b.condition in ('perfect','minor_damage')) end::integer,
    case when i.tracking_mode='individual_asset'
      then (select count(*) from public.individual_assets a where a.catalog_item_id=i.id and a.archived_at is null and a.condition in ('repair_required','not_working'))
      else (select coalesce(sum(b.quantity_on_hand),0) from public.pool_balances b where b.catalog_item_id=i.id and b.condition in ('repair_required','not_working')) end::integer
  from public.catalog_items i
  join public.categories c on c.id=i.category_id
  where private.has_capability((select auth.uid()),'inventory:manage')
  order by i.archived_at nulls first, i.name, i.id;
$$;

revoke all on function
  api.create_catalog_item(uuid,text,text,text,text,text,integer,integer,integer,integer,boolean,boolean,integer,date,text,date,numeric,jsonb,jsonb,text),
  api.update_catalog_item(uuid,uuid,text,text,text,text,integer,integer,integer,integer,boolean,boolean,integer,date,text,date,numeric,jsonb,text,text),
  api.archive_catalog_item(uuid,text,text),
  api.restore_catalog_item(uuid,text,text),
  api.delete_catalog_item(uuid,text,text),
  api.adjust_stock(uuid,uuid,text,integer,text,text),
  api.add_individual_asset(uuid,text,uuid,text,text,text),
  api.catalog_item_detail(uuid),
  api.inventory_list()
from public, anon;
grant execute on function
  api.create_catalog_item(uuid,text,text,text,text,text,integer,integer,integer,integer,boolean,boolean,integer,date,text,date,numeric,jsonb,jsonb,text),
  api.update_catalog_item(uuid,uuid,text,text,text,text,integer,integer,integer,integer,boolean,boolean,integer,date,text,date,numeric,jsonb,text,text),
  api.archive_catalog_item(uuid,text,text),
  api.restore_catalog_item(uuid,text,text),
  api.delete_catalog_item(uuid,text,text),
  api.adjust_stock(uuid,uuid,text,integer,text,text),
  api.add_individual_asset(uuid,text,uuid,text,text,text),
  api.catalog_item_detail(uuid),
  api.inventory_list()
to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm db:reset && pnpm test:db`
Expected: PASS — all 38 assertions green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202609110001_catalog_item_commands.sql supabase/tests/database/022_catalog_item_commands.test.sql
git commit -m "feat(db): add catalog item CRUD, stock adjustment, and staff inventory read commands"
```

---

### Task 2: Zod command schemas + unit tests

**Files:**
- Modify: `src/lib/validation/commands.ts`
- Modify: `tests/unit/boundaries.test.ts`

**Interfaces:**
- Consumes: `boundedText`, `databaseId` (existing helpers in the same file).
- Produces: `createCatalogItemCommandSchema`, `updateCatalogItemCommandSchema`, `archiveCatalogItemCommandSchema`, `restoreCatalogItemCommandSchema`, `deleteCatalogItemCommandSchema`, `adjustStockCommandSchema`, `addIndividualAssetCommandSchema` — all exported from `@/lib/validation/commands`, all requiring an `idempotencyKey: string` field, consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/boundaries.test.ts`, updating the import line at the top:

```ts
import {
  adjustStockCommandSchema,
  createCatalogItemCommandSchema,
  deleteCatalogItemCommandSchema,
  handoverCommandSchema,
  requestCommandSchema,
  updateCatalogItemCommandSchema
} from "@/lib/validation/commands";
```

Add a new `it` block inside the existing `describe("server boundaries", ...)`:

```ts
  it("validates catalog item create/update/delete/adjust-stock command shapes", () => {
    expect(
      createCatalogItemCommandSchema.safeParse({
        categoryId: "00000000-0000-0000-0000-000000000201",
        name: "Bench Multimeter",
        trackingMode: "pooled_reusable",
        openingUnits: [
          {
            storageLocationId: "00000000-0000-0000-0000-000000000301",
            condition: "perfect",
            quantity: 4
          }
        ],
        idempotencyKey: "create-catalog-item-0001"
      }).success
    ).toBe(true);
    expect(
      createCatalogItemCommandSchema.safeParse({
        categoryId: "00000000-0000-0000-0000-000000000201",
        name: "Bench Multimeter",
        trackingMode: "pooled_reusable",
        defaultLoanDays: 10,
        maximumLoanDays: 5,
        idempotencyKey: "create-catalog-item-0002"
      }).success
    ).toBe(false);
    expect(
      updateCatalogItemCommandSchema.safeParse({
        catalogItemId: "00000000-0000-0000-0000-000000000101",
        categoryId: "00000000-0000-0000-0000-000000000201",
        name: "Arduino Mega 2560",
        reason: "Corrected the public remarks",
        idempotencyKey: "update-catalog-item-0001"
      }).success
    ).toBe(true);
    expect(
      deleteCatalogItemCommandSchema.safeParse({
        catalogItemId: "bad-id",
        reason: "x",
        idempotencyKey: "delete-catalog-item-0001"
      }).success
    ).toBe(false);
    expect(
      adjustStockCommandSchema.safeParse({
        catalogItemId: "00000000-0000-0000-0000-000000000101",
        condition: "perfect",
        quantityDelta: 0,
        reason: "Recount after audit",
        idempotencyKey: "adjust-stock-0001"
      }).success
    ).toBe(false);
    expect(
      adjustStockCommandSchema.safeParse({
        catalogItemId: "00000000-0000-0000-0000-000000000101",
        condition: "perfect",
        quantityDelta: -2,
        reason: "Recount after audit",
        idempotencyKey: "adjust-stock-0002"
      }).success
    ).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- boundaries`
Expected: FAIL with "createCatalogItemCommandSchema is not defined" (or a TypeScript compile error naming the missing export).

- [ ] **Step 3: Write the schemas**

Append to `src/lib/validation/commands.ts`:

```ts
const catalogCondition = z.enum(["perfect", "minor_damage", "repair_required", "not_working"]);

const catalogItemMetadataFields = {
  categoryId: databaseId,
  name: boundedText(2, 160),
  description: boundedText(0, 4000).optional(),
  publicRemarks: boundedText(0, 2000).optional(),
  internalRemarks: boundedText(0, 4000).optional(),
  defaultLoanDays: z.number().int().min(1).max(90).optional(),
  maximumLoanDays: z.number().int().min(1).max(180).optional(),
  memberQuantityLimit: z.number().int().min(1).optional(),
  pickupWindowHours: z.number().int().min(1).max(168).optional(),
  waitlistEnabled: z.boolean().default(true),
  counterIssueEnabled: z.boolean().default(false),
  lowStockThreshold: z.number().int().min(0).optional(),
  acquisitionDate: z.iso.date().optional(),
  supplier: boundedText(1, 200).optional(),
  warrantyUntil: z.iso.date().optional(),
  replacementCost: z.number().min(0).optional(),
  tags: z.array(boundedText(1, 60)).max(20).default([])
};

function loanDaysOrdered(value: { defaultLoanDays?: number; maximumLoanDays?: number }) {
  return (
    value.maximumLoanDays === undefined ||
    value.defaultLoanDays === undefined ||
    value.maximumLoanDays >= value.defaultLoanDays
  );
}

export const createCatalogItemCommandSchema = z
  .object({
    ...catalogItemMetadataFields,
    trackingMode: z.enum(["pooled_reusable", "individual_asset", "consumable"]),
    openingUnits: z
      .array(
        z.object({
          storageLocationId: databaseId.optional(),
          condition: catalogCondition.default("perfect"),
          quantity: z.number().int().min(1).max(1000).optional(),
          localIdentifier: boundedText(1, 120).optional()
        })
      )
      .max(50)
      .default([]),
    idempotencyKey: boundedText(12, 120)
  })
  .refine(loanDaysOrdered, {
    message: "Maximum loan days must be at least default loan days",
    path: ["maximumLoanDays"]
  });

export const updateCatalogItemCommandSchema = z
  .object({
    catalogItemId: databaseId,
    ...catalogItemMetadataFields,
    reason: boundedText(3, 1000),
    idempotencyKey: boundedText(12, 120)
  })
  .refine(loanDaysOrdered, {
    message: "Maximum loan days must be at least default loan days",
    path: ["maximumLoanDays"]
  });

export const archiveCatalogItemCommandSchema = z.object({
  catalogItemId: databaseId,
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const restoreCatalogItemCommandSchema = archiveCatalogItemCommandSchema;

export const deleteCatalogItemCommandSchema = z.object({
  catalogItemId: databaseId,
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const adjustStockCommandSchema = z.object({
  catalogItemId: databaseId,
  storageLocationId: databaseId.optional(),
  condition: catalogCondition,
  quantityDelta: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((value) => value !== 0, { message: "Quantity delta must not be zero" }),
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const addIndividualAssetCommandSchema = z.object({
  catalogItemId: databaseId,
  localIdentifier: boundedText(1, 120).optional(),
  storageLocationId: databaseId.optional(),
  condition: catalogCondition.default("perfect"),
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- boundaries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/commands.ts tests/unit/boundaries.test.ts
git commit -m "feat(validation): add zod schemas for catalog item CRUD and stock commands"
```

---

### Task 3: Route wiring for the new commands

**Files:**
- Modify: `src/app/api/commands/[command]/route.ts`

**Interfaces:**
- Consumes: the 7 schemas from Task 2, the 7 mutating RPC functions from Task 1.
- Produces: `POST /api/commands/createCatalogItem`, `.../updateCatalogItem`, `.../archiveCatalogItem`, `.../restoreCatalogItem`, `.../deleteCatalogItem`, `.../adjustStock`, `.../addIndividualAsset` — consumed by Task 5 and Task 6's client components.

- [ ] **Step 1: Write the failing test**

There is no existing per-branch unit test for this route (the other nine commands aren't tested here either — coverage for the route lives in the pgTAP suite via the RPCs it calls, already green from Task 1, and in `tests/e2e`). Confirm this task's only verification gate is the manual demo-mode check, by first confirming the new command names 404 today:

Run: `pnpm dev` (in one terminal), then in another:
```bash
curl -s -X POST http://localhost:3000/api/commands/createCatalogItem -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{}'
```
Expected: `{"message":"Command unavailable.","referenceId":"..."}` with a 404 status (the command key isn't in the `schemas` map yet).

- [ ] **Step 2: Wire the schemas and branches**

In `src/app/api/commands/[command]/route.ts`, update the import block:

```ts
import {
  addIndividualAssetCommandSchema,
  adjustStockCommandSchema,
  archiveCatalogItemCommandSchema,
  cancelRequestCommandSchema,
  counterIssueCommandSchema,
  createCatalogItemCommandSchema,
  decisionCommandSchema,
  deleteCatalogItemCommandSchema,
  extensionDecisionCommandSchema,
  extensionRequestCommandSchema,
  handoverCommandSchema,
  lossResolutionCommandSchema,
  memberDecisionCommandSchema,
  requestCommandSchema,
  restoreCatalogItemCommandSchema,
  returnCommandSchema,
  updateCatalogItemCommandSchema,
  waitlistCommandSchema
} from "@/lib/validation/commands";
```

Extend the `schemas` map:

```ts
const schemas = {
  request: requestCommandSchema,
  decision: decisionCommandSchema,
  handover: handoverCommandSchema,
  return: returnCommandSchema,
  cancel: cancelRequestCommandSchema,
  waitlist: waitlistCommandSchema,
  extension: extensionRequestCommandSchema,
  extensionDecision: extensionDecisionCommandSchema,
  counterIssue: counterIssueCommandSchema,
  loss: lossResolutionCommandSchema,
  memberDecision: memberDecisionCommandSchema,
  createCatalogItem: createCatalogItemCommandSchema,
  updateCatalogItem: updateCatalogItemCommandSchema,
  archiveCatalogItem: archiveCatalogItemCommandSchema,
  restoreCatalogItem: restoreCatalogItemCommandSchema,
  deleteCatalogItem: deleteCatalogItemCommandSchema,
  adjustStock: adjustStockCommandSchema,
  addIndividualAsset: addIndividualAssetCommandSchema
};
```

Add branches before the trailing `else { const value = memberDecisionCommandSchema... }` block (i.e. insert these as additional `else if` clauses, keeping `memberDecision` as the final `else`):

```ts
  } else if (command === "createCatalogItem") {
    const value = createCatalogItemCommandSchema.parse(body);
    result = await client.schema("api").rpc("create_catalog_item", {
      category_id: value.categoryId,
      name: value.name,
      description: value.description ?? "",
      tracking_mode: value.trackingMode,
      public_remarks: value.publicRemarks ?? "",
      internal_remarks: value.internalRemarks ?? "",
      default_loan_days: value.defaultLoanDays ?? null,
      maximum_loan_days: value.maximumLoanDays ?? null,
      member_quantity_limit: value.memberQuantityLimit ?? null,
      pickup_window_hours: value.pickupWindowHours ?? null,
      waitlist_enabled: value.waitlistEnabled,
      counter_issue_enabled: value.counterIssueEnabled,
      low_stock_threshold: value.lowStockThreshold ?? null,
      acquisition_date: value.acquisitionDate ?? null,
      supplier: value.supplier ?? null,
      warranty_until: value.warrantyUntil ?? null,
      replacement_cost: value.replacementCost ?? null,
      tags: value.tags,
      opening_units: value.openingUnits.map((unit) => ({
        storage_location_id: unit.storageLocationId ?? null,
        condition: unit.condition,
        quantity: unit.quantity ?? null,
        local_identifier: unit.localIdentifier ?? null
      })),
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "updateCatalogItem") {
    const value = updateCatalogItemCommandSchema.parse(body);
    result = await client.schema("api").rpc("update_catalog_item", {
      catalog_item_id: value.catalogItemId,
      category_id: value.categoryId,
      name: value.name,
      description: value.description ?? "",
      public_remarks: value.publicRemarks ?? "",
      internal_remarks: value.internalRemarks ?? "",
      default_loan_days: value.defaultLoanDays ?? null,
      maximum_loan_days: value.maximumLoanDays ?? null,
      member_quantity_limit: value.memberQuantityLimit ?? null,
      pickup_window_hours: value.pickupWindowHours ?? null,
      waitlist_enabled: value.waitlistEnabled,
      counter_issue_enabled: value.counterIssueEnabled,
      low_stock_threshold: value.lowStockThreshold ?? null,
      acquisition_date: value.acquisitionDate ?? null,
      supplier: value.supplier ?? null,
      warranty_until: value.warrantyUntil ?? null,
      replacement_cost: value.replacementCost ?? null,
      tags: value.tags,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "archiveCatalogItem") {
    const value = archiveCatalogItemCommandSchema.parse(body);
    result = await client.schema("api").rpc("archive_catalog_item", {
      catalog_item_id: value.catalogItemId,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "restoreCatalogItem") {
    const value = restoreCatalogItemCommandSchema.parse(body);
    result = await client.schema("api").rpc("restore_catalog_item", {
      catalog_item_id: value.catalogItemId,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "deleteCatalogItem") {
    const value = deleteCatalogItemCommandSchema.parse(body);
    result = await client.schema("api").rpc("delete_catalog_item", {
      catalog_item_id: value.catalogItemId,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "adjustStock") {
    const value = adjustStockCommandSchema.parse(body);
    result = await client.schema("api").rpc("adjust_stock", {
      catalog_item_id: value.catalogItemId,
      storage_location_id: value.storageLocationId ?? null,
      condition: value.condition,
      quantity_delta: value.quantityDelta,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "addIndividualAsset") {
    const value = addIndividualAssetCommandSchema.parse(body);
    result = await client.schema("api").rpc("add_individual_asset", {
      catalog_item_id: value.catalogItemId,
      local_identifier: value.localIdentifier ?? null,
      storage_location_id: value.storageLocationId ?? null,
      condition: value.condition,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
```

Also extend the rate-limit call's `maximum` so bulk-editing a catalog isn't throttled at the tighter 10/min request-submission rate — the existing line already defaults to 30 for everything except `request`, so no change is needed there.

- [ ] **Step 3: Run the check to verify it passes**

Run: `pnpm dev`, then:
```bash
curl -s -X POST http://localhost:3000/api/commands/createCatalogItem -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"categoryId":"00000000-0000-0000-0000-000000000201","name":"Test","trackingMode":"pooled_reusable","idempotencyKey":"route-check-0001"}'
```
Expected (with `ROFIES_DEMO_MODE=true`, which is already set): `{"status":"committed","referenceId":"...","demo":true}`.

Also run `pnpm typecheck` — expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/commands/[command]/route.ts
git commit -m "feat(api): wire catalog item CRUD and stock commands into the command dispatcher"
```

---

### Task 4: Catalog types, demo fixtures, and staff query helpers

**Files:**
- Modify: `src/lib/catalog/types.ts`
- Modify: `src/lib/demo-data.ts`
- Modify: `src/lib/catalog/queries.ts`
- Create: `tests/unit/catalog-queries.test.ts`

**Interfaces:**
- Consumes: `getServerEnvironment` (`@/lib/env/server`), `createSupabaseServerClient` (`@/lib/supabase/server`), the `api.inventory_list()`/`api.catalog_item_detail(uuid)` RPCs from Task 1.
- Produces: types `Category`, `StorageLocation`, `InventoryListItem`, `CatalogItemDetail` (from `@/lib/catalog/types`); functions `getCategories()`, `getStorageLocations()`, `getInventoryListItems()`, `getCatalogItemForEdit(id: string)` (from `@/lib/catalog/queries`) — all consumed by Task 5 (form component), Task 6 (row actions), Task 7/8 (pages), Task 9 (inventory list page).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/catalog-queries.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  environment: {
    ROFIES_ENVIRONMENT: "test",
    demoMode: false,
    supabaseConfigured: true
  }
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => mocks.environment
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

import {
  getCategories,
  getCatalogItemForEdit,
  getInventoryListItems,
  getStorageLocations
} from "@/lib/catalog/queries";

describe("catalog admin query loaders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.environment.demoMode = false;
    mocks.environment.supabaseConfigured = true;
  });

  it("loads active categories ordered by name", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: "00000000-0000-0000-0000-000000000201", name: "Controllers" }],
      error: null
    });
    const is = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ is }));
    const from = vi.fn(() => ({ select }));
    mocks.createSupabaseServerClient.mockResolvedValue({ from });

    const categories = await getCategories();

    expect(from).toHaveBeenCalledWith("categories");
    expect(categories).toEqual([{ id: "00000000-0000-0000-0000-000000000201", name: "Controllers" }]);
  });

  it("loads active storage locations with a readable label", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "00000000-0000-0000-0000-000000000301",
          room: "Robotics Lab",
          cabinet: "Blue cabinet",
          shelf: "Shelf B",
          bin: "Bin 4"
        }
      ],
      error: null
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createSupabaseServerClient.mockResolvedValue({ from });

    const locations = await getStorageLocations();

    expect(from).toHaveBeenCalledWith("storage_locations");
    expect(locations).toEqual([
      { id: "00000000-0000-0000-0000-000000000301", label: "Robotics Lab / Blue cabinet / Shelf B / Bin 4" }
    ]);
  });

  it("loads the staff inventory list via the inventory_list RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "00000000-0000-0000-0000-000000000101",
          name: "Arduino Mega 2560",
          category_name: "Controllers",
          tracking_mode: "pooled_reusable",
          archived_at: null,
          usable_on_hand: 10,
          repair_quantity: 0
        }
      ],
      error: null
    });
    const schema = vi.fn(() => ({ rpc }));
    mocks.createSupabaseServerClient.mockResolvedValue({ schema });

    const items = await getInventoryListItems();

    expect(schema).toHaveBeenCalledWith("api");
    expect(rpc).toHaveBeenCalledWith("inventory_list");
    expect(items[0]).toMatchObject({ id: "00000000-0000-0000-0000-000000000101", usableOnHand: 10 });
  });

  it("loads a single catalog item detail via the catalog_item_detail RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "00000000-0000-0000-0000-000000000101",
        category_id: "00000000-0000-0000-0000-000000000201",
        name: "Arduino Mega 2560",
        description: "High-I/O development board",
        tracking_mode: "pooled_reusable",
        public_remarks: "",
        internal_remarks: "",
        default_loan_days: 7,
        maximum_loan_days: 21,
        member_quantity_limit: 3,
        pickup_window_hours: 24,
        waitlist_enabled: true,
        counter_issue_enabled: false,
        low_stock_threshold: 3,
        acquisition_date: null,
        supplier: null,
        warranty_until: null,
        replacement_cost: null,
        archived_at: null,
        tags: ["Embedded", "5 V"]
      },
      error: null
    });
    const schema = vi.fn(() => ({ rpc }));
    mocks.createSupabaseServerClient.mockResolvedValue({ schema });

    const item = await getCatalogItemForEdit("00000000-0000-0000-0000-000000000101");

    expect(rpc).toHaveBeenCalledWith("catalog_item_detail", {
      catalog_item_id: "00000000-0000-0000-0000-000000000101"
    });
    expect(item).toMatchObject({ name: "Arduino Mega 2560", tags: ["Embedded", "5 V"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- catalog-queries`
Expected: FAIL — `getCategories`/`getStorageLocations`/`getInventoryListItems`/`getCatalogItemForEdit` are not exported from `@/lib/catalog/queries`.

- [ ] **Step 3: Add the types**

Append to `src/lib/catalog/types.ts`:

```ts
export interface Category {
  id: string;
  name: string;
}

export interface StorageLocation {
  id: string;
  label: string;
}

export interface InventoryListItem {
  id: string;
  name: string;
  categoryName: string;
  trackingMode: "pooled_reusable" | "individual_asset" | "consumable";
  archivedAt: string | null;
  usableOnHand: number;
  repairQuantity: number;
}

export interface CatalogItemDetail {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  trackingMode: "pooled_reusable" | "individual_asset" | "consumable";
  publicRemarks: string;
  internalRemarks: string;
  defaultLoanDays: number | null;
  maximumLoanDays: number | null;
  memberQuantityLimit: number | null;
  pickupWindowHours: number | null;
  waitlistEnabled: boolean;
  counterIssueEnabled: boolean;
  lowStockThreshold: number | null;
  acquisitionDate: string | null;
  supplier: string | null;
  warrantyUntil: string | null;
  replacementCost: number | null;
  archivedAt: string | null;
  tags: readonly string[];
}
```

- [ ] **Step 4: Add the demo fixtures**

Add to `src/lib/demo-data.ts`, updating the top import line to
`import type { CatalogItemDetail, CatalogItemView, Category, InventoryListItem, OperationalSummary, StorageLocation } from "@/lib/catalog/types";`
and appending:

```ts
export const demoCategories: readonly Category[] = [
  { id: "00000000-0000-0000-0000-000000000201", name: "Controllers" },
  { id: "00000000-0000-0000-0000-000000000202", name: "Actuation" },
  { id: "00000000-0000-0000-0000-000000000203", name: "Fabrication" },
  { id: "00000000-0000-0000-0000-000000000204", name: "Components" }
];

export const demoStorageLocations: readonly StorageLocation[] = [
  { id: "00000000-0000-0000-0000-000000000301", label: "Robotics Lab / Blue cabinet / Shelf B / Bin 4" },
  { id: "00000000-0000-0000-0000-000000000302", label: "Robotics Lab / Tool wall / Bay 2" },
  { id: "00000000-0000-0000-0000-000000000303", label: "Electronics Lab / ESD cabinet / Drawer 3 / C-12" }
];

export const demoInventoryListItems: readonly InventoryListItem[] = [
  ...demoCatalog.map((item) => ({
    id: item.id,
    name: item.name,
    categoryName: item.categoryName,
    trackingMode: item.trackingMode,
    archivedAt: null,
    usableOnHand: item.usableOnHand,
    repairQuantity: item.repairQuantity
  })),
  {
    id: "00000000-0000-0000-0000-000000000199",
    name: "Retired Breadboard Set",
    categoryName: "Components",
    trackingMode: "consumable",
    archivedAt: "2026-06-01T10:00:00.000Z",
    usableOnHand: 0,
    repairQuantity: 0
  }
];

export const demoCatalogItemDetail: Readonly<Record<string, CatalogItemDetail>> = Object.fromEntries(
  demoCatalog.map((item) => [
    item.id,
    {
      id: item.id,
      categoryId:
        demoCategories.find((category) => category.name === item.categoryName)?.id ?? demoCategories[0].id,
      name: item.name,
      description: item.description,
      trackingMode: item.trackingMode,
      publicRemarks: item.publicRemarks,
      internalRemarks: "",
      defaultLoanDays: 7,
      maximumLoanDays: 21,
      memberQuantityLimit: 3,
      pickupWindowHours: 24,
      waitlistEnabled: true,
      counterIssueEnabled: item.trackingMode === "consumable",
      lowStockThreshold: 2,
      acquisitionDate: null,
      supplier: null,
      warrantyUntil: null,
      replacementCost: null,
      archivedAt: null,
      tags: item.tags
    } satisfies CatalogItemDetail
  ])
);
```

- [ ] **Step 5: Add the query helpers**

Add to `src/lib/catalog/queries.ts`, updating the top import lines to also pull in
`demoCategories, demoStorageLocations, demoInventoryListItems, demoCatalogItemDetail` from `@/lib/demo-data` and
`Category, StorageLocation, InventoryListItem, CatalogItemDetail` from `@/lib/catalog/types`, then appending:

```ts
export const getCategories = cache(async (): Promise<readonly Category[]> => {
  const env = getServerEnvironment();
  if (env.demoMode || !env.supabaseConfigured) return demoCategories;
  const client = await createSupabaseServerClient();
  if (!client) return [];
  const { data, error } = await client
    .from("categories")
    .select("id, name")
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(`Category query failed: ${error.code}`);
  return (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string }));
});

export const getStorageLocations = cache(async (): Promise<readonly StorageLocation[]> => {
  const env = getServerEnvironment();
  if (env.demoMode || !env.supabaseConfigured) return demoStorageLocations;
  const client = await createSupabaseServerClient();
  if (!client) return [];
  const { data, error } = await client
    .from("storage_locations")
    .select("id, room, cabinet, shelf, bin")
    .eq("active", true)
    .order("room");
  if (error) throw new Error(`Storage location query failed: ${error.code}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: [row.room, row.cabinet, row.shelf, row.bin].filter(Boolean).join(" / ")
  }));
});

export const getInventoryListItems = cache(async (): Promise<readonly InventoryListItem[]> => {
  const env = getServerEnvironment();
  if (env.demoMode || !env.supabaseConfigured) return demoInventoryListItems;
  const client = await createSupabaseServerClient();
  if (!client) return [];
  const { data, error } = await client.schema("api").rpc("inventory_list");
  if (error) throw new Error(`Inventory list query failed: ${error.code}`);
  return (data as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    categoryName: row.category_name as string,
    trackingMode: row.tracking_mode as InventoryListItem["trackingMode"],
    archivedAt: (row.archived_at as string | null) ?? null,
    usableOnHand: Number(row.usable_on_hand),
    repairQuantity: Number(row.repair_quantity)
  }));
});

export const getCatalogItemForEdit = cache(async (id: string): Promise<CatalogItemDetail | null> => {
  const env = getServerEnvironment();
  if (env.demoMode || !env.supabaseConfigured) return demoCatalogItemDetail[id] ?? null;
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.schema("api").rpc("catalog_item_detail", { catalog_item_id: id });
  if (error) throw new Error(`Catalog item detail query failed: ${error.code}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    categoryId: row.category_id as string,
    name: row.name as string,
    description: row.description as string,
    trackingMode: row.tracking_mode as CatalogItemDetail["trackingMode"],
    publicRemarks: row.public_remarks as string,
    internalRemarks: row.internal_remarks as string,
    defaultLoanDays: (row.default_loan_days as number | null) ?? null,
    maximumLoanDays: (row.maximum_loan_days as number | null) ?? null,
    memberQuantityLimit: (row.member_quantity_limit as number | null) ?? null,
    pickupWindowHours: (row.pickup_window_hours as number | null) ?? null,
    waitlistEnabled: row.waitlist_enabled as boolean,
    counterIssueEnabled: row.counter_issue_enabled as boolean,
    lowStockThreshold: (row.low_stock_threshold as number | null) ?? null,
    acquisitionDate: (row.acquisition_date as string | null) ?? null,
    supplier: (row.supplier as string | null) ?? null,
    warrantyUntil: (row.warranty_until as string | null) ?? null,
    replacementCost: (row.replacement_cost as number | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : []
  };
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test -- catalog-queries` then `pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/catalog/types.ts src/lib/demo-data.ts src/lib/catalog/queries.ts tests/unit/catalog-queries.test.ts
git commit -m "feat(catalog): add staff query helpers and demo fixtures for categories, storage locations, and item detail"
```

---

### Task 5: `CatalogItemForm` client component

**Files:**
- Create: `src/components/inventory/catalog-item-form.tsx`

**Interfaces:**
- Consumes: `Category`, `StorageLocation`, `CatalogItemDetail` types (Task 4); `POST /api/commands/createCatalogItem` and `.../updateCatalogItem` (Task 3).
- Produces: `CatalogItemForm({ mode, categories, storageLocations, item? })` — consumed by Task 7 and Task 8.

- [ ] **Step 1: Manual check plan (no automated test — this mirrors the existing untested `OperationForm`/`EquipmentPhotoUpload` client components)**

This component is exercised end-to-end by Task 10's manual demo-mode pass; it follows the exact same untested-client-component convention already established by `OperationForm` and `EquipmentPhotoUpload` in this repo.

- [ ] **Step 2: Write the component**

Create `src/components/inventory/catalog-item-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import type { CatalogItemDetail, Category, StorageLocation } from "@/lib/catalog/types";

const conditions = ["perfect", "minor_damage", "repair_required", "not_working"] as const;
const trackingModes = ["pooled_reusable", "individual_asset", "consumable"] as const;

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function CatalogItemForm({
  mode,
  categories,
  storageLocations,
  item
}: {
  mode: "create" | "edit";
  categories: readonly Category[];
  storageLocations: readonly StorageLocation[];
  item?: CatalogItemDetail;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ state: "success" | "error"; message: string } | null>(null);
  const [trackingMode, setTrackingMode] = useState<CatalogItemDetail["trackingMode"]>(
    item?.trackingMode ?? "pooled_reusable"
  );

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(null);
      const idempotencyKey = crypto.randomUUID();
      const numberOrUndefined = (name: string) => {
        const raw = formData.get(name);
        return raw === null || raw === "" ? undefined : Number(raw);
      };
      const textOrUndefined = (name: string) => {
        const raw = formData.get(name);
        return raw === null || raw === "" ? undefined : String(raw);
      };
      const metadata = {
        categoryId: String(formData.get("categoryId")),
        name: String(formData.get("name")),
        description: textOrUndefined("description"),
        publicRemarks: textOrUndefined("publicRemarks"),
        internalRemarks: textOrUndefined("internalRemarks"),
        defaultLoanDays: numberOrUndefined("defaultLoanDays"),
        maximumLoanDays: numberOrUndefined("maximumLoanDays"),
        memberQuantityLimit: numberOrUndefined("memberQuantityLimit"),
        pickupWindowHours: numberOrUndefined("pickupWindowHours"),
        waitlistEnabled: formData.get("waitlistEnabled") === "on",
        counterIssueEnabled: formData.get("counterIssueEnabled") === "on",
        lowStockThreshold: numberOrUndefined("lowStockThreshold"),
        acquisitionDate: textOrUndefined("acquisitionDate"),
        supplier: textOrUndefined("supplier"),
        warrantyUntil: textOrUndefined("warrantyUntil"),
        replacementCost: numberOrUndefined("replacementCost"),
        tags: parseTags(String(formData.get("tags") ?? ""))
      };
      const command = mode === "create" ? "createCatalogItem" : "updateCatalogItem";
      const openingQuantity = numberOrUndefined("openingQuantity");
      const payload =
        mode === "create"
          ? {
              ...metadata,
              trackingMode,
              openingUnits:
                trackingMode === "individual_asset"
                  ? String(formData.get("assetIdentifiers") ?? "")
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((localIdentifier) => ({
                        localIdentifier,
                        storageLocationId: textOrUndefined("openingStorageLocationId"),
                        condition: String(formData.get("openingCondition") ?? "perfect")
                      }))
                  : openingQuantity
                    ? [
                        {
                          storageLocationId: textOrUndefined("openingStorageLocationId"),
                          condition: String(formData.get("openingCondition") ?? "perfect"),
                          quantity: openingQuantity
                        }
                      ]
                    : [],
              idempotencyKey
            }
          : {
              ...metadata,
              catalogItemId: item!.id,
              reason: String(formData.get("reason")),
              idempotencyKey
            };
      try {
        const response = await fetch(`/api/commands/${command}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(payload)
        });
        const body = (await response.json()) as { message?: string; referenceId?: string };
        setResult(
          response.ok
            ? {
                state: "success",
                message:
                  mode === "create"
                    ? "Catalog item created and audit event recorded."
                    : "Catalog item updated and audit event recorded."
              }
            : {
                state: "error",
                message: body.message ?? `Operation failed. Reference ${body.referenceId ?? "unavailable"}.`
              }
        );
      } catch {
        setResult({ state: "error", message: "Network unavailable. The operation was not confirmed; retry." });
      }
    });
  }

  return (
    <form className="command-card" action={submit}>
      <header>
        <h2>{mode === "create" ? "Add a catalog item" : `Edit ${item?.name}`}</h2>
        <p>Metadata changes are audited. Stock and custody are tracked separately.</p>
      </header>
      <div className="form-field">
        <label htmlFor="categoryId">Category</label>
        <select id="categoryId" name="categoryId" defaultValue={item?.categoryId ?? ""} required>
          <option value="" disabled>
            Select a category
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" minLength={2} maxLength={160} defaultValue={item?.name} required />
      </div>
      <div className="form-field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" maxLength={4000} defaultValue={item?.description} />
      </div>
      {mode === "create" ? (
        <fieldset className="decision-line">
          <legend>Tracking mode (cannot be changed later)</legend>
          {trackingModes.map((option) => (
            <label key={option} className="form-field">
              <input
                type="radio"
                name="trackingModeChoice"
                value={option}
                checked={trackingMode === option}
                onChange={() => setTrackingMode(option)}
              />
              {option.replaceAll("_", " ")}
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="form-field">
          <label>Tracking mode</label>
          <input value={item?.trackingMode.replaceAll("_", " ")} disabled />
        </div>
      )}
      <div className="form-field">
        <label htmlFor="publicRemarks">Public remarks</label>
        <textarea id="publicRemarks" name="publicRemarks" maxLength={2000} defaultValue={item?.publicRemarks} />
      </div>
      <div className="form-field">
        <label htmlFor="internalRemarks">Internal remarks (staff only)</label>
        <textarea id="internalRemarks" name="internalRemarks" maxLength={4000} defaultValue={item?.internalRemarks} />
      </div>
      <div className="form-field">
        <label htmlFor="defaultLoanDays">Default loan days</label>
        <input
          id="defaultLoanDays"
          name="defaultLoanDays"
          type="number"
          min={1}
          max={90}
          defaultValue={item?.defaultLoanDays ?? undefined}
        />
      </div>
      <div className="form-field">
        <label htmlFor="maximumLoanDays">Maximum loan days</label>
        <input
          id="maximumLoanDays"
          name="maximumLoanDays"
          type="number"
          min={1}
          max={180}
          defaultValue={item?.maximumLoanDays ?? undefined}
        />
      </div>
      <div className="form-field">
        <label htmlFor="memberQuantityLimit">Member quantity limit</label>
        <input
          id="memberQuantityLimit"
          name="memberQuantityLimit"
          type="number"
          min={1}
          defaultValue={item?.memberQuantityLimit ?? undefined}
        />
      </div>
      <div className="form-field">
        <label htmlFor="pickupWindowHours">Pickup window (hours)</label>
        <input
          id="pickupWindowHours"
          name="pickupWindowHours"
          type="number"
          min={1}
          max={168}
          defaultValue={item?.pickupWindowHours ?? undefined}
        />
      </div>
      <div className="form-field">
        <label htmlFor="lowStockThreshold">Low-stock threshold</label>
        <input
          id="lowStockThreshold"
          name="lowStockThreshold"
          type="number"
          min={0}
          defaultValue={item?.lowStockThreshold ?? undefined}
        />
      </div>
      <div className="form-field">
        <label>
          <input type="checkbox" name="waitlistEnabled" defaultChecked={item?.waitlistEnabled ?? true} />
          Allow waitlisting
        </label>
      </div>
      <div className="form-field">
        <label>
          <input type="checkbox" name="counterIssueEnabled" defaultChecked={item?.counterIssueEnabled ?? false} />
          Allow counter issue (consumables only)
        </label>
      </div>
      <div className="form-field">
        <label htmlFor="acquisitionDate">Acquisition date</label>
        <input id="acquisitionDate" name="acquisitionDate" type="date" defaultValue={item?.acquisitionDate ?? ""} />
      </div>
      <div className="form-field">
        <label htmlFor="supplier">Supplier</label>
        <input id="supplier" name="supplier" maxLength={200} defaultValue={item?.supplier ?? ""} />
      </div>
      <div className="form-field">
        <label htmlFor="warrantyUntil">Warranty until</label>
        <input id="warrantyUntil" name="warrantyUntil" type="date" defaultValue={item?.warrantyUntil ?? ""} />
      </div>
      <div className="form-field">
        <label htmlFor="replacementCost">Replacement cost</label>
        <input
          id="replacementCost"
          name="replacementCost"
          type="number"
          min={0}
          step="0.01"
          defaultValue={item?.replacementCost ?? undefined}
        />
      </div>
      <div className="form-field">
        <label htmlFor="tags">Tags (comma separated)</label>
        <input id="tags" name="tags" defaultValue={item?.tags.join(", ")} />
      </div>
      {mode === "create" ? (
        <fieldset className="decision-line">
          <legend>{trackingMode === "individual_asset" ? "Units (optional)" : "Opening stock (optional)"}</legend>
          <div className="form-field">
            <label htmlFor="openingStorageLocationId">Storage location</label>
            <select id="openingStorageLocationId" name="openingStorageLocationId" defaultValue="">
              <option value="">Unassigned</option>
              {storageLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="openingCondition">Condition</label>
            <select id="openingCondition" name="openingCondition" defaultValue="perfect">
              {conditions.map((condition) => (
                <option key={condition} value={condition}>
                  {condition.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          {trackingMode === "individual_asset" ? (
            <div className="form-field">
              <label htmlFor="assetIdentifiers">Unit identifiers, one per line</label>
              <textarea id="assetIdentifiers" name="assetIdentifiers" placeholder={"RN-JET-01\nRN-JET-02"} />
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="openingQuantity">Quantity</label>
              <input id="openingQuantity" name="openingQuantity" type="number" min={1} max={1000} />
            </div>
          )}
        </fieldset>
      ) : null}
      {mode === "edit" ? (
        <div className="form-field">
          <label htmlFor="reason">Reason for this change</label>
          <textarea id="reason" name="reason" minLength={3} maxLength={1000} required />
        </div>
      ) : null}
      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
        {pending ? "Committing…" : mode === "create" ? "Create item" : "Save changes"}
      </button>
      {result ? (
        <div className="command-result" data-state={result.state} role="status">
          {result.message}
        </div>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/inventory/catalog-item-form.tsx
git commit -m "feat(inventory): add the catalog item create/edit form component"
```

---

### Task 6: `InventoryRowActions` client component + CSS

**Files:**
- Create: `src/components/inventory/inventory-row-actions.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `StorageLocation` type (Task 4); `POST /api/commands/archiveCatalogItem`, `.../restoreCatalogItem`, `.../deleteCatalogItem`, `.../adjustStock`, `.../addIndividualAsset` (Task 3).
- Produces: `InventoryRowActions({ catalogItemId, archivedAt, trackingMode, storageLocations })` — consumed by Task 9.

- [ ] **Step 1: Manual check plan (no automated test, matching Task 5)**

Covered by Task 10's manual pass.

- [ ] **Step 2: Add the CSS**

Append to `src/app/globals.css` (near the existing `.command-card` rules):

```css
.inventory-row-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.inventory-row-actions-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
```

- [ ] **Step 3: Write the component**

Create `src/components/inventory/inventory-row-actions.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, LoaderCircle, Trash2 } from "lucide-react";
import type { StorageLocation } from "@/lib/catalog/types";

const conditions = ["perfect", "minor_damage", "repair_required", "not_working"] as const;

async function runCommand(command: string, payload: Record<string, unknown>) {
  const idempotencyKey = crypto.randomUUID();
  const response = await fetch(`/api/commands/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ ...payload, idempotencyKey })
  });
  const body = (await response.json()) as { message?: string; referenceId?: string };
  return {
    ok: response.ok,
    message: response.ok ? "Committed." : (body.message ?? `Failed. Reference ${body.referenceId ?? "unavailable"}.`)
  };
}

export function InventoryRowActions({
  catalogItemId,
  archivedAt,
  trackingMode,
  storageLocations
}: {
  catalogItemId: string;
  archivedAt: string | null;
  trackingMode: "pooled_reusable" | "individual_asset" | "consumable";
  storageLocations: readonly StorageLocation[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);

  function lifecycleAction(
    command: "archiveCatalogItem" | "restoreCatalogItem" | "deleteCatalogItem",
    reason: string
  ) {
    startTransition(async () => {
      const result = await runCommand(command, { catalogItemId, reason });
      setMessage(result.message);
    });
  }

  function submitAdjustment(formData: FormData) {
    startTransition(async () => {
      const result = await runCommand("adjustStock", {
        catalogItemId,
        storageLocationId: formData.get("storageLocationId") || undefined,
        condition: formData.get("condition"),
        quantityDelta: Number(formData.get("quantityDelta")),
        reason: formData.get("reason")
      });
      setMessage(result.message);
    });
  }

  function submitAddUnit(formData: FormData) {
    startTransition(async () => {
      const result = await runCommand("addIndividualAsset", {
        catalogItemId,
        localIdentifier: formData.get("localIdentifier") || undefined,
        storageLocationId: formData.get("storageLocationId") || undefined,
        condition: formData.get("condition"),
        reason: formData.get("reason")
      });
      setMessage(result.message);
    });
  }

  return (
    <div className="inventory-row-actions">
      <div className="inventory-row-actions-buttons">
        {archivedAt ? (
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={() => lifecycleAction("restoreCatalogItem", "Restored from Inventory page")}
          >
            <ArchiveRestore size={16} aria-hidden="true" /> Restore
          </button>
        ) : (
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={() => lifecycleAction("archiveCatalogItem", "Archived from Inventory page")}
          >
            <Archive size={16} aria-hidden="true" /> Archive
          </button>
        )}
        <button
          type="button"
          className="button button-secondary"
          disabled={pending}
          onClick={() => lifecycleAction("deleteCatalogItem", "Deleted from Inventory page")}
        >
          <Trash2 size={16} aria-hidden="true" /> Delete
        </button>
        {trackingMode !== "individual_asset" ? (
          <button type="button" className="button button-secondary" onClick={() => setShowAdjust((value) => !value)}>
            Adjust stock
          </button>
        ) : (
          <button type="button" className="button button-secondary" onClick={() => setShowAddUnit((value) => !value)}>
            Add unit
          </button>
        )}
      </div>
      {showAddUnit ? (
        <form className="command-card" action={submitAddUnit}>
          <div className="form-field">
            <label htmlFor={`localIdentifier-${catalogItemId}`}>Unit identifier (optional)</label>
            <input id={`localIdentifier-${catalogItemId}`} name="localIdentifier" maxLength={120} />
          </div>
          <div className="form-field">
            <label htmlFor={`unitStorageLocationId-${catalogItemId}`}>Storage location</label>
            <select id={`unitStorageLocationId-${catalogItemId}`} name="storageLocationId" defaultValue="">
              <option value="">Unassigned</option>
              {storageLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`unitCondition-${catalogItemId}`}>Condition</label>
            <select id={`unitCondition-${catalogItemId}`} name="condition" defaultValue="perfect">
              {conditions.map((condition) => (
                <option key={condition} value={condition}>
                  {condition.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`unitReason-${catalogItemId}`}>Reason</label>
            <textarea id={`unitReason-${catalogItemId}`} name="reason" minLength={3} maxLength={1000} required />
          </div>
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : "Confirm new unit"}
          </button>
        </form>
      ) : null}
      {showAdjust ? (
        <form className="command-card" action={submitAdjustment}>
          <div className="form-field">
            <label htmlFor={`storageLocationId-${catalogItemId}`}>Storage location</label>
            <select id={`storageLocationId-${catalogItemId}`} name="storageLocationId" defaultValue="">
              <option value="">Unassigned</option>
              {storageLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`condition-${catalogItemId}`}>Condition</label>
            <select id={`condition-${catalogItemId}`} name="condition" defaultValue="perfect">
              {conditions.map((condition) => (
                <option key={condition} value={condition}>
                  {condition.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={`quantityDelta-${catalogItemId}`}>
              Quantity change (use a negative number to remove stock)
            </label>
            <input id={`quantityDelta-${catalogItemId}`} name="quantityDelta" type="number" required />
          </div>
          <div className="form-field">
            <label htmlFor={`reason-${catalogItemId}`}>Reason</label>
            <textarea id={`reason-${catalogItemId}`} name="reason" minLength={3} maxLength={1000} required />
          </div>
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : "Confirm adjustment"}
          </button>
        </form>
      ) : null}
      {message ? (
        <p className="command-result" data-state={message.startsWith("Committed") ? "success" : "error"} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/inventory/inventory-row-actions.tsx src/app/globals.css
git commit -m "feat(inventory): add per-row archive/restore/delete/adjust-stock actions"
```

---

### Task 7: Create-item page

**Files:**
- Create: `src/app/admin/inventory/new/page.tsx`

**Interfaces:**
- Consumes: `requireAnyCapability` (`@/lib/auth/require-capability`), `getCategories`/`getStorageLocations` (Task 4), `CatalogItemForm` (Task 5).
- Produces: route `/admin/inventory/new` — linked from Task 9.

- [ ] **Step 1: Write the page**

Create `src/app/admin/inventory/new/page.tsx`:

```tsx
import { AppShell } from "@/components/layout/app-shell";
import { CatalogItemForm } from "@/components/inventory/catalog-item-form";
import { requireAnyCapability } from "@/lib/auth/require-capability";
import { getCategories, getStorageLocations } from "@/lib/catalog/queries";

export default async function NewInventoryItemPage() {
  await requireAnyCapability(["inventory:manage"]);
  const [categories, storageLocations] = await Promise.all([getCategories(), getStorageLocations()]);
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Catalog / Inventory</p>
          <h1>Add a catalog item</h1>
          <p>Set the tracking mode carefully — it cannot be changed after creation.</p>
        </div>
      </div>
      <CatalogItemForm mode="create" categories={categories} storageLocations={storageLocations} />
    </AppShell>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm dev`, sign in as a demo staff session (demo mode bypasses auth entirely per `requireAnyCapability`), visit `http://localhost:3000/admin/inventory/new`.
Expected: the page renders the form; submitting shows "Catalog item created and audit event recorded." after ~120ms (demo mode).

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/inventory/new/page.tsx
git commit -m "feat(inventory): add the create catalog item page"
```

---

### Task 8: Edit-item page

**Files:**
- Create: `src/app/admin/inventory/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `requireAnyCapability`, `getCategories`/`getStorageLocations`/`getCatalogItemForEdit` (Task 4), `CatalogItemForm` (Task 5).
- Produces: route `/admin/inventory/[id]/edit` — linked from Task 9.

- [ ] **Step 1: Write the page**

Create `src/app/admin/inventory/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { CatalogItemForm } from "@/components/inventory/catalog-item-form";
import { requireAnyCapability } from "@/lib/auth/require-capability";
import { getCategories, getCatalogItemForEdit, getStorageLocations } from "@/lib/catalog/queries";

export default async function EditInventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyCapability(["inventory:manage"]);
  const { id } = await params;
  const [categories, storageLocations, item] = await Promise.all([
    getCategories(),
    getStorageLocations(),
    getCatalogItemForEdit(id)
  ]);
  if (!item) notFound();
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Catalog / Inventory</p>
          <h1>Edit {item.name}</h1>
          <p>Tracking mode is fixed at creation and cannot be changed here.</p>
        </div>
      </div>
      <CatalogItemForm mode="edit" categories={categories} storageLocations={storageLocations} item={item} />
    </AppShell>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm dev`, visit `http://localhost:3000/admin/inventory/00000000-0000-0000-0000-000000000101/edit` (a seeded/demo item id).
Expected: the form renders pre-filled with "Arduino Mega 2560"'s details; submitting shows "Catalog item updated and audit event recorded."

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/inventory/[id]/edit/page.tsx
git commit -m "feat(inventory): add the edit catalog item page"
```

---

### Task 9: Update the Inventory list page

**Files:**
- Modify: `src/app/admin/inventory/page.tsx`

**Interfaces:**
- Consumes: `getInventoryListItems`, `getStorageLocations` (Task 4), `InventoryRowActions` (Task 6).
- Produces: the updated `/admin/inventory` page.

- [ ] **Step 1: Replace the page**

Replace the full contents of `src/app/admin/inventory/page.tsx`:

```tsx
import { Download, Plus, Wrench } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { EquipmentPhotoUpload } from "@/components/inventory/equipment-photo-upload";
import { InventoryRowActions } from "@/components/inventory/inventory-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAnyCapability } from "@/lib/auth/require-capability";
import { getInventoryListItems, getStorageLocations } from "@/lib/catalog/queries";

export default async function InventoryPage() {
  await requireAnyCapability(["inventory:manage"]);
  const [items, storageLocations] = await Promise.all([getInventoryListItems(), getStorageLocations()]);
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Catalog / Inventory</p>
          <h1>Condition, custody, and location</h1>
          <p>
            Internal remarks, replacement cost, and precise storage are restricted to authorized
            staff.
          </p>
        </div>
        <div className="head-actions">
          <Link href="/admin/inventory/new" className="button button-primary">
            <Plus size={18} aria-hidden="true" />
            Add item
          </Link>
          <a href="/api/exports/inventory" className="button button-secondary">
            <Download size={18} aria-hidden="true" />
            Safe CSV
          </a>
        </div>
      </div>
      <EquipmentPhotoUpload items={items.map(({ id, name }) => ({ id, name }))} />
      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Mode</th>
                <th>Usable</th>
                <th>Repair</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Item">
                    <strong>{item.name}</strong>
                    <span className="data-id">{item.id.slice(-8)}</span>
                  </td>
                  <td data-label="Mode">{item.trackingMode.replaceAll("_", " ")}</td>
                  <td data-label="Usable">{item.usableOnHand}</td>
                  <td data-label="Repair">{item.repairQuantity}</td>
                  <td data-label="State">
                    {item.archivedAt ? (
                      <StatusBadge tone="neutral">Archived</StatusBadge>
                    ) : (
                      <StatusBadge tone={item.repairQuantity ? "warning" : "success"}>
                        {item.repairQuantity ? (
                          <>
                            <Wrench size={14} aria-hidden="true" /> Repair split
                          </>
                        ) : (
                          "Operational"
                        )}
                      </StatusBadge>
                    )}
                  </td>
                  <td data-label="Actions">
                    <Link href={`/admin/inventory/${item.id}/edit`} className="button button-secondary">
                      Edit
                    </Link>
                    <InventoryRowActions
                      catalogItemId={item.id}
                      archivedAt={item.archivedAt}
                      trackingMode={item.trackingMode}
                      storageLocations={storageLocations}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
```

- [ ] **Step 2: Check for existing tests that assume the old data source**

Run: `grep -rn "admin/inventory" tests/ | grep -v node_modules`

If `tests/unit/access-routing.test.ts` or `tests/e2e/exhaustive-ui-smoke.spec.ts` assert on the old "Location ledger" text or the old column set, update those specific assertions to match the new "Actions" column and the presence of an "Add item" link — do not change anything else in those files.

- [ ] **Step 3: Run the full unit suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/inventory/page.tsx
git commit -m "feat(inventory): show archived items and wire up add/edit/archive/delete/adjust-stock actions"
```

---

### Task 10: Manual demo-mode verification pass

**Files:** none (verification only).

- [ ] **Step 1: Start the app in demo mode**

Confirm `.env.local` has `ROFIES_DEMO_MODE=true` (already set), then run `pnpm dev`.

- [ ] **Step 2: Walk every new flow**

- Visit `/admin/inventory` — confirm the "Add item" button and the new "Actions" column with Edit/Archive/Delete/Adjust stock appear on every row, and the archived demo fixture ("Retired Breadboard Set") shows the "Archived" badge with a "Restore" button.
- Visit `/admin/inventory/new` — create a pooled item with an opening quantity, then a consumable item, then an individual-asset item with two unit identifiers. Confirm each shows "Catalog item created and audit event recorded."
- Submit the create form with `maximumLoanDays` less than `defaultLoanDays` — confirm a 422 client-side/schema validation message appears (the browser's own `min`/`max` constraints plus the schema's refine will both block this before it reaches the server in demo mode, since demo mode still runs full Zod validation before short-circuiting).
- Visit `/admin/inventory/00000000-0000-0000-0000-000000000101/edit` — confirm the form is pre-filled from the demo fixture, and saving shows the updated-confirmation message.
- On the inventory list, click "Archive" on a row, then "Restore" on the same row — confirm both show "Committed."
- Click "Adjust stock" on a pooled row, submit a positive and then a negative quantity change — confirm both show "Committed." (demo mode does not enforce the insufficient-stock rule client-side; that guard is proven by Task 1's pgTAP tests against the real database.)
- Click "Add unit" on an individual-asset row (e.g. the Jetson Orin Nano Kit) and submit — confirm it shows "Committed."
- Click "Delete" on a row — confirm it shows "Committed." (demo mode always reports success; the real "has history" rejection is proven by Task 1's pgTAP tests.)

- [ ] **Step 3: Record the outcome**

Report to the user which flows were checked and confirmed working in demo mode, and note explicitly that demo mode cannot exercise real persistence or the server-side rejection rules — those are covered by the Task 1 pgTAP suite instead, and a second pass against the real Supabase project (temporarily setting `ROFIES_DEMO_MODE=false`) is recommended before relying on this in production, per the design spec's testing section.

- [ ] **Step 4: No commit** — this is a verification-only task; if Step 2 surfaces a bug, fix it in the relevant task's files and amend that task's commit-worthy change with a new commit, then re-run this task's checklist.
