begin;
select plan(6);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select results_eq(
  $$select distinct borrower_id from public.requests$$,
  $$values ('00000000-0000-0000-0000-000000000001'::uuid)$$,
  'member sees only own request'
);
select is_empty(
  $$select internal_remarks from public.catalog_items$$,
  'member cannot select privileged catalog table directly'
);
select results_eq(
  $$select name from api.search_catalog('',null,null,1,0)$$,
  $$values ('Arduino Mega 2560'::text)$$,
  'member can read safe catalog view'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty(
  $$select id from public.requests where borrower_id = '00000000-0000-0000-0000-000000000001'$$,
  'another member cannot read borrower records'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select ok(
  (select count(*) > 0 from public.requests),
  'approver can read operational requests'
);
select is_empty(
  $$select id from public.audit_events$$,
  'approver without audit capability cannot read audit history'
);

select * from finish();
rollback;
