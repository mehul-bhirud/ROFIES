begin;
select plan(6);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select results_eq(
  $$select count(*) from api.search_catalog('',null,null,40,0)$$,
  $$values (0::bigint)$$,
  'signed-in non-member cannot browse the catalog before approval'
);

reset role;
update public.profiles set active=false where id='00000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is_empty($$select id from api.search_catalog('',null,null,40,0)$$,'deactivated account cannot call catalog RPC directly');
select is_empty($$select id from public.profiles$$,'deactivated account cannot read direct REST tables');
select is_empty($$select id from public.contacts$$,'deactivated account cannot read student contacts');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select throws_ok($$select name from api.catalog$$,'42501',null,'legacy owner-rights catalog view is not exposed');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
select results_eq($$select count(*) from api.inventory_export(2000)$$,$$values (8::bigint)$$,'authorized report export uses a capability-scoped function');

select * from finish();
rollback;
