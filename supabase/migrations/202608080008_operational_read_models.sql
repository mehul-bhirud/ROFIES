create or replace function api.approval_queue(result_limit integer default 50)
returns table(
  request_id uuid, line_id uuid, borrower_name text, borrower_identifier text, membership_status public.membership_state,
  purpose text, project_name text, requested_start timestamptz, requested_end timestamptz,
  item_name text, requested_quantity integer, usable_quantity integer, allocated_quantity integer
)
language sql stable security definer set search_path=''
as $$
  select r.id, rl.id, p.display_name, p.student_identifier, m.status, r.purpose, r.project_name,
    r.requested_start, r.requested_end, i.name, rl.requested_quantity,
    case when i.tracking_mode='individual_asset'
      then (select count(*) from public.individual_assets a where a.catalog_item_id=i.id and a.custody_state='on_hand' and a.condition in ('perfect','minor_damage') and a.archived_at is null)
      else (select coalesce(sum(b.quantity_on_hand),0) from public.pool_balances b where b.catalog_item_id=i.id and b.condition in ('perfect','minor_damage')) end::integer,
    coalesce((select sum(x.approved_quantity) from public.reservation_lines x join public.reservations ar on ar.id=x.reservation_id
      where x.catalog_item_id=i.id and ar.status in ('reserved','ready_for_pickup')
      and tstzrange(ar.starts_at,ar.ends_at,'[)') && tstzrange(r.requested_start,r.requested_end,'[)')),0)::integer
  from public.requests r
  join public.profiles p on p.id=r.borrower_id
  join public.memberships m on m.profile_id=p.id
  join public.request_lines rl on rl.request_id=r.id
  join public.catalog_items i on i.id=rl.catalog_item_id
  where private.has_capability((select auth.uid()),'request:approve') and r.status in ('submitted','under_review')
  order by r.submitted_at nulls last,r.id,rl.id
  limit least(greatest(result_limit,1),100);
$$;

create or replace function api.handover_queue(result_limit integer default 50)
returns table(
  reservation_id uuid, borrower_name text, borrower_identifier text, membership_status public.membership_state,
  purpose text, item_name text, remaining_quantity integer, pickup_deadline timestamptz
)
language sql stable security definer set search_path=''
as $$
  select r.id,p.display_name,p.student_identifier,m.status,req.purpose,i.name,rl.remaining_quantity,r.pickup_deadline
  from public.reservations r
  join public.profiles p on p.id=r.borrower_id join public.memberships m on m.profile_id=p.id
  join public.requests req on req.id=r.request_id join public.reservation_lines rl on rl.reservation_id=r.id
  join public.catalog_items i on i.id=rl.catalog_item_id
  where (private.has_capability((select auth.uid()),'circulation:handover') or private.has_capability((select auth.uid()),'inventory:manage'))
    and r.status in ('reserved','ready_for_pickup')
  order by r.pickup_deadline,r.id,rl.id limit least(greatest(result_limit,1),100);
$$;

create or replace function api.return_queue(result_limit integer default 50)
returns table(
  loan_id uuid, loan_line_id uuid, borrower_name text, item_name text, tracking_mode public.tracking_mode,
  unresolved_quantity integer, outgoing_condition public.condition_state, due_at timestamptz
)
language sql stable security definer set search_path=''
as $$
  select l.id,ll.id,p.display_name,i.name,i.tracking_mode,ll.unresolved_quantity,ll.outgoing_condition,ll.due_at
  from public.loans l join public.loan_lines ll on ll.loan_id=l.id join public.profiles p on p.id=l.borrower_id
  join public.catalog_items i on i.id=ll.catalog_item_id
  where (private.has_capability((select auth.uid()),'circulation:return') or private.has_capability((select auth.uid()),'inventory:manage'))
    and ll.unresolved_quantity>0
  order by ll.due_at nulls last,l.id,ll.id limit least(greatest(result_limit,1),100);
$$;

create or replace function api.staff_dashboard()
returns table(pending_requests bigint,ready_pickups bigint,overdue_loans bigint,repair_queue bigint,outbox_pending bigint)
language sql stable security definer set search_path=''
as $$
  select
    (select count(*) from public.requests where status in ('submitted','under_review')),
    (select count(*) from public.reservations where status='ready_for_pickup'),
    (select count(*) from public.loan_lines where unresolved_quantity>0 and due_at<now()),
    ((select coalesce(sum(quantity_on_hand),0) from public.pool_balances where condition in ('repair_required','not_working'))+
      (select count(*) from public.individual_assets where condition in ('repair_required','not_working') and archived_at is null))::bigint,
    (select count(*) from public.notification_outbox where state='pending')
  where exists(select 1 from public.role_assignments r where r.profile_id=(select auth.uid()) and r.revoked_at is null);
$$;

revoke all on function api.approval_queue(integer), api.handover_queue(integer), api.return_queue(integer), api.staff_dashboard() from public,anon;
grant execute on function api.approval_queue(integer), api.handover_queue(integer), api.return_queue(integer), api.staff_dashboard() to authenticated;
