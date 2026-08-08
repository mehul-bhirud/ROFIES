begin;
select plan(7);
select has_function('api','cancel_request',array['uuid','text','text'],'request cancellation command exists');
select has_function('api','join_waitlist',array['uuid','integer','timestamptz','timestamptz','text'],'waitlist join command exists');
select has_function('api','request_extension',array['uuid','timestamptz','text','text'],'extension request command exists');
select has_function('api','decide_extension',array['uuid','text','text','text'],'extension decision command exists');
select has_function('api','counter_issue',array['uuid','uuid','integer','text','text'],'counter issue command exists');
select has_function('api','resolve_loss',array['uuid','integer','text','text','text'],'loss resolution command exists');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select api.join_waitlist('00000000-0000-0000-0000-000000000101',1,now()+interval '2 days',now()+interval '3 days','inactive-waitlist-0001')$$,
  '42501',null,'inactive members cannot join waitlists'
);
select * from finish();
rollback;
