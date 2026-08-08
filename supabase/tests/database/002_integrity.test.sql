begin;
select plan(6);

select throws_ok(
  $$insert into public.pool_balances (catalog_item_id, condition, quantity_on_hand) values ('00000000-0000-0000-0000-000000000101', 'perfect', -1)$$,
  '23514', null, 'stock cannot become negative'
);

select throws_ok(
  $$update public.audit_events set action = 'rewritten' where id = '00000000-0000-0000-0000-000000000901'$$,
  'P0001', 'audit events are append-only', 'audit rows cannot be rewritten'
);

select throws_ok(
  $$delete from public.audit_events where id = '00000000-0000-0000-0000-000000000901'$$,
  'P0001', 'audit events are append-only', 'audit rows cannot be deleted'
);

select throws_ok(
  $$insert into public.request_lines (request_id, catalog_item_id, requested_quantity) values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000101', 0)$$,
  '23514', null, 'request quantity must be positive'
);

select throws_ok(
  $$insert into public.requests (borrower_id, status, purpose, requested_start, requested_end) values ('00000000-0000-0000-0000-000000000001', 'draft', 'bad range', '2026-08-10', '2026-08-09')$$,
  '23514', null, 'request end follows start'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.requests'::regclass),
  'RLS is enabled for requests'
);

select * from finish();
rollback;
