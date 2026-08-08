alter table public.notifications add column if not exists archived_at timestamptz;

update public.notifications
set deduplication_key = coalesce(deduplication_key, 'legacy-notification:' || id::text)
where deduplication_key is null;

alter table public.notifications alter column deduplication_key set not null;
create index if not exists notifications_recipient_unarchived_created_idx
  on public.notifications (recipient_id, created_at desc)
  where archived_at is null;
create index if not exists notifications_archivable_idx
  on public.notifications (read_at)
  where read_at is not null and archived_at is null;

drop policy if exists notifications_own_read on public.notifications;
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_read on public.notifications
for select to authenticated
using (recipient_id = (select auth.uid()) and archived_at is null);
create policy notifications_own_update on public.notifications
for update to authenticated
using (recipient_id = (select auth.uid()) and archived_at is null)
with check (recipient_id = (select auth.uid()) and archived_at is null);
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function api.archive_read_notifications(batch_size integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'resource unavailable' using errcode = '42501';
  end if;
  if batch_size not between 1 and 5000 then raise exception 'invalid batch size'; end if;

  with selected as (
    select id
    from public.notifications
    where read_at < now() - interval '180 days'
      and archived_at is null
    order by read_at, id
    limit batch_size
    for update skip locked
  ),
  archived as (
    update public.notifications n
    set archived_at = now()
    from selected s
    where n.id = s.id
    returning n.id
  )
  select count(*)::integer into v_archived from archived;

  return jsonb_build_object('archived', v_archived);
end;
$$;
revoke all on function api.archive_read_notifications(integer) from public, anon, authenticated;
grant execute on function api.archive_read_notifications(integer) to service_role;

do $migration$
declare
  v_sql text;
  v_before text;
begin
  v_sql := pg_get_functiondef('api.create_request(text,text,timestamptz,timestamptz,jsonb,jsonb,text)'::regprocedure);
  v_before := v_sql;
  v_sql := replace(v_sql,
$old$  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key) values('request_submitted',v_actor,jsonb_build_object('request_id',v_request),'request-submitted:'||v_request::text);$old$,
$new$  perform private.create_notification(
    v_actor,
    'request_submitted',
    'Request received',
    'Your request is ready for staff review.',
    'request',
    v_request,
    'request-submitted:'||v_request::text
  );$new$);
  if v_sql = v_before then raise exception 'create_request notification replacement failed'; end if;
  execute v_sql;

  v_sql := pg_get_functiondef('api.decide_request(uuid,jsonb,text,text)'::regprocedure);
  v_before := v_sql;
  v_sql := replace(v_sql,
$old$  insert into public.notification_outbox(event_type, recipient_id, payload, deduplication_key)
    values('request_decided', v_request.borrower_id, jsonb_build_object('request_id',decide_request.request_id), 'request-decided:'||decide_request.request_id::text);$old$,
$new$  perform private.create_notification(
    v_request.borrower_id,
    'request_decided',
    'Request decision posted',
    'Your equipment request has been reviewed.',
    'request',
    decide_request.request_id,
    'request-decided:'||decide_request.request_id::text
  );$new$);
  if v_sql = v_before then raise exception 'decide_request notification replacement failed'; end if;
  execute v_sql;

  v_sql := pg_get_functiondef('api.confirm_handover(uuid,timestamptz,text,text)'::regprocedure);
  v_before := v_sql;
  v_sql := replace(v_sql,
$old$  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key)
    values('handover_confirmed',v_reservation.borrower_id,jsonb_build_object('loan_id',v_loan_id),'handover:'||v_loan_id::text);$old$,
$new$  perform private.create_notification(
    v_reservation.borrower_id,
    'handover_confirmed',
    'Equipment issued',
    'Your handover was confirmed and the loan is now recorded.',
    'loan',
    v_loan_id,
    'handover:'||v_loan_id::text
  );$new$);
  if v_sql = v_before then raise exception 'confirm_handover notification replacement failed'; end if;
  execute v_sql;

  v_sql := pg_get_functiondef('api.confirm_return(uuid,jsonb,text,text)'::regprocedure);
  v_before := v_sql;
  v_sql := replace(v_sql,
$old$  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key)
    values('return_confirmed',v_loan.borrower_id,jsonb_build_object('return_event_id',v_event_id),'return:'||v_event_id::text);$old$,
$new$  perform private.create_notification(
    v_loan.borrower_id,
    'return_confirmed',
    'Return recorded',
    'Your equipment return was confirmed.',
    'return_event',
    v_event_id,
    'return:'||v_event_id::text
  );$new$);
  if v_sql = v_before then raise exception 'confirm_return notification replacement failed'; end if;
  execute v_sql;

  v_sql := pg_get_functiondef('api.decide_extension(uuid,text,text,text)'::regprocedure);
  v_before := v_sql;
  v_sql := replace(v_sql,
$old$  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key)
    values('extension_decided',v_extension.requester_id,jsonb_build_object('extension_request_id',decide_extension.extension_request_id,'decision',decision),'extension-decided:'||decide_extension.extension_request_id::text);$old$,
$new$  perform private.create_notification(
    v_extension.requester_id,
    'extension_decided',
    'Extension decision posted',
    'Your loan extension request has been reviewed.',
    'extension_request',
    decide_extension.extension_request_id,
    'extension-decided:'||decide_extension.extension_request_id::text
  );$new$);
  if v_sql = v_before then raise exception 'decide_extension notification replacement failed'; end if;
  execute v_sql;

  v_sql := pg_get_functiondef('api.counter_issue(uuid,uuid,integer,text,text)'::regprocedure);
  v_before := v_sql;
  v_sql := replace(v_sql,
$old$  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key) values('counter_issue_confirmed',counter_issue.member_id,jsonb_build_object('loan_id',v_loan),'counter-issue:'||v_loan::text);$old$,
$new$  perform private.create_notification(
    counter_issue.member_id,
    'counter_issue_confirmed',
    'Counter issue recorded',
    'A consumable issue was recorded for your account.',
    'loan',
    v_loan,
    'counter-issue:'||v_loan::text
  );$new$);
  if v_sql = v_before then raise exception 'counter_issue notification replacement failed'; end if;
  execute v_sql;

  v_sql := pg_get_functiondef('api.resolve_loss(uuid,integer,text,text,text)'::regprocedure);
  v_before := v_sql;
  v_sql := replace(v_sql,
$old$  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key) values('loss_resolved',v_loan.borrower_id,jsonb_build_object('loss_resolution_id',v_loss),'loss:'||v_loss::text);$old$,
$new$  perform private.create_notification(
    v_loan.borrower_id,
    'loss_resolved',
    'Loss resolution recorded',
    'A loss or write-off resolution was recorded for your loan.',
    'loss_resolution',
    v_loss,
    'loss:'||v_loss::text
  );$new$);
  if v_sql = v_before then raise exception 'resolve_loss notification replacement failed'; end if;
  execute v_sql;
end;
$migration$;

update public.notifications n
set deduplication_key = o.deduplication_key
from public.notification_outbox o
where n.outbox_id = o.id
  and n.deduplication_key is distinct from o.deduplication_key;

insert into public.notifications (
  recipient_id,event_type,title,body,related_entity_type,related_entity_id,deduplication_key,created_at
)
select
  o.recipient_id,
  o.event_type,
  case o.event_type
    when 'request_submitted' then 'Request received'
    when 'request_decided' then 'Request decision posted'
    when 'handover_confirmed' then 'Equipment issued'
    when 'return_confirmed' then 'Return recorded'
    when 'extension_decided' then 'Extension decision posted'
    when 'counter_issue_confirmed' then 'Counter issue recorded'
    when 'loss_resolved' then 'Loss resolution recorded'
    else 'Equipment update'
  end,
  case o.event_type
    when 'request_submitted' then 'Your request is ready for staff review.'
    when 'request_decided' then 'Your equipment request has been reviewed.'
    when 'handover_confirmed' then 'Your handover was confirmed and the loan is now recorded.'
    when 'return_confirmed' then 'Your equipment return was confirmed.'
    when 'extension_decided' then 'Your loan extension request has been reviewed.'
    when 'counter_issue_confirmed' then 'A consumable issue was recorded for your account.'
    when 'loss_resolved' then 'A loss or write-off resolution was recorded for your loan.'
    else 'A R.O.F.I.E.S equipment update is available in the app.'
  end,
  null,
  null,
  o.deduplication_key,
  o.created_at
from public.notification_outbox o
where not exists (
  select 1 from public.notifications n where n.deduplication_key = o.deduplication_key
);

alter table public.notifications drop column if exists outbox_id;

drop view if exists api.system_health;
drop function if exists api.complete_outbox(uuid,text,boolean,text,text,text);
drop function if exists api.claim_outbox(text,integer);
drop function if exists api.outbox_recipient_email(uuid,text);
drop table if exists public.email_deliveries;
drop table if exists public.notification_outbox;
drop type if exists public.delivery_state;

create view api.system_health
with (security_barrier = true)
as
select
  now() as checked_at,
  (select count(*) from public.notifications where archived_at is null and read_at is null) as unread_notifications,
  (select count(*) from public.notifications where archived_at is null and read_at < now() - interval '180 days') as archivable_notifications,
  (select count(*) from public.college_id_documents where deleted_at is null and deletion_due_at < now()) as retention_failures,
  (select count(*) from public.outage_reconciliations where review_state = 'pending') as unresolved_reconciliations,
  (select count(*) from public.loan_lines where unresolved_quantity > 0 and due_at < now()) as overdue_lines,
  exists(select 1 from public.system_notices where severity = 'critical' and starts_at <= now() and (ends_at is null or ends_at > now())) as critical_notice_active
where private.has_capability((select auth.uid()), 'system:manage');
grant select on api.system_health to authenticated;

create or replace view api.my_operational_summary
with (security_barrier = true)
as
select
  (select count(*) from public.requests r where r.borrower_id = (select auth.uid()) and r.status in ('submitted','under_review')) as pending_requests,
  (select count(*) from public.reservations r where r.borrower_id = (select auth.uid()) and r.status in ('reserved','ready_for_pickup')) as reservations,
  (select count(*) from public.loans l where l.borrower_id = (select auth.uid()) and l.status <> 'returned') as active_loans,
  (select count(*) from public.notifications n where n.recipient_id = (select auth.uid()) and n.read_at is null and n.archived_at is null) as unread_notifications;

drop function if exists api.staff_dashboard();
create function api.staff_dashboard()
returns table(
  pending_requests bigint,
  pending_member_applications bigint,
  ready_pickups bigint,
  overdue_loans bigint,
  repair_queue bigint
)
language sql stable security definer set search_path=''
as $$
  select
    (select count(*) from public.requests where status in ('submitted','under_review')),
    (select count(*) from public.member_applications where state='pending_review'),
    (select count(*) from public.reservations where status='ready_for_pickup'),
    (select count(*) from public.loan_lines where unresolved_quantity>0 and due_at<now()),
    ((select coalesce(sum(quantity_on_hand),0) from public.pool_balances where condition in ('repair_required','not_working'))+
      (select count(*) from public.individual_assets where condition in ('repair_required','not_working') and archived_at is null))::bigint
  where exists(select 1 from public.role_assignments r where r.profile_id=(select auth.uid()) and r.revoked_at is null);
$$;
revoke all on function api.staff_dashboard() from public,anon;
grant execute on function api.staff_dashboard() to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.proname in (
        'create_request','decide_request','confirm_handover','confirm_return',
        'decide_extension','counter_issue','resolve_loss'
      )
      and pg_get_functiondef(p.oid) like '%notification_outbox%'
  ) then
    raise exception 'outbox dependency remains in command functions';
  end if;
end;
$$;
