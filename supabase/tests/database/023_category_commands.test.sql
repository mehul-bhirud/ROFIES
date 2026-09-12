begin;
select plan(7);

select has_function('api','create_category',array['text','text'],'category create command exists');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select api.create_category('Unauthorized Category','create-category-test-unauth-0001')$$,
  '42501',null,'members without inventory:manage cannot create categories'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select lives_ok(
  $$select api.create_category('Plan Test Category','create-category-test-0001')$$,
  'inventory manager can create a category'
);
select results_eq(
  $$select count(*)::bigint from public.categories where name='Plan Test Category'$$,
  $$values (1::bigint)$$,
  'the category was created'
);
select lives_ok(
  $$select api.create_category('Plan Test Category','create-category-test-0001')$$,
  'replaying the same idempotency key does not error'
);
select results_eq(
  $$select count(*)::bigint from public.categories where name='Plan Test Category'$$,
  $$values (1::bigint)$$,
  'replaying the same idempotency key did not create a duplicate category'
);
select throws_ok(
  $$select api.create_category('Plan Test Category','create-category-test-dup-0001')$$,
  'P0001',null,'creating a category with an already-used name is rejected'
);

select * from finish();
rollback;
