insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment-photos', 'equipment-photos', false, 8388608, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.item_photos (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  individual_asset_id uuid references public.individual_assets(id) on delete restrict,
  object_name text not null unique check (object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|avif)$'),
  caption text not null default '' check (char_length(caption) <= 300),
  sort_order smallint not null default 0,
  processing_state text not null default 'pending' check (processing_state in ('pending','ready','rejected')),
  width integer check (width between 1 and 8000),
  height integer check (height between 1 and 8000),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index item_photos_item_order_idx on public.item_photos (catalog_item_id, sort_order) where processing_state = 'ready';
alter table public.item_photos enable row level security;
grant select on public.item_photos to authenticated;
create policy item_photos_staff_read on public.item_photos for select to authenticated using ((select private.has_capability((select auth.uid()), 'inventory:manage')));

create policy equipment_photos_staff_read on storage.objects for select to authenticated using (bucket_id = 'equipment-photos' and (select private.has_capability((select auth.uid()), 'inventory:manage')));
create policy equipment_photos_staff_insert on storage.objects for insert to authenticated with check (bucket_id = 'equipment-photos' and (select private.has_capability((select auth.uid()), 'inventory:manage')));
create policy equipment_photos_staff_update on storage.objects for update to authenticated using (bucket_id = 'equipment-photos' and (select private.has_capability((select auth.uid()), 'inventory:manage'))) with check (bucket_id = 'equipment-photos' and (select private.has_capability((select auth.uid()), 'inventory:manage')));
create policy equipment_photos_staff_delete on storage.objects for delete to authenticated using (bucket_id = 'equipment-photos' and (select private.has_capability((select auth.uid()), 'inventory:manage')));

create or replace function private.prevent_completed_history_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'completed business history is append-only';
end;
$$;

create trigger stock_adjustments_no_update_delete before update or delete on public.stock_adjustments for each row execute function private.prevent_completed_history_delete();
create trigger request_decisions_no_update_delete before update or delete on public.request_line_decisions for each row execute function private.prevent_completed_history_delete();
create trigger return_events_no_update_delete before update or delete on public.return_events for each row execute function private.prevent_completed_history_delete();
create trigger return_lines_no_update_delete before update or delete on public.return_lines for each row execute function private.prevent_completed_history_delete();
create trigger loss_resolutions_no_update_delete before update or delete on public.loss_resolutions for each row execute function private.prevent_completed_history_delete();

create or replace function api.expire_reservations(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare expired_count integer;
begin
  if batch_size not between 1 and 500 then raise exception 'invalid batch size'; end if;
  with candidates as (
    select id from public.reservations
    where status in ('reserved','ready_for_pickup') and pickup_deadline < now()
    order by pickup_deadline, id for update skip locked limit batch_size
  ), changed as (
    update public.reservations r set status='expired'
    from candidates c where r.id=c.id returning r.id, r.borrower_id
  ), events as (
    insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key)
    select 'reservation_expired', borrower_id, jsonb_build_object('reservation_id',id), 'reservation-expired:'||id::text from changed
    returning 1
  )
  select count(*) into expired_count from changed;
  return expired_count;
end;
$$;
revoke all on function api.expire_reservations(integer) from public, anon, authenticated;
grant execute on function api.expire_reservations(integer) to service_role;
