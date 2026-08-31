begin;
select plan(24);

select ok(not has_table_privilege('anon', 'public.college_id_documents', 'truncate'), 'anon cannot truncate college ID metadata');
select ok(not has_table_privilege('anon', 'public.college_id_documents', 'references'), 'anon cannot reference college ID metadata');
select ok(not has_table_privilege('anon', 'public.college_id_documents', 'trigger'), 'anon cannot create college ID metadata triggers');
select ok(not has_table_privilege('authenticated', 'public.college_id_documents', 'truncate'), 'authenticated cannot truncate college ID metadata');
select ok(not has_table_privilege('authenticated', 'public.college_id_documents', 'references'), 'authenticated cannot reference college ID metadata');
select ok(not has_table_privilege('authenticated', 'public.college_id_documents', 'trigger'), 'authenticated cannot create college ID metadata triggers');

select ok(not has_table_privilege('anon', 'public.institution_domains', 'truncate'), 'anon cannot truncate institution domains');
select ok(not has_table_privilege('anon', 'public.institution_domains', 'references'), 'anon cannot reference institution domains');
select ok(not has_table_privilege('anon', 'public.institution_domains', 'trigger'), 'anon cannot create institution domain triggers');
select ok(not has_table_privilege('authenticated', 'public.institution_domains', 'truncate'), 'authenticated cannot truncate institution domains');
select ok(not has_table_privilege('authenticated', 'public.institution_domains', 'references'), 'authenticated cannot reference institution domains');
select ok(not has_table_privilege('authenticated', 'public.institution_domains', 'trigger'), 'authenticated cannot create institution domain triggers');

select ok(not has_table_privilege('anon', 'public.item_photos', 'truncate'), 'anon cannot truncate item photo metadata');
select ok(not has_table_privilege('anon', 'public.item_photos', 'references'), 'anon cannot reference item photo metadata');
select ok(not has_table_privilege('anon', 'public.item_photos', 'trigger'), 'anon cannot create item photo metadata triggers');
select ok(not has_table_privilege('authenticated', 'public.item_photos', 'truncate'), 'authenticated cannot truncate item photo metadata');
select ok(not has_table_privilege('authenticated', 'public.item_photos', 'references'), 'authenticated cannot reference item photo metadata');
select ok(not has_table_privilege('authenticated', 'public.item_photos', 'trigger'), 'authenticated cannot create item photo metadata triggers');

select ok(not has_table_privilege('anon', 'public.member_applications', 'truncate'), 'anon cannot truncate member applications');
select ok(not has_table_privilege('anon', 'public.member_applications', 'references'), 'anon cannot reference member applications');
select ok(not has_table_privilege('anon', 'public.member_applications', 'trigger'), 'anon cannot create member application triggers');
select ok(not has_table_privilege('authenticated', 'public.member_applications', 'truncate'), 'authenticated cannot truncate member applications');
select ok(not has_table_privilege('authenticated', 'public.member_applications', 'references'), 'authenticated cannot reference member applications');
select ok(not has_table_privilege('authenticated', 'public.member_applications', 'trigger'), 'authenticated cannot create member application triggers');

select * from finish();
rollback;
