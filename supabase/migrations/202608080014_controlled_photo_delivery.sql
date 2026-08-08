create or replace function api.catalog_photos()
returns table(catalog_item_id uuid,photo_id uuid,caption text)
language sql stable security definer set search_path=''
as $$
  select distinct on (p.catalog_item_id) p.catalog_item_id,p.id,p.caption
  from public.item_photos p join public.catalog_items i on i.id=p.catalog_item_id
  where private.is_active_profile((select auth.uid())) and p.processing_state='ready' and i.archived_at is null
  order by p.catalog_item_id,p.sort_order,p.created_at,p.id;
$$;

create or replace function api.catalog_photo_object(photo_id uuid)
returns table(object_name text,caption text)
language sql stable security definer set search_path=''
as $$
  select p.object_name,p.caption
  from public.item_photos p join public.catalog_items i on i.id=p.catalog_item_id
  where private.is_active_profile((select auth.uid())) and p.id=catalog_photo_object.photo_id
    and p.processing_state='ready' and i.archived_at is null;
$$;

revoke all on function api.catalog_photos(),api.catalog_photo_object(uuid) from public,anon;
grant execute on function api.catalog_photos(),api.catalog_photo_object(uuid) to authenticated;
