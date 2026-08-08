create or replace function private.has_capability(subject_id uuid, required_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select subject_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      join public.role_assignments r on r.profile_id = p.id
      where p.id = subject_id
        and p.active
        and r.capability = required_capability
        and r.revoked_at is null
    );
$$;

create or replace function private.is_active_member(subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select subject_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      join public.memberships m on m.profile_id = p.id
      where p.id = subject_id and p.active and m.status = 'active'
    );
$$;

revoke all on function private.has_capability(uuid, text) from public, anon;
revoke all on function private.is_active_member(uuid) from public, anon;
grant execute on function private.has_capability(uuid, text) to authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;

create view api.catalog
with (security_barrier = true)
as
select
  i.id,
  i.name,
  i.description,
  i.tracking_mode,
  i.return_required,
  i.public_remarks,
  i.default_loan_days,
  i.maximum_loan_days,
  i.member_quantity_limit,
  i.waitlist_enabled,
  i.low_stock_threshold,
  c.id as category_id,
  c.name as category_name,
  coalesce(sum(b.quantity_on_hand) filter (where b.condition in ('perfect','minor_damage')), 0)::integer as usable_on_hand,
  coalesce(sum(b.quantity_on_hand) filter (where b.condition = 'repair_required'), 0)::integer as repair_quantity,
  coalesce(sum(b.quantity_on_hand) filter (where b.condition = 'not_working'), 0)::integer as not_working_quantity
from public.catalog_items i
join public.categories c on c.id = i.category_id
left join public.pool_balances b on b.catalog_item_id = i.id
where i.archived_at is null
group by i.id, c.id;

create view api.my_operational_summary
with (security_barrier = true)
as
select
  (select count(*) from public.requests r where r.borrower_id = (select auth.uid()) and r.status in ('submitted','under_review')) as pending_requests,
  (select count(*) from public.reservations r where r.borrower_id = (select auth.uid()) and r.status in ('reserved','ready_for_pickup')) as reservations,
  (select count(*) from public.loans l where l.borrower_id = (select auth.uid()) and l.status <> 'returned') as active_loans,
  (select count(*) from public.notifications n where n.recipient_id = (select auth.uid()) and n.read_at is null) as unread_notifications;

create view api.system_health
with (security_barrier = true)
as
select
  now() as checked_at,
  (select count(*) from public.notification_outbox where state = 'pending') as outbox_pending,
  (select extract(epoch from now() - min(created_at))::bigint from public.notification_outbox where state = 'pending') as oldest_outbox_seconds,
  (select count(*) from public.outage_reconciliations where review_state = 'pending') as unresolved_reconciliations,
  (select count(*) from public.loan_lines where unresolved_quantity > 0 and due_at < now()) as overdue_lines,
  exists(select 1 from public.system_notices where severity = 'critical' and starts_at <= now() and (ends_at is null or ends_at > now())) as critical_notice_active
where private.has_capability((select auth.uid()), 'system:manage');

grant select on api.catalog, api.my_operational_summary to authenticated;
grant select on api.system_health to authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.memberships, public.role_assignments to authenticated;
grant select, insert, update on public.requests, public.request_lines to authenticated;
grant select on public.request_line_decisions, public.reservations, public.reservation_lines to authenticated;
grant select, insert, update on public.waitlist_entries, public.waitlist_claims to authenticated;
grant select on public.loans, public.loan_lines, public.extension_requests, public.return_events, public.return_lines, public.loss_resolutions to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.contacts to authenticated;
grant select on public.catalog_items, public.categories, public.pool_balances, public.individual_assets, public.storage_locations, public.maintenance_events, public.stock_adjustments to authenticated;
grant select on public.audit_events, public.notification_outbox, public.email_deliveries, public.outage_reconciliations, public.policy_values, public.system_notices to authenticated;

create policy profiles_read_own on public.profiles for select to authenticated using (id = (select auth.uid()) or (select private.has_capability((select auth.uid()), 'membership:manage')));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy memberships_read_own_or_admin on public.memberships for select to authenticated using (profile_id = (select auth.uid()) or (select private.has_capability((select auth.uid()), 'membership:manage')));
create policy roles_read_own_or_admin on public.role_assignments for select to authenticated using (profile_id = (select auth.uid()) or (select private.has_capability((select auth.uid()), 'roles:manage')));

create policy catalog_staff_read on public.catalog_items for select to authenticated using ((select private.has_capability((select auth.uid()), 'inventory:manage')));
create policy categories_staff_read on public.categories for select to authenticated using ((select private.has_capability((select auth.uid()), 'inventory:manage')));
create policy balances_staff_read on public.pool_balances for select to authenticated using ((select private.has_capability((select auth.uid()), 'inventory:manage')));
create policy assets_staff_read on public.individual_assets for select to authenticated using ((select private.has_capability((select auth.uid()), 'inventory:manage')));
create policy locations_staff_read on public.storage_locations for select to authenticated using ((select private.has_capability((select auth.uid()), 'inventory:manage')));
create policy maintenance_staff_read on public.maintenance_events for select to authenticated using ((select private.has_capability((select auth.uid()), 'inventory:manage')));
create policy adjustments_staff_read on public.stock_adjustments for select to authenticated using ((select private.has_capability((select auth.uid()), 'inventory:manage')));

create policy requests_own_or_approver_read on public.requests for select to authenticated using (
  borrower_id = (select auth.uid()) or (select private.has_capability((select auth.uid()), 'request:approve')) or (select private.has_capability((select auth.uid()), 'inventory:manage'))
);
create policy requests_member_insert on public.requests for insert to authenticated with check (borrower_id = (select auth.uid()) and (select private.is_active_member((select auth.uid()))) and status = 'draft');
create policy requests_member_update_draft on public.requests for update to authenticated using (borrower_id = (select auth.uid()) and status in ('draft','changes_requested')) with check (borrower_id = (select auth.uid()));
create policy request_lines_own_or_staff_read on public.request_lines for select to authenticated using (exists (select 1 from public.requests r where r.id = request_id));
create policy request_lines_own_insert on public.request_lines for insert to authenticated with check (exists (select 1 from public.requests r where r.id = request_id and r.borrower_id = (select auth.uid()) and r.status = 'draft'));
create policy request_lines_own_update on public.request_lines for update to authenticated using (exists (select 1 from public.requests r where r.id = request_id and r.borrower_id = (select auth.uid()) and r.status = 'draft'));
create policy request_decisions_related_read on public.request_line_decisions for select to authenticated using (exists (select 1 from public.request_lines rl join public.requests r on r.id = rl.request_id where rl.id = request_line_id));

create policy reservations_own_or_staff_read on public.reservations for select to authenticated using (
  borrower_id = (select auth.uid()) or (select private.has_capability((select auth.uid()), 'request:approve')) or (select private.has_capability((select auth.uid()), 'inventory:manage'))
);
create policy reservation_lines_related_read on public.reservation_lines for select to authenticated using (exists (select 1 from public.reservations r where r.id = reservation_id));
create policy waitlist_own_or_staff_read on public.waitlist_entries for select to authenticated using (member_id = (select auth.uid()) or (select private.has_capability((select auth.uid()), 'request:approve')));
create policy waitlist_member_insert on public.waitlist_entries for insert to authenticated with check (member_id = (select auth.uid()) and (select private.is_active_member((select auth.uid()))));
create policy waitlist_member_update on public.waitlist_entries for update to authenticated using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));
create policy waitlist_claims_related_read on public.waitlist_claims for select to authenticated using (exists (select 1 from public.waitlist_entries w where w.id = waitlist_entry_id));

create policy loans_own_or_staff_read on public.loans for select to authenticated using (
  borrower_id = (select auth.uid()) or (select private.has_capability((select auth.uid()), 'inventory:manage')) or (select private.has_capability((select auth.uid()), 'request:approve'))
);
create policy loan_lines_related_read on public.loan_lines for select to authenticated using (exists (select 1 from public.loans l where l.id = loan_id));
create policy extension_related_read on public.extension_requests for select to authenticated using (requester_id = (select auth.uid()) or (select private.has_capability((select auth.uid()), 'request:approve')));
create policy return_events_related_read on public.return_events for select to authenticated using (exists (select 1 from public.loans l where l.id = loan_id));
create policy return_lines_related_read on public.return_lines for select to authenticated using (exists (select 1 from public.return_events e join public.loans l on l.id = e.loan_id where e.id = return_event_id));
create policy loss_related_read on public.loss_resolutions for select to authenticated using (exists (select 1 from public.loan_lines ll join public.loans l on l.id = ll.loan_id where ll.id = loan_line_id));

create policy notifications_own_read on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy contacts_visibility_read on public.contacts for select to authenticated using (
  active and (visibility = 'student' or (visibility = 'member' and (select private.is_active_member((select auth.uid())))) or (visibility = 'staff' and exists(select 1 from public.role_assignments r where r.profile_id = (select auth.uid()) and r.revoked_at is null)))
);
create policy audit_authorized_read on public.audit_events for select to authenticated using ((select private.has_capability((select auth.uid()), 'audit:read')));
create policy outbox_authorized_read on public.notification_outbox for select to authenticated using ((select private.has_capability((select auth.uid()), 'system:manage')));
create policy deliveries_authorized_read on public.email_deliveries for select to authenticated using ((select private.has_capability((select auth.uid()), 'system:manage')));
create policy reconciliation_authorized_read on public.outage_reconciliations for select to authenticated using ((select private.has_capability((select auth.uid()), 'inventory:manage')));
create policy policies_authorized_read on public.policy_values for select to authenticated using ((select private.has_capability((select auth.uid()), 'system:manage')));
create policy notices_signed_in_read on public.system_notices for select to authenticated using (audience = 'all' or (audience = 'members' and (select private.is_active_member((select auth.uid()))) or (audience = 'staff' and exists(select 1 from public.role_assignments r where r.profile_id = (select auth.uid()) and r.revoked_at is null))));

create or replace function api.submit_request(request_id uuid, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor_id uuid := auth.uid(); existing jsonb; result jsonb;
begin
  if v_actor_id is null or not private.is_active_member(v_actor_id) then raise exception 'resource unavailable' using errcode = '42501'; end if;
  select k.response into existing from public.idempotency_keys k where k.actor_id = v_actor_id and k.command = 'submit_request' and k.key = idempotency_key;
  if existing is not null then return existing; end if;
  if exists (select 1 from public.loan_lines ll join public.loans l on l.id = ll.loan_id where l.borrower_id = v_actor_id and ll.unresolved_quantity > 0 and ll.due_at < now()) then raise exception 'overdue equipment prevents new requests' using errcode = 'P0001'; end if;
  update public.requests r set status = 'submitted', submitted_at = now(), updated_at = now(), version = version + 1 where r.id = submit_request.request_id and r.borrower_id = v_actor_id and r.status in ('draft','changes_requested');
  if not found or not exists(select 1 from public.request_lines rl where rl.request_id = submit_request.request_id) then raise exception 'request cannot be submitted' using errcode = 'P0001'; end if;
  insert into public.audit_events(actor_id, action, target_type, target_id) values(v_actor_id, 'request.submitted', 'request', request_id);
  result := jsonb_build_object('request_id', request_id, 'status', 'submitted');
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at) values(v_actor_id, 'submit_request', idempotency_key, result, now());
  return result;
end;
$$;

create or replace function api.decide_request(request_id uuid, decisions jsonb, reason text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid(); borrower_id uuid; request_row public.requests%rowtype; decision_row jsonb; line_row public.request_lines%rowtype;
  reservation_id uuid; approved_count integer := 0; changed_count integer := 0; available integer; allocated integer; result jsonb; existing jsonb;
begin
  if v_actor_id is null or not private.has_capability(v_actor_id, 'request:approve') then raise exception 'resource unavailable' using errcode = '42501'; end if;
  select k.response into existing from public.idempotency_keys k where k.actor_id = v_actor_id and k.command = 'decide_request' and k.key = idempotency_key;
  if existing is not null then return existing; end if;
  select r.* into request_row from public.requests r where r.id = decide_request.request_id for update;
  if not found or request_row.status not in ('submitted','under_review') then raise exception 'request state changed' using errcode = '40001'; end if;
  borrower_id := request_row.borrower_id;
  if borrower_id = v_actor_id then raise exception 'requester cannot approve own request' using errcode = '42501'; end if;
  if jsonb_typeof(decisions) <> 'array' or jsonb_array_length(decisions) = 0 then raise exception 'at least one decision is required'; end if;
  perform 1 from public.catalog_items i where i.id in (select rl.catalog_item_id from public.request_lines rl where rl.request_id = request_id) order by i.id for update;
  for decision_row in select value from jsonb_array_elements(decisions) loop
    select * into line_row from public.request_lines where id = (decision_row->>'line_id')::uuid and request_lines.request_id = decide_request.request_id;
    if not found then raise exception 'request line unavailable' using errcode = 'P0001'; end if;
    if (decision_row->>'decision') in ('approved','reduced') then
      if (decision_row->>'approved_quantity')::integer <= 0 or (decision_row->>'approved_quantity')::integer > line_row.requested_quantity then raise exception 'approved quantity is invalid'; end if;
      select coalesce(sum(quantity_on_hand),0)::integer into available from public.pool_balances where catalog_item_id = line_row.catalog_item_id and condition in ('perfect','minor_damage');
      select coalesce(sum(rl.approved_quantity),0)::integer into allocated from public.reservation_lines rl join public.reservations r on r.id = rl.reservation_id where rl.catalog_item_id = line_row.catalog_item_id and r.status in ('reserved','ready_for_pickup') and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(request_row.requested_start,request_row.requested_end,'[)');
      if (decision_row->>'approved_quantity')::integer > available - allocated then raise exception 'availability conflict' using errcode = '40001'; end if;
      if reservation_id is null then
        insert into public.reservations(request_id, borrower_id, starts_at, ends_at, pickup_deadline) values(request_id, borrower_id, request_row.requested_start, request_row.requested_end, request_row.requested_start + interval '24 hours') returning id into reservation_id;
      end if;
      insert into public.request_line_decisions(request_line_id, decision, approved_quantity, approved_start, approved_end, reason, actor_id)
      values(line_row.id, (decision_row->>'decision')::public.decision_state, (decision_row->>'approved_quantity')::integer, request_row.requested_start, request_row.requested_end, nullif(coalesce(decision_row->>'reason', reason),''), v_actor_id);
      insert into public.reservation_lines(reservation_id, request_line_id, catalog_item_id, approved_quantity, remaining_quantity)
      values(reservation_id, line_row.id, line_row.catalog_item_id, (decision_row->>'approved_quantity')::integer, (decision_row->>'approved_quantity')::integer);
      approved_count := approved_count + 1;
      if (decision_row->>'decision') = 'reduced' then changed_count := changed_count + 1; end if;
    else
      insert into public.request_line_decisions(request_line_id, decision, approved_quantity, reason, actor_id)
      values(line_row.id, (decision_row->>'decision')::public.decision_state, 0, nullif(coalesce(decision_row->>'reason', reason),''), v_actor_id);
      changed_count := changed_count + 1;
    end if;
  end loop;
  update public.requests r set status = case when approved_count = 0 then 'rejected'::public.request_state when changed_count > 0 then 'partially_approved'::public.request_state else 'approved'::public.request_state end, updated_at = now(), version = version + 1 where r.id = decide_request.request_id;
  insert into public.audit_events(actor_id, action, target_type, target_id, reason) values(v_actor_id, 'request.decided', 'request', request_id, reason);
  insert into public.notification_outbox(event_type, recipient_id, payload, deduplication_key) values('request_decided', borrower_id, jsonb_build_object('request_id',request_id), 'request-decided:'||request_id::text);
  result := jsonb_build_object('request_id', request_id, 'reservation_id', reservation_id, 'approved_lines', approved_count);
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at) values(v_actor_id, 'decide_request', idempotency_key, result, now());
  return result;
end;
$$;

create or replace function api.confirm_handover(reservation_id uuid, due_at timestamptz, remarks text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor_id uuid := auth.uid(); reservation_row public.reservations%rowtype; line_row record; balance_row record; needed integer; take_quantity integer; loan_id uuid; result jsonb; existing jsonb; mode public.tracking_mode;
begin
  if v_actor_id is null or not (private.has_capability(v_actor_id,'circulation:handover') or private.has_capability(v_actor_id,'inventory:manage')) then raise exception 'resource unavailable' using errcode = '42501'; end if;
  select k.response into existing from public.idempotency_keys k where k.actor_id = v_actor_id and k.command = 'confirm_handover' and k.key = idempotency_key;
  if existing is not null then return existing; end if;
  select r.* into reservation_row from public.reservations r where r.id = confirm_handover.reservation_id for update;
  if not found or reservation_row.status not in ('reserved','ready_for_pickup') then raise exception 'reservation state changed' using errcode = '40001'; end if;
  if not exists(select 1 from public.profiles p join public.memberships m on m.profile_id=p.id where p.id=reservation_row.borrower_id and p.active and m.status='active') then raise exception 'borrower is not eligible' using errcode='P0001'; end if;
  perform 1 from public.reservation_lines where reservation_lines.reservation_id = confirm_handover.reservation_id order by catalog_item_id for update;
  insert into public.loans(borrower_id,reservation_id,handler_id,remarks) values(reservation_row.borrower_id,reservation_id,v_actor_id,remarks) returning id into loan_id;
  for line_row in select rl.*, i.tracking_mode from public.reservation_lines rl join public.catalog_items i on i.id=rl.catalog_item_id where rl.reservation_id=confirm_handover.reservation_id order by rl.catalog_item_id loop
    needed := line_row.remaining_quantity; mode := line_row.tracking_mode;
    if mode in ('pooled_reusable','consumable') then
      for balance_row in select * from public.pool_balances where catalog_item_id=line_row.catalog_item_id and condition in ('perfect','minor_damage') and quantity_on_hand>0 order by case condition when 'perfect' then 1 else 2 end, id for update loop
        exit when needed=0; take_quantity := least(needed,balance_row.quantity_on_hand);
        update public.pool_balances set quantity_on_hand=quantity_on_hand-take_quantity,version=version+1 where id=balance_row.id;
        needed := needed-take_quantity;
      end loop;
      if needed>0 then raise exception 'stock changed before handover' using errcode='40001'; end if;
    else
      update public.individual_assets set custody_state='issued' where id=line_row.individual_asset_id and custody_state in ('on_hand','reserved');
      if not found then raise exception 'asset is unavailable' using errcode='40001'; end if;
    end if;
    insert into public.loan_lines(loan_id,catalog_item_id,reservation_line_id,individual_asset_id,issued_quantity,unresolved_quantity,outgoing_condition,due_at)
    values(loan_id,line_row.catalog_item_id,line_row.id,line_row.individual_asset_id,line_row.remaining_quantity,case when mode='consumable' then 0 else line_row.remaining_quantity end,'perfect',case when mode='consumable' then null else due_at end);
    update public.reservation_lines set remaining_quantity=0 where id=line_row.id;
  end loop;
  update public.reservations r set status='issued' where r.id=confirm_handover.reservation_id;
  update public.loans set status='returned' where id=loan_id and not exists(select 1 from public.loan_lines where loan_lines.loan_id=confirm_handover.loan_id and unresolved_quantity>0);
  insert into public.audit_events(actor_id,action,target_type,target_id,reason) values(v_actor_id,'handover.confirmed','loan',loan_id,remarks);
  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key) values('handover_confirmed',reservation_row.borrower_id,jsonb_build_object('loan_id',loan_id),'handover:'||loan_id::text);
  result:=jsonb_build_object('loan_id',loan_id,'status','committed');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor_id,'confirm_handover',idempotency_key,result,now());
  return result;
end;
$$;

create or replace function api.confirm_return(loan_id uuid, lines jsonb, remarks text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor_id uuid:=auth.uid(); loan_row public.loans%rowtype; input_line jsonb; line_row public.loan_lines%rowtype; event_id uuid; quantity integer; condition public.condition_state; result jsonb; existing jsonb;
begin
  if v_actor_id is null or not (private.has_capability(v_actor_id,'circulation:return') or private.has_capability(v_actor_id,'inventory:manage')) then raise exception 'resource unavailable' using errcode='42501'; end if;
  select k.response into existing from public.idempotency_keys k where k.actor_id=v_actor_id and k.command='confirm_return' and k.key=idempotency_key;
  if existing is not null then return existing; end if;
  select l.* into loan_row from public.loans l where l.id=confirm_return.loan_id for update;
  if not found or loan_row.status='returned' then raise exception 'loan state changed' using errcode='40001'; end if;
  insert into public.return_events(loan_id,receiver_id,remarks) values(loan_id,v_actor_id,remarks) returning id into event_id;
  for input_line in select value from jsonb_array_elements(lines) loop
    select * into line_row from public.loan_lines where id=(input_line->>'loan_line_id')::uuid and loan_lines.loan_id=confirm_return.loan_id for update;
    quantity:=(input_line->>'quantity')::integer; condition:=(input_line->>'condition')::public.condition_state;
    if not found or quantity<=0 or quantity>line_row.unresolved_quantity then raise exception 'return quantity is invalid'; end if;
    insert into public.return_lines(return_event_id,loan_line_id,quantity,incoming_condition,routed_to_maintenance) values(event_id,line_row.id,quantity,condition,condition='repair_required');
    update public.loan_lines set unresolved_quantity=unresolved_quantity-quantity,version=version+1 where id=line_row.id;
    insert into public.pool_balances(catalog_item_id,storage_location_id,condition,quantity_on_hand) values(line_row.catalog_item_id,null,condition,quantity) on conflict (catalog_item_id,storage_location_id,condition) do update set quantity_on_hand=public.pool_balances.quantity_on_hand+excluded.quantity_on_hand,version=public.pool_balances.version+1;
    if condition='repair_required' then insert into public.maintenance_events(catalog_item_id,individual_asset_id,condition_from,condition_to,action,remarks,actor_id) values(line_row.catalog_item_id,line_row.individual_asset_id,line_row.outgoing_condition,condition,'return_routed',remarks,v_actor_id); end if;
  end loop;
  update public.loans l set status=case when exists(select 1 from public.loan_lines where loan_lines.loan_id=confirm_return.loan_id and unresolved_quantity>0) then 'partially_returned'::public.loan_state else 'returned'::public.loan_state end where l.id=confirm_return.loan_id;
  insert into public.audit_events(actor_id,action,target_type,target_id,reason) values(v_actor_id,'return.confirmed','return_event',event_id,remarks);
  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key) values('return_confirmed',loan_row.borrower_id,jsonb_build_object('return_event_id',event_id),'return:'||event_id::text);
  result:=jsonb_build_object('return_event_id',event_id,'status','committed');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor_id,'confirm_return',idempotency_key,result,now());
  return result;
end;
$$;

create or replace function api.claim_outbox(worker_id text, batch_size integer default 25)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if batch_size not between 1 and 100 then raise exception 'invalid batch size'; end if;
  return query
  with claimed as (
    select id from public.notification_outbox where state='pending' and next_attempt_at<=now() order by next_attempt_at,id for update skip locked limit batch_size
  )
  update public.notification_outbox o set state='processing',locked_at=now(),locked_by=worker_id from claimed where o.id=claimed.id returning o.*;
end;
$$;

revoke all on function api.submit_request(uuid,text) from public, anon;
revoke all on function api.decide_request(uuid,jsonb,text,text) from public, anon;
revoke all on function api.confirm_handover(uuid,timestamptz,text,text) from public, anon;
revoke all on function api.confirm_return(uuid,jsonb,text,text) from public, anon;
revoke all on function api.claim_outbox(text,integer) from public, anon, authenticated;
grant execute on function api.submit_request(uuid,text), api.decide_request(uuid,jsonb,text,text), api.confirm_handover(uuid,timestamptz,text,text), api.confirm_return(uuid,jsonb,text,text) to authenticated;
grant execute on function api.claim_outbox(text,integer) to service_role;
