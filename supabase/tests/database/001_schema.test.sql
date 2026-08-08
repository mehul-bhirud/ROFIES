begin;
select plan(14);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'catalog_items', 'catalog items table exists');
select has_table('public', 'pool_balances', 'pool balances table exists');
select has_table('public', 'requests', 'requests table exists');
select has_table('public', 'reservations', 'reservations table exists');
select has_table('public', 'loans', 'loans table exists');
select hasnt_table('public', 'notification_outbox', 'transactional outbox has been removed');
select has_table('public', 'audit_events', 'audit table exists');
select col_is_pk('public', 'profiles', 'id', 'profiles has a primary key');
select col_not_null('public', 'pool_balances', 'quantity_on_hand', 'balance quantity is required');
select has_check('public', 'pool_balances', 'pool balance has a non-negative check');
select has_function('private', 'has_capability', array['uuid', 'text'], 'capability helper exists');
select has_function('api', 'decide_request', array['uuid', 'jsonb', 'text', 'text'], 'approval command exists');
select has_function('api', 'confirm_handover', array['uuid', 'timestamptz', 'text', 'text'], 'handover command exists');

select * from finish();
rollback;
