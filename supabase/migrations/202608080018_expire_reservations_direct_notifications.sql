create or replace function api.expire_reservations(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer := 0;
  reservation record;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'resource unavailable' using errcode = '42501';
  end if;
  if batch_size not between 1 and 500 then raise exception 'invalid batch size'; end if;

  for reservation in
    with candidates as (
      select id
      from public.reservations
      where status in ('reserved','ready_for_pickup')
        and pickup_deadline < now()
      order by pickup_deadline, id
      for update skip locked
      limit batch_size
    )
    update public.reservations r
    set status='expired'
    from candidates c
    where r.id=c.id
    returning r.id, r.borrower_id
  loop
    perform private.create_notification(
      reservation.borrower_id,
      'reservation_expired',
      'Reservation expired',
      'Your pickup window expired before handover.',
      'reservation',
      reservation.id,
      'reservation-expired:'||reservation.id::text
    );
    expired_count := expired_count + 1;
  end loop;

  return expired_count;
end;
$$;
revoke all on function api.expire_reservations(integer) from public, anon, authenticated;
grant execute on function api.expire_reservations(integer) to service_role;
