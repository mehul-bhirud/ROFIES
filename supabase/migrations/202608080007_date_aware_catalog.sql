create or replace function api.search_catalog(
  search_query text default '',
  range_start timestamptz default null,
  range_end timestamptz default null,
  result_limit integer default 40,
  result_offset integer default 0
)
returns table (
  id uuid,
  name text,
  description text,
  category_name text,
  tracking_mode public.tracking_mode,
  public_remarks text,
  usable_on_hand integer,
  available_quantity integer,
  repair_quantity integer,
  expected_on timestamptz,
  tags jsonb,
  specifications jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with item_stock as (
    select i.id,
      case when i.tracking_mode='individual_asset'
        then (select count(*) from public.individual_assets a where a.catalog_item_id=i.id and a.archived_at is null and a.custody_state='on_hand' and a.condition in ('perfect','minor_damage'))
        else (select coalesce(sum(b.quantity_on_hand),0) from public.pool_balances b where b.catalog_item_id=i.id and b.condition in ('perfect','minor_damage')) end::integer as usable,
      case when i.tracking_mode='individual_asset'
        then (select count(*) from public.individual_assets a where a.catalog_item_id=i.id and a.archived_at is null and a.condition in ('repair_required','not_working'))
        else (select coalesce(sum(b.quantity_on_hand),0) from public.pool_balances b where b.catalog_item_id=i.id and b.condition in ('repair_required','not_working')) end::integer as repair
    from public.catalog_items i
    where i.archived_at is null
  ), allocations as (
    select rl.catalog_item_id, coalesce(sum(rl.remaining_quantity),0)::integer as quantity
    from public.reservation_lines rl join public.reservations r on r.id=rl.reservation_id
    where r.status in ('reserved','ready_for_pickup')
      and case when range_start is not null and range_end is not null
        then tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(range_start,range_end,'[)')
        else r.starts_at <= now() and r.ends_at > now() end
    group by rl.catalog_item_id
  )
  select i.id, i.name, i.description, c.name, i.tracking_mode, i.public_remarks,
    s.usable,
    greatest(s.usable-coalesce(a.quantity,0),0)::integer,
    s.repair,
    (select min(ll.due_at) from public.loan_lines ll where ll.catalog_item_id=i.id and ll.unresolved_quantity>0),
    coalesce((select jsonb_agg(t.tag order by t.tag) from public.catalog_tags t where t.catalog_item_id=i.id),'[]'::jsonb),
    coalesce((select jsonb_object_agg(sp.key,sp.value order by sp.key) from public.catalog_specifications sp where sp.catalog_item_id=i.id),'{}'::jsonb)
  from public.catalog_items i
  join public.categories c on c.id=i.category_id
  join item_stock s on s.id=i.id
  left join allocations a on a.catalog_item_id=i.id
  where i.archived_at is null
    and (
      coalesce(trim(search_query),'')=''
      or i.search_document @@ websearch_to_tsquery('english',search_query)
      or extensions.similarity(i.name,search_query) > 0.3
      or exists(select 1 from public.catalog_aliases ca where ca.catalog_item_id=i.id and extensions.similarity(ca.alias,search_query) > 0.3)
      or exists(select 1 from public.catalog_tags ct where ct.catalog_item_id=i.id and ct.tag ilike '%'||search_query||'%')
      or exists(select 1 from public.catalog_specifications cs where cs.catalog_item_id=i.id and (cs.key ilike '%'||search_query||'%' or cs.value ilike '%'||search_query||'%'))
    )
  order by i.name, i.id
  limit least(greatest(result_limit,1),100)
  offset greatest(result_offset,0);
$$;

revoke all on function api.search_catalog(text,timestamptz,timestamptz,integer,integer) from public, anon;
grant execute on function api.search_catalog(text,timestamptz,timestamptz,integer,integer) to authenticated;
