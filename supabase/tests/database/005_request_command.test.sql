begin;
select plan(4);
select has_function('api','create_request',array['text','text','timestamptz','timestamptz','jsonb','text'],'atomic request command exists');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select api.create_request('Fixture calibration','Motion bench','2026-09-10T10:00:00Z','2026-09-12T10:00:00Z','[{"catalog_item_id":"00000000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,'request-test-0001')$$,
  'active member can create and submit atomically'
);
select results_eq(
  $$select status::text from public.requests where purpose='Fixture calibration'$$,
  $$values ('submitted'::text)$$,
  'created request is submitted'
);
select results_eq(
  $$select count(*)::bigint from public.request_lines rl join public.requests r on r.id=rl.request_id where r.purpose='Fixture calibration'$$,
  $$values (1::bigint)$$,
  'request lines commit with the request'
);
select * from finish();
rollback;
