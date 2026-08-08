drop view if exists api.system_health;
create view api.system_health
with (security_barrier = true)
as
select
  now() as checked_at,
  (select count(*) from public.notifications where archived_at is null and read_at is null) as unread_notifications,
  (select count(*) from public.notifications where archived_at is null and read_at < now() - interval '180 days') as archivable_notifications,
  (select extract(epoch from now() - min(read_at))::bigint from public.notifications where archived_at is null and read_at < now() - interval '180 days') as archived_notification_lag_seconds,
  (select count(*) from public.college_id_documents where deleted_at is null and deletion_due_at < now()) as retention_failures,
  (select extract(epoch from now() - min(deletion_due_at))::bigint from public.college_id_documents where deleted_at is null and deletion_due_at < now()) as oldest_overdue_id_deletion_seconds,
  (select count(*) from public.audit_events where action in ('retention.college_id_delete_failed','retention.college_id_metadata_failed') and created_at > now() - interval '24 hours') as deletion_failures_24h,
  (select max(created_at) from public.audit_events where action='retention.completed' and coalesce((after_summary->>'failures')::integer,1)=0) as last_successful_cleanup_at,
  (select count(*) from public.outage_reconciliations where review_state = 'pending') as unresolved_reconciliations,
  (select count(*) from public.loan_lines where unresolved_quantity > 0 and due_at < now()) as overdue_lines,
  exists(select 1 from public.system_notices where severity = 'critical' and starts_at <= now() and (ends_at is null or ends_at > now())) as critical_notice_active
where private.has_capability((select auth.uid()), 'system:manage');
grant select on api.system_health to authenticated;
