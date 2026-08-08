begin;
select plan(5);

select has_function(
  'api',
  'has_capability',
  array['text'],
  'the browser can ask only about the current actor capability'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$update public.profiles set active = false where id = '00000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'students cannot mutate protected profile state directly'
);

select throws_ok(
  $$update public.requests set status = 'approved' where id = '00000000-0000-0000-0000-000000000401'$$,
  '42501',
  null,
  'borrowers cannot promote their own requests'
);

select results_eq(
  $$select api.has_capability('reports:export')$$,
  $$values (false)$$,
  'ordinary members do not receive export capability'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
select results_eq(
  $$select api.has_capability('reports:export')$$,
  $$values (true)$$,
  'the report administrator receives export capability'
);

select * from finish();
rollback;
