begin;
select plan(4);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select results_eq(
  $$select usable_on_hand from api.search_catalog('Jetson Orin Nano',null,null,40,0)$$,
  $$values (1)$$,
  'individual assets contribute usable on-hand quantity'
);
select results_eq(
  $$select name from api.search_catalog('Logic probe',null,null,40,0)$$,
  $$values ('USB Logic Analyzer'::text)$$,
  'aliases participate in bounded catalog search'
);
select results_eq(
  $$select repair_quantity from api.search_catalog('USB Logic Analyzer',null,null,40,0)$$,
  $$values (1)$$,
  'repair stock remains visible but separate from usable stock'
);

reset role;
insert into public.reservations(id,request_id,borrower_id,status,starts_at,ends_at,pickup_deadline)
values('00000000-0000-0000-0000-000000000550','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000001','reserved','2026-12-10T10:00:00Z','2026-12-12T10:00:00Z','2026-12-10T12:00:00Z');
insert into public.reservation_lines(reservation_id,request_line_id,catalog_item_id,approved_quantity,remaining_quantity)
values('00000000-0000-0000-0000-000000000550','00000000-0000-0000-0000-000000000411','00000000-0000-0000-0000-000000000101',9,9);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select results_eq(
  $$select available_quantity from api.search_catalog('Arduino Mega','2026-12-10T10:00:00Z','2026-12-12T10:00:00Z',40,0)$$,
  $$values (1)$$,
  'approved overlapping reservations reduce date-range availability'
);

select * from finish();
rollback;
