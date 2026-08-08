begin;
select plan(9);

insert into public.requests (id, borrower_id, status, purpose, requested_start, requested_end, submitted_at)
values (
  '00000000-0000-0000-0000-000000000420',
  '00000000-0000-0000-0000-000000000001',
  'submitted',
  'Edge vision navigation test',
  now() + interval '2 days',
  now() + interval '5 days',
  now()
);
insert into public.request_lines (id, request_id, catalog_item_id, requested_quantity)
values (
  '00000000-0000-0000-0000-000000000421',
  '00000000-0000-0000-0000-000000000420',
  '00000000-0000-0000-0000-000000000103',
  1
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select api.decide_request(
    '00000000-0000-0000-0000-000000000420',
    '[{"line_id":"00000000-0000-0000-0000-000000000421","decision":"approved","approved_quantity":1}]'::jsonb,
    'Approved after availability review',
    'individual-decision-0001'
  )$$,
  'an approver can reserve one usable individual asset'
);
select results_eq(
  $$select individual_asset_id from public.reservation_lines where request_line_id='00000000-0000-0000-0000-000000000421'$$,
  $$values ('00000000-0000-0000-0000-000000000111'::uuid)$$,
  'the reservation binds the concrete individual asset'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select api.confirm_handover(
    (select id from public.reservations where request_id='00000000-0000-0000-0000-000000000420'),
    now() + interval '5 days',
    'Identity and asset serial verified',
    'individual-handover-0001'
  )$$,
  'inventory staff can hand over the reserved individual asset'
);
select results_eq(
  $$select custody_state from public.individual_assets where id='00000000-0000-0000-0000-000000000111'$$,
  $$values ('issued'::text)$$,
  'individual asset custody changes to issued'
);
select results_eq(
  $$select count(*)::bigint from public.loans where reservation_id=(select id from public.reservations where request_id='00000000-0000-0000-0000-000000000420')$$,
  $$values (1::bigint)$$,
  'the handover creates exactly one loan'
);
select lives_ok(
  $$select api.confirm_handover(
    (select id from public.reservations where request_id='00000000-0000-0000-0000-000000000420'),
    now() + interval '5 days',
    'Identity and asset serial verified',
    'individual-handover-0001'
  )$$,
  'an idempotent handover retry returns the committed response'
);

select lives_ok(
  $$select api.confirm_return(
    (select id from public.loans where reservation_id=(select id from public.reservations where request_id='00000000-0000-0000-0000-000000000420')),
    jsonb_build_array(jsonb_build_object(
      'loan_line_id',(select id from public.loan_lines where individual_asset_id='00000000-0000-0000-0000-000000000111'),
      'quantity',1,
      'condition','repair_required'
    )),
    'Power connector is intermittent',
    'individual-return-0001'
  )$$,
  'staff can return the individual asset into repair routing'
);
select results_eq(
  $$select custody_state || ':' || condition::text from public.individual_assets where id='00000000-0000-0000-0000-000000000111'$$,
  $$values ('maintenance:repair_required'::text)$$,
  'return keeps condition separate and routes custody to maintenance'
);
select results_eq(
  $$select count(*)::bigint from public.pool_balances where catalog_item_id='00000000-0000-0000-0000-000000000103'$$,
  $$values (0::bigint)$$,
  'individual assets never leak into pooled balances'
);

select * from finish();
rollback;
