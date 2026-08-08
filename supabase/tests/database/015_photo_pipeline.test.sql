begin;
select plan(5);
select has_function('api','register_item_photo',array['uuid','text','text','integer','integer'],'photo registration command exists');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select api.register_item_photo('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101/00000000-0000-0000-0000-000000000999.webp','',100,100)$$,
  '42501',null,'member cannot register equipment photos'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select throws_ok(
  $$insert into storage.objects(bucket_id,name,owner_id) values('equipment-photos','00000000-0000-0000-0000-000000000101/00000000-0000-0000-0000-000000000999.webp','00000000-0000-0000-0000-000000000005')$$,
  '42501',null,'staff cannot bypass the server image processor with a direct storage write'
);

reset role;
insert into storage.objects(id,bucket_id,name,owner_id,metadata)
values('00000000-0000-0000-0000-000000000930','equipment-photos','00000000-0000-0000-0000-000000000101/00000000-0000-0000-0000-000000000999.webp','00000000-0000-0000-0000-000000000005','{"mimetype":"image/webp"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select lives_ok(
  $$select api.register_item_photo('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101/00000000-0000-0000-0000-000000000999.webp','Processed board',320,200)$$,
  'inventory manager registers the server-processed object'
);
reset role;
select ok(
  exists(select 1 from public.audit_events where action='catalog.photo_added' and after_summary->>'width'='320'),
  'photo registration appends an audit event'
);

select * from finish();
rollback;
