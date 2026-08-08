begin;
select plan(62);

select has_type('public', 'member_application_state', 'member application state enum exists');
select enum_has_labels(
  'public',
  'member_application_state',
  array['incomplete','pending_review','changes_requested','approved','rejected'],
  'application states are constrained to the approved lifecycle'
);
select has_table('public', 'institution_domains', 'configured institution domain table exists');
select has_table('public', 'member_applications', 'member applications table exists');
select has_table('public', 'college_id_documents', 'college ID document metadata table exists');
select col_is_pk('public', 'member_applications', 'id', 'member applications use a UUID primary key');
select col_is_pk('public', 'college_id_documents', 'id', 'college ID documents use a UUID primary key');
select col_not_null('public', 'member_applications', 'profile_id', 'every application belongs to a profile');
select col_not_null('public', 'college_id_documents', 'object_name', 'document metadata stores an object name');
select has_column('public', 'notifications', 'deduplication_key', 'notifications support idempotent creation');
select function_returns(
  'private', 'create_notification',
  array['uuid','text','text','text','text','uuid','text'],
  'uuid',
  'direct notification helper returns the notification identifier'
);
select function_returns(
  'api', 'submit_member_application', array['text','text','smallint','text','text'], 'jsonb',
  'application submission command returns JSON'
);
select function_returns(
  'api', 'member_application_status', array[]::text[], 'jsonb',
  'application status boundary returns JSON'
);
select function_returns(
  'api', 'review_member_application', array['uuid','text','text','text'], 'jsonb',
  'review command returns JSON'
);
select function_returns(
  'api', 'college_id_object', array['uuid'], 'text',
  'audited college ID access returns only an object name'
);
select function_returns(
  'api', 'claim_expired_college_ids', array['integer'], 'setof record',
  'retention worker claims bounded document metadata rows'
);
select function_returns(
  'api', 'register_college_id_document', array['uuid','text','integer','integer','integer','text'], 'jsonb',
  'trusted processed-object registration command returns JSON'
);
select is(
  (select column_default::text from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='active'),
  'false'::text,
  'new profiles are inactive until application approval'
);

select results_eq(
  $$select count(*) from public.member_applications where state='approved'$$,
  $$select count(*) from public.memberships where status='active'$$,
  'seed and upgrade paths preserve active memberships as approved applications'
);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,email_change,email_change_token_new,recovery_token
) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000011','authenticated','authenticated','confirmed@iiitp.ac.in','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000012','authenticated','authenticated','unconfirmed@iiitp.ac.in','',null,'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000013','authenticated','authenticated','outsider@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000014','authenticated','authenticated','second@iiitp.ac.in','',now(),'{}','{}',now(),now(),'','','','');

insert into public.profiles (id,institutional_email,display_name,student_identifier,department,study_year,active) values
('00000000-0000-0000-0000-000000000011','confirmed@iiitp.ac.in','Confirmed Applicant','TEST-11','CSE',2,false),
('00000000-0000-0000-0000-000000000012','unconfirmed@iiitp.ac.in','Unconfirmed Applicant','TEST-12','CSE',2,false),
('00000000-0000-0000-0000-000000000013','outsider@example.com','Wrong Domain Applicant','TEST-13','CSE',2,false),
('00000000-0000-0000-0000-000000000014','second@iiitp.ac.in','Second Applicant','TEST-14','ECE',3,false);
insert into public.memberships (profile_id,status) values
('00000000-0000-0000-0000-000000000011','inactive'),
('00000000-0000-0000-0000-000000000012','inactive'),
('00000000-0000-0000-0000-000000000013','inactive'),
('00000000-0000-0000-0000-000000000014','inactive');
insert into public.member_applications (id,profile_id,state) values
('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000011','incomplete'),
('00000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000012','incomplete'),
('00000000-0000-0000-0000-000000000113','00000000-0000-0000-0000-000000000013','incomplete'),
('00000000-0000-0000-0000-000000000114','00000000-0000-0000-0000-000000000014','incomplete');
insert into public.college_id_documents (id,application_id,owner_id,object_name,byte_size,width,height,checksum_sha256) values
('00000000-0000-0000-0000-000000000121','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000011','applications/00000000-0000-0000-0000-000000000111/11111111-1111-4111-8111-111111111121.webp',1000,800,500,repeat('a',64)),
('00000000-0000-0000-0000-000000000122','00000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000012','applications/00000000-0000-0000-0000-000000000112/11111111-1111-4111-8111-111111111122.webp',1000,800,500,repeat('b',64)),
('00000000-0000-0000-0000-000000000123','00000000-0000-0000-0000-000000000113','00000000-0000-0000-0000-000000000013','applications/00000000-0000-0000-0000-000000000113/11111111-1111-4111-8111-111111111123.webp',1000,800,500,repeat('c',64)),
('00000000-0000-0000-0000-000000000124','00000000-0000-0000-0000-000000000114','00000000-0000-0000-0000-000000000014','applications/00000000-0000-0000-0000-000000000114/11111111-1111-4111-8111-111111111124.webp',1000,800,500,repeat('d',64));

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated","email":"unconfirmed@iiitp.ac.in"}',true);
select throws_ok(
  $$select api.submit_member_application('Unconfirmed Applicant','TEST-12',2::smallint,'CSE',null)$$,
  '42501','email confirmation required','an unconfirmed account cannot submit an application'
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000013","role":"authenticated","email":"outsider@example.com"}',true);
select throws_ok(
  $$select api.submit_member_application('Wrong Domain Applicant','TEST-13',2::smallint,'CSE',null)$$,
  '42501','institutional email required','a confirmed account outside the configured domain cannot submit'
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000014',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000014","role":"authenticated","email":"second@iiitp.ac.in"}',true);
select results_eq(
  $$select count(*) from public.member_applications where id='00000000-0000-0000-0000-000000000111'$$,
  $$values (0::bigint)$$,
  'an applicant cannot read another applicant application'
);
select throws_ok(
  $$insert into public.college_id_documents(application_id,owner_id,object_name,byte_size,width,height,checksum_sha256) values('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000014','applications/00000000-0000-0000-0000-000000000111/11111111-1111-4111-8111-111111111199.webp',1000,800,500,repeat('e',64))$$,
  '42501',null,'an applicant cannot register metadata against another application'
);
select throws_ok(
  $$insert into storage.objects(bucket_id,name,owner_id) values('college-ids','applications/00000000-0000-0000-0000-000000000114/11111111-1111-4111-8111-111111111199.webp','00000000-0000-0000-0000-000000000014')$$,
  '42501',null,'authenticated clients cannot write college ID objects directly'
);
select throws_ok(
  $$select id from public.college_id_documents where owner_id='00000000-0000-0000-0000-000000000014'$$,
  '42501',null,'authenticated clients cannot list private document metadata directly'
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated","email":"confirmed@iiitp.ac.in"}',true);
select throws_ok(
  $$select api.submit_member_application('Confirmed Applicant','TEST-11',2::smallint,'CSE',null)$$,
  'P0001','current college ID storage object required',
  'metadata without a matching processed private Storage object cannot satisfy submission'
);
reset role;
update public.member_applications set state='incomplete',submitted_at=null,updated_at=now()
where id='00000000-0000-0000-0000-000000000111';
insert into storage.objects(id,bucket_id,name,owner_id,metadata)
values(
  '00000000-0000-0000-0000-000000000931','college-ids',
  'applications/00000000-0000-0000-0000-000000000111/11111111-1111-4111-8111-111111111126.webp',
  '00000000-0000-0000-0000-000000000011',
  '{"mimetype":"image/webp","size":1300}'
);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select lives_ok(
  $$select api.register_college_id_document('00000000-0000-0000-0000-000000000111','applications/00000000-0000-0000-0000-000000000111/11111111-1111-4111-8111-111111111126.webp',1300,900,600,repeat('1',64))$$,
  'trusted registration succeeds only after the processed private object exists'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated","email":"confirmed@iiitp.ac.in"}',true);
select is(
  (api.submit_member_application('Confirmed Applicant','TEST-11',2::smallint,'CSE',null)->>'state'),
  'pending_review','a confirmed in-domain applicant with a current document can submit'
);
select is(api.member_application_status()->>'state','pending_review','status returns only the caller application lifecycle state');
select throws_ok(
  $$update public.profiles set active=true where id='00000000-0000-0000-0000-000000000011'$$,
  '42501',null,'a pending applicant cannot activate their profile directly'
);
select throws_ok(
  $$insert into public.requests(id,borrower_id,purpose,requested_start,requested_end) values('00000000-0000-0000-0000-000000000811','00000000-0000-0000-0000-000000000011','Unauthorized pending request',now()+interval '1 day',now()+interval '2 days')$$,
  '42501',null,'a pending applicant cannot create a borrowing request'
);
reset role;
update public.profiles set active=true where id='00000000-0000-0000-0000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated","email":"confirmed@iiitp.ac.in"}',true);
select is_empty(
  $$select id from api.search_catalog('',null,null,40,0)$$,
  'an active profile without approved active membership cannot read the catalog'
);
reset role;
update public.profiles set active=false where id='00000000-0000-0000-0000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","email":"anaya.kulkarni@iiitp.ac.in"}',true);
select results_eq(
  $$select count(*) from api.search_catalog('',null,null,40,0)$$,
  $$values (8::bigint)$$,'an approved active member can read the catalog'
);
select lives_ok(
  $$insert into public.requests(id,borrower_id,purpose,requested_start,requested_end) values('00000000-0000-0000-0000-000000000812','00000000-0000-0000-0000-000000000001','Authorized active request',now()+interval '1 day',now()+interval '2 days')$$,
  'an approved active member can create a borrowing request'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated","email":"meera.joshi@iiitp.ac.in"}',true);
select throws_ok(
  $$select api.review_member_application('00000000-0000-0000-0000-000000000111','approved','Not authorized','unauthorized-key-0001')$$,
  '42501','resource unavailable','staff without membership management cannot review applications'
);
reset role;
insert into public.role_assignments(profile_id,capability,granted_by)
values('00000000-0000-0000-0000-000000000001','membership:manage','00000000-0000-0000-0000-000000000006');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","email":"anaya.kulkarni@iiitp.ac.in"}',true);
select throws_ok(
  $$select api.review_member_application('00000000-0000-0000-0000-000000000101','approved','self approval','self-key-0001')$$,
  '42501','requester may not review own application','requester may not review own application'
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006","role":"authenticated","email":"arjun.desai@iiitp.ac.in"}',true);
select is(
  api.review_member_application('00000000-0000-0000-0000-000000000111','changes_requested','Replace the image','changes-key-0001')->>'state',
  'changes_requested','a reviewer may request changes with a reason'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated","email":"confirmed@iiitp.ac.in"}',true);
select throws_ok(
  $$insert into public.college_id_documents(application_id,owner_id,object_name,byte_size,width,height,checksum_sha256) values('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000011','applications/00000000-0000-0000-0000-000000000111/11111111-1111-4111-8111-111111111125.webp',1200,900,600,repeat('f',64))$$,
  '42501',null,'an applicant cannot register replacement metadata directly'
);
reset role;
insert into storage.objects(id,bucket_id,name,owner_id,metadata)
values(
  '00000000-0000-0000-0000-000000000932','college-ids',
  'applications/00000000-0000-0000-0000-000000000111/11111111-1111-4111-8111-111111111125.webp',
  '00000000-0000-0000-0000-000000000011',
  '{"mimetype":"image/webp","size":1200}'
);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select lives_ok(
  $$select api.register_college_id_document('00000000-0000-0000-0000-000000000111','applications/00000000-0000-0000-0000-000000000111/11111111-1111-4111-8111-111111111125.webp',1200,900,600,repeat('f',64))$$,
  'trusted registration atomically replaces the current document after changes are requested'
);
reset role;
select results_eq(
  $$select count(*) from public.college_id_documents where application_id='00000000-0000-0000-0000-000000000111' and is_current$$,
  $$values (1::bigint)$$,'replacement leaves exactly one current document'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated","email":"confirmed@iiitp.ac.in"}',true);
select is(
  api.submit_member_application('Confirmed Applicant','TEST-11',2::smallint,'CSE',null)->>'state',
  'pending_review','a changes-requested application can be resubmitted'
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006","role":"authenticated","email":"arjun.desai@iiitp.ac.in"}',true);
select is(
  api.college_id_object('00000000-0000-0000-0000-000000000111'),
  'applications/00000000-0000-0000-0000-000000000111/11111111-1111-4111-8111-111111111125.webp',
  'authorized document access returns only the current object name'
);
select results_eq(
  $$select count(*) from public.audit_events where action='college_id.accessed' and target_id='00000000-0000-0000-0000-000000000111'$$,
  $$values (1::bigint)$$,'reviewer document access is audit logged'
);
select is(
  api.review_member_application('00000000-0000-0000-0000-000000000111','approved','Identity verified','approval-key-0001')->>'membership_status',
  'active','approval returns an active membership result'
);
reset role;
select results_eq(
  $$select a.state,m.status,p.active from public.member_applications a join public.memberships m on m.profile_id=a.profile_id join public.profiles p on p.id=a.profile_id where a.id='00000000-0000-0000-0000-000000000111'$$,
  $$values ('approved'::public.member_application_state,'active'::public.membership_state,true)$$,
  'approval atomically updates application, membership, and account'
);
select results_eq(
  $$select count(*) from public.college_id_documents where application_id='00000000-0000-0000-0000-000000000111' and deletion_due_at=(select decided_at+interval '30 days' from public.member_applications where id='00000000-0000-0000-0000-000000000111')$$,
  $$select count(*) from public.college_id_documents where application_id='00000000-0000-0000-0000-000000000111'$$,
  'approval schedules every current and superseded document exactly 30 days after decision'
);
update public.college_id_documents set deletion_due_at=deletion_due_at-interval '31 days',deletion_claimed_at=null
where application_id='00000000-0000-0000-0000-000000000111';
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select results_eq(
  $$select count(*) from api.claim_expired_college_ids(100) where object_name like 'applications/00000000-0000-0000-0000-000000000111/%'$$,
  $$values (3::bigint)$$,
  'current and superseded documents all become claimable after expiry'
);
reset role;
select results_eq(
  $$select count(*) from public.notifications where recipient_id='00000000-0000-0000-0000-000000000011' and event_type='member_application_approved'$$,
  $$values (1::bigint)$$,'approval creates one in-app notification'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated","email":"confirmed@iiitp.ac.in"}',true);
select lives_ok(
  $$update public.notifications set read_at=now() where recipient_id='00000000-0000-0000-0000-000000000011' and event_type='member_application_approved'$$,
  'a notification recipient may mark their notification read'
);
select throws_ok(
  $$update public.notifications set deduplication_key=null,event_type='tampered',title='Tampered',body='Tampered',related_entity_type=null,related_entity_id=null where recipient_id='00000000-0000-0000-0000-000000000011' and event_type='member_application_approved'$$,
  '42501',null,'a recipient cannot mutate server-authored notification or deduplication fields'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006","role":"authenticated","email":"arjun.desai@iiitp.ac.in"}',true);
select is(
  api.review_member_application('00000000-0000-0000-0000-000000000111','approved','Identity verified','approval-key-0001')->>'state',
  'approved','an idempotent approval retry returns the original response'
);
select throws_ok(
  $$select api.review_member_application('00000000-0000-0000-0000-000000000114','approved','Identity verified','approval-key-0001')$$,
  '40001','idempotency key reused with different request','an idempotency key cannot be replayed for another application'
);
select throws_ok(
  $$select api.review_member_application('00000000-0000-0000-0000-000000000111','rejected','Identity verified','approval-key-0001')$$,
  '40001','idempotency key reused with different request','an idempotency key cannot be replayed with another decision'
);
select throws_ok(
  $$select api.review_member_application('00000000-0000-0000-0000-000000000111','approved','Different reason','approval-key-0001')$$,
  '40001','idempotency key reused with different request','an idempotency key cannot be replayed with another reason'
);
reset role;
select results_eq(
  $$select count(*) from public.notifications where recipient_id='00000000-0000-0000-0000-000000000011' and event_type='member_application_approved'$$,
  $$values (1::bigint)$$,'an approval retry does not duplicate its notification'
);
select results_eq(
  $$select a.state,(select count(*) from public.notifications n where n.recipient_id=a.profile_id) from public.member_applications a where a.id='00000000-0000-0000-0000-000000000114'$$,
  $$values ('incomplete'::public.member_application_state,0::bigint)$$,
  'conflicting idempotency replays leave the other application and notifications unchanged'
);
reset role;
update public.member_applications set state='pending_review',submitted_at=now(),updated_at=now()
where id='00000000-0000-0000-0000-000000000114';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000006","role":"authenticated","email":"arjun.desai@iiitp.ac.in"}',true);
select is(
  api.review_member_application('00000000-0000-0000-0000-000000000114','rejected','Identity mismatch','rejection-key-0001')->>'state',
  'rejected','a reviewer may reject an application with a reason'
);
select results_eq(
  $$select m.status,p.active from public.memberships m join public.profiles p on p.id=m.profile_id where m.profile_id='00000000-0000-0000-0000-000000000014'$$,
  $$values ('inactive'::public.membership_state,false)$$,'rejection does not activate membership or account access'
);
reset role;
select results_eq(
  $$select deletion_due_at=(select decided_at+interval '30 days' from public.member_applications where id='00000000-0000-0000-0000-000000000114') from public.college_id_documents where application_id='00000000-0000-0000-0000-000000000114' and is_current$$,
  $$values (true)$$,'rejection schedules deletion exactly 30 days after decision'
);
update public.college_id_documents set deletion_due_at=now()-interval '1 minute',deletion_claimed_at=null
where id='00000000-0000-0000-0000-000000000124';
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select results_eq(
  $$select count(*) from api.claim_expired_college_ids(1)$$,
  $$values (1::bigint)$$,'cleanup claims at most the requested number of expired documents'
);
select results_eq(
  $$select count(*) from api.claim_expired_college_ids(1) where document_id='00000000-0000-0000-0000-000000000124'$$,
  $$values (0::bigint)$$,'an active cleanup claim is not immediately duplicated'
);
reset role;
update public.college_id_documents set deletion_claimed_at=now()-interval '16 minutes'
where id='00000000-0000-0000-0000-000000000124';
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select results_eq(
  $$select count(*) from api.claim_expired_college_ids(1) where document_id='00000000-0000-0000-0000-000000000124'$$,
  $$values (1::bigint)$$,'a stale failed cleanup claim becomes retryable'
);
select * from finish();
rollback;
