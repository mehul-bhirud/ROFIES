drop policy if exists equipment_photos_staff_insert on storage.objects;
drop policy if exists equipment_photos_staff_update on storage.objects;
drop policy if exists equipment_photos_staff_delete on storage.objects;

create or replace function api.register_item_photo(catalog_id uuid,object_name text,caption text,width integer,height integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_photo uuid; v_result jsonb;
begin
  if not private.has_capability(v_actor,'inventory:manage') then raise exception 'resource unavailable' using errcode='42501'; end if;
  if object_name !~ ('^'||catalog_id::text||'/[0-9a-f-]{36}\.webp$') or char_length(coalesce(caption,''))>300 or width not between 1 and 2400 or height not between 1 and 2400 then raise exception 'invalid photo metadata'; end if;
  if not exists(select 1 from public.catalog_items i where i.id=catalog_id and i.archived_at is null) then raise exception 'resource unavailable' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='equipment-photos' and o.name=object_name) then raise exception 'photo object unavailable'; end if;
  insert into public.item_photos(catalog_item_id,object_name,caption,processing_state,width,height,uploaded_by)
  values(catalog_id,object_name,coalesce(caption,''),'ready',width,height,v_actor) returning id into v_photo;
  insert into public.audit_events(actor_id,action,target_type,target_id,after_summary)
  values(v_actor,'catalog.photo_added','item_photo',v_photo,jsonb_build_object('catalog_item_id',catalog_id,'width',width,'height',height));
  v_result:=jsonb_build_object('photo_id',v_photo,'state','ready');
  return v_result;
end;
$$;

revoke all on function api.register_item_photo(uuid,text,text,integer,integer) from public,anon;
grant execute on function api.register_item_photo(uuid,text,text,integer,integer) to authenticated;
