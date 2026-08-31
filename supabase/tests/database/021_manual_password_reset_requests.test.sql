begin;
select plan(16);

select has_table('public', 'password_reset_requests', 'manual password reset request table exists');
select has_function(
  'api',
  'request_manual_password_reset',
  array['text'],
  'server-only manual reset request function exists'
);

select ok(not has_table_privilege('anon', 'public.password_reset_requests', 'select'), 'anon cannot read reset requests');
select ok(not has_table_privilege('anon', 'public.password_reset_requests', 'insert'), 'anon cannot write reset requests');
select ok(not has_table_privilege('authenticated', 'public.password_reset_requests', 'insert'), 'authenticated cannot write reset requests directly');
select ok(not has_table_privilege('authenticated', 'public.password_reset_requests', 'update'), 'authenticated cannot complete reset requests directly');
select ok(has_table_privilege('authenticated', 'public.password_reset_requests', 'select'), 'authenticated can select only through RLS');
select ok(not has_function_privilege('authenticated', 'api.request_manual_password_reset(text)', 'execute'), 'browser roles cannot queue reset requests by RPC');

select lives_ok(
  $$select api.request_manual_password_reset('student@iiitp.ac.in')$$,
  'service-owned function safely accepts institutional email'
);
select is(
  (select count(*) from public.password_reset_requests where institutional_email='student@iiitp.ac.in'),
  1::bigint,
  'one pending reset request is recorded'
);
select lives_ok(
  $$select api.request_manual_password_reset('student@iiitp.ac.in')$$,
  'duplicate open request is idempotent'
);
select is(
  (select count(*) from public.password_reset_requests where institutional_email='student@iiitp.ac.in'),
  1::bigint,
  'duplicate open request is not duplicated'
);
select is(
  (select api.request_manual_password_reset('student@gmail.com')),
  null::uuid,
  'external emails are ignored'
);
select is_empty(
  $$select column_name from information_schema.columns where table_schema='public' and table_name='password_reset_requests' and column_name like '%password%'$$,
  'reset queue stores no password column'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is_empty(
  $$select id from public.password_reset_requests$$,
  'ordinary member cannot read reset queue rows'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
select ok(
  (select count(*) > 0 from public.password_reset_requests),
  'system administrator can read reset queue rows'
);

select * from finish();
rollback;
