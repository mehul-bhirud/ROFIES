begin;
select plan(3);
select has_function('api','create_request',array['text','text','timestamptz','timestamptz','jsonb','jsonb','text'],'team-aware request command exists');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select api.create_request('Team fixture calibration','Motion bench',now()+interval '12 days',now()+interval '14 days','["Rhea Nair"]'::jsonb,'[{"catalog_item_id":"00000000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,'team-request-0000001')$$,
  'member can submit optional team context atomically'
);
select results_eq(
  $$select team_members from public.requests where purpose='Team fixture calibration'$$,
  $$values ('["Rhea Nair"]'::jsonb)$$,
  'team context is stored with the borrower-of-record request'
);
select * from finish();
rollback;
