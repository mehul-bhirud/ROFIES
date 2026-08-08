begin;
select plan(10);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select api.join_waitlist('00000000-0000-0000-0000-000000000101',1,now()+interval '8 days',now()+interval '10 days','journey-waitlist-0001')$$,
  'active member can join an enabled waitlist'
);
select is((select count(*)::bigint from public.waitlist_entries where member_id='00000000-0000-0000-0000-000000000001'),1::bigint,'waitlist entry is attributable');
select lives_ok(
  $$select api.cancel_request('00000000-0000-0000-0000-000000000401','Project plan changed','journey-cancel-00001')$$,
  'borrower can cancel their unissued request'
);
select is((select status::text from public.requests where id='00000000-0000-0000-0000-000000000401'),'cancelled','request cancellation commits');
select lives_ok(
  $$select api.request_extension('00000000-0000-0000-0000-000000000611',now()+interval '2 days','Fixture needs another day','journey-extension-request-0001')$$,
  'borrower can request a bounded loan extension'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select lives_ok(
  $$select api.decide_extension((select id from public.extension_requests where loan_line_id='00000000-0000-0000-0000-000000000611'),'approved','No future conflict','journey-extension-decision-0001')$$,
  'another approver can approve a conflict-free extension'
);
select is((select decision from public.extension_requests where loan_line_id='00000000-0000-0000-0000-000000000611'),'approved','extension decision is recorded');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select lives_ok(
  $$select api.counter_issue('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000105',2,'Identity and packet count verified','journey-counter-issue-0001')$$,
  'inventory manager can perform an attributable consumable counter issue'
);
select is((select quantity_on_hand from public.pool_balances where catalog_item_id='00000000-0000-0000-0000-000000000105' and condition='perfect'),36,'counter issue decrements stock atomically');
select lives_ok(
  $$select api.resolve_loss('00000000-0000-0000-0000-000000000611',1,'lost','One actuator could not be recovered','journey-loss-resolution-0001')$$,
  'inventory manager can close part of an obligation through audited loss resolution'
);
select * from finish();
rollback;
