begin;
select plan(13);

select has_column('public','notifications','deduplication_key','notifications carry direct deduplication keys');
select col_not_null('public','notifications','deduplication_key','notification deduplication keys are required');
select has_column('public','notifications','archived_at','read notifications can be archived');
select hasnt_table('public','notification_outbox','delivery outbox has been removed');
select hasnt_table('public','email_deliveries','email delivery ledger has been removed');
select has_function('api','archive_read_notifications',array['integer'],'archive command exists');
select hasnt_function('api','claim_outbox',array['text','integer'],'outbox claim command has been removed');
select hasnt_function('api','complete_outbox',array['uuid','text','boolean','text','text','text'],'outbox completion command has been removed');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select api.create_request(
    'Direct notification pgtap request',
    '',
    now()+interval '15 days',
    now()+interval '16 days',
    '[{"catalog_item_id":"00000000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
    'direct-notification-pgtap'
  )$$,
  'business command writes direct notification without an outbox worker'
);
select results_eq(
  $$select count(*) from public.notifications where event_type='request_submitted' and deduplication_key like 'request-submitted:%'$$,
  $$values (1::bigint)$$,
  'request submission produced exactly one deduplicated in-app notification'
);

reset role;
insert into public.notifications(recipient_id,event_type,title,body,deduplication_key,read_at)
values(
  '00000000-0000-0000-0000-000000000001',
  'archive_test',
  'Archive me',
  'This read notification is old enough to archive.',
  'archive-test-' || gen_random_uuid()::text,
  now()-interval '181 days'
);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select results_eq(
  $$select (api.archive_read_notifications(500)->>'archived')::integer > 0$$,
  $$values (true)$$,
  'service archive command marks old read notifications archived'
);

reset role;
update public.reservations
set status='ready_for_pickup', pickup_deadline=now()-interval '1 minute'
where id='00000000-0000-0000-0000-000000000501';
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select results_eq(
  $$select api.expire_reservations(10)$$,
  $$values (1)$$,
  'reservation expiry maintenance command succeeds without outbox infrastructure'
);
reset role;
select results_eq(
  $$select count(*) from public.notifications where event_type='reservation_expired' and related_entity_id='00000000-0000-0000-0000-000000000501'$$,
  $$values (1::bigint)$$,
  'reservation expiry writes a direct in-app notification'
);

select * from finish();
rollback;
