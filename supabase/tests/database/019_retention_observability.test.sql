begin;
select plan(8);

select has_view('api','system_health','system health view exists');
select has_column('api','system_health','archived_notification_lag_seconds','health reports notification archive lag');
select has_column('api','system_health','oldest_overdue_id_deletion_seconds','health reports oldest overdue ID deletion');
select has_column('api','system_health','deletion_failures_24h','health reports recent deletion failures');
select has_column('api','system_health','last_successful_cleanup_at','health reports last successful cleanup');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select is_empty($$select * from api.system_health$$,'ordinary members cannot read system retention health');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
select results_eq(
  $$select count(*) from api.system_health$$,
  $$values (1::bigint)$$,
  'system managers can read retention health'
);
select results_eq(
  $$select deletion_failures_24h from api.system_health$$,
  $$values (0::bigint)$$,
  'seeded health starts without retention deletion failures'
);

select * from finish();
rollback;
