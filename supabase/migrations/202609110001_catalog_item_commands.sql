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

  delete from public.catalog_tags where catalog_tags.catalog_item_id = update_catalog_item.catalog_item_id;
  for v_tag in select value from jsonb_array_elements_text(coalesce(tags,'[]'::jsonb)) loop
    insert into public.catalog_tags(catalog_item_id, tag) values (update_catalog_item.catalog_item_id, v_tag)
      on conflict on constraint catalog_tags_pkey do nothing;
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
  v_tags jsonb;
  v_aliases jsonb;
  v_specifications jsonb;
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

  if exists(select 1 from public.request_lines where request_lines.catalog_item_id=delete_catalog_item.catalog_item_id)
    or exists(select 1 from public.stock_adjustments where stock_adjustments.catalog_item_id=delete_catalog_item.catalog_item_id)
    or exists(select 1 from public.maintenance_events where maintenance_events.catalog_item_id=delete_catalog_item.catalog_item_id)
    or exists(select 1 from public.waitlist_entries where waitlist_entries.catalog_item_id=delete_catalog_item.catalog_item_id)
    or exists(select 1 from public.individual_assets where individual_assets.catalog_item_id=delete_catalog_item.catalog_item_id)
    or exists(select 1 from public.pool_balances where pool_balances.catalog_item_id=delete_catalog_item.catalog_item_id and pool_balances.quantity_on_hand>0)
  then
    raise exception 'catalog item has history and cannot be permanently deleted; archive it instead' using errcode='P0001';
  end if;

  select coalesce(jsonb_agg(tag order by tag),'[]'::jsonb) into v_tags
    from public.catalog_tags where catalog_tags.catalog_item_id=delete_catalog_item.catalog_item_id;
  select coalesce(jsonb_agg(alias order by alias),'[]'::jsonb) into v_aliases
    from public.catalog_aliases where catalog_aliases.catalog_item_id=delete_catalog_item.catalog_item_id;
  select coalesce(jsonb_agg(jsonb_build_object('key',key,'value',value) order by key),'[]'::jsonb) into v_specifications
    from public.catalog_specifications where catalog_specifications.catalog_item_id=delete_catalog_item.catalog_item_id;

  delete from public.pool_balances where pool_balances.catalog_item_id = delete_catalog_item.catalog_item_id;
  delete from public.catalog_items where id = delete_catalog_item.catalog_item_id;

  insert into public.audit_events(actor_id, action, target_type, target_id, reason, before_summary)
    values (v_actor, 'catalog_item.deleted', 'catalog_item', delete_catalog_item.catalog_item_id, reason,
      jsonb_build_object('item', to_jsonb(v_item), 'tags', v_tags, 'aliases', v_aliases, 'specifications', v_specifications));
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

  begin
    insert into public.individual_assets(catalog_item_id, local_identifier, condition, custody_state, storage_location_id)
      values (add_individual_asset.catalog_item_id, nullif(add_individual_asset.local_identifier,''), v_condition, 'on_hand', add_individual_asset.storage_location_id)
      returning id into v_asset_id;
  exception
    when unique_violation then
      raise exception 'an individual asset with this identifier already exists' using errcode='P0001';
  end;

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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.has_capability((select auth.uid()),'inventory:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;

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
  ) into v_result
  from public.catalog_items i
  where i.id = catalog_item_detail.catalog_item_id;

  return v_result;
end;
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
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_capability((select auth.uid()),'inventory:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;

  return query
  select i.id, i.name, c.name, i.tracking_mode, i.archived_at,
    case when i.tracking_mode='individual_asset'
      then (select count(*) from public.individual_assets a where a.catalog_item_id=i.id and a.archived_at is null and a.custody_state='on_hand' and a.condition in ('perfect','minor_damage'))
      else (select coalesce(sum(b.quantity_on_hand),0) from public.pool_balances b where b.catalog_item_id=i.id and b.condition in ('perfect','minor_damage')) end::integer,
    case when i.tracking_mode='individual_asset'
      then (select count(*) from public.individual_assets a where a.catalog_item_id=i.id and a.archived_at is null and a.condition in ('repair_required','not_working'))
      else (select coalesce(sum(b.quantity_on_hand),0) from public.pool_balances b where b.catalog_item_id=i.id and b.condition in ('repair_required','not_working')) end::integer
  from public.catalog_items i
  join public.categories c on c.id=i.category_id
  order by i.archived_at nulls first, i.name, i.id;
end;
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
