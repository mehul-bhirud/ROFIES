create or replace function private.is_active_profile(subject_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select subject_id=(select auth.uid())
    and exists(select 1 from public.profiles p where p.id=subject_id and p.active);
$$;

revoke all on function private.is_active_profile(uuid) from public,anon;
grant execute on function private.is_active_profile(uuid) to authenticated;

do $$
declare protected_table record;
begin
  for protected_table in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity
  loop
    execute format('drop policy if exists active_account_guard on public.%I',protected_table.relname);
    execute format(
      'create policy active_account_guard on public.%I as restrictive for all to authenticated using ((select private.is_active_profile((select auth.uid())))) with check ((select private.is_active_profile((select auth.uid()))))',
      protected_table.relname
    );
  end loop;
end;
$$;

alter function api.search_catalog(text,timestamptz,timestamptz,integer,integer) rename to search_catalog_unchecked;
revoke all on function api.search_catalog_unchecked(text,timestamptz,timestamptz,integer,integer) from public,anon,authenticated;

create function api.search_catalog(
  search_query text default '', range_start timestamptz default null, range_end timestamptz default null,
  result_limit integer default 40, result_offset integer default 0
)
returns table(
  id uuid,name text,description text,category_name text,tracking_mode public.tracking_mode,public_remarks text,
  usable_on_hand integer,available_quantity integer,repair_quantity integer,expected_on timestamptz,tags jsonb,specifications jsonb
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not private.is_active_profile((select auth.uid())) then return; end if;
  return query select * from api.search_catalog_unchecked(search_query,range_start,range_end,result_limit,result_offset);
end;
$$;

revoke all on function api.search_catalog(text,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function api.search_catalog(text,timestamptz,timestamptz,integer,integer) to authenticated;
revoke select on api.catalog,api.my_operational_summary from authenticated;

create or replace function api.inventory_export(result_limit integer default 2000)
returns table(name text,tracking_mode public.tracking_mode,usable_on_hand integer,repair_quantity integer)
language sql stable security definer set search_path=''
as $$
  select i.name,i.tracking_mode,
    case when i.tracking_mode='individual_asset'
      then (select count(*) from public.individual_assets a where a.catalog_item_id=i.id and a.archived_at is null and a.custody_state='on_hand' and a.condition in ('perfect','minor_damage'))
      else (select coalesce(sum(b.quantity_on_hand),0) from public.pool_balances b where b.catalog_item_id=i.id and b.condition in ('perfect','minor_damage')) end::integer,
    case when i.tracking_mode='individual_asset'
      then (select count(*) from public.individual_assets a where a.catalog_item_id=i.id and a.archived_at is null and a.condition in ('repair_required','not_working'))
      else (select coalesce(sum(b.quantity_on_hand),0) from public.pool_balances b where b.catalog_item_id=i.id and b.condition in ('repair_required','not_working')) end::integer
  from public.catalog_items i
  where i.archived_at is null and private.has_capability((select auth.uid()),'reports:export')
  order by i.name,i.id limit least(greatest(result_limit,1),2000);
$$;

revoke all on function api.inventory_export(integer) from public,anon;
grant execute on function api.inventory_export(integer) to authenticated;

create or replace function api.outbox_recipient_email(outbox_id uuid,worker_id text)
returns text language plpgsql stable security definer set search_path=''
as $$
declare recipient_email text;
begin
  if coalesce((select auth.role()),'')<>'service_role' then raise exception 'resource unavailable' using errcode='42501'; end if;
  select p.institutional_email into recipient_email
  from public.notification_outbox o join public.profiles p on p.id=o.recipient_id
  where o.id=outbox_recipient_email.outbox_id and o.state='processing' and o.locked_by=outbox_recipient_email.worker_id;
  return recipient_email;
end;
$$;

revoke all on function api.outbox_recipient_email(uuid,text) from public,anon,authenticated;
grant execute on function api.outbox_recipient_email(uuid,text) to service_role;
