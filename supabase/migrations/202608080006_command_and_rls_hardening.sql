-- Narrow browser grants to fields and commands that a signed-in user may safely change.
revoke update on public.profiles from authenticated;
drop policy if exists profiles_update_own on public.profiles;

revoke update on public.requests from authenticated;
grant update (purpose, project_name, team_members, requested_start, requested_end, updated_at) on public.requests to authenticated;
drop policy if exists requests_member_update_draft on public.requests;
create policy requests_member_update_draft on public.requests
for update to authenticated
using (borrower_id = (select auth.uid()) and status in ('draft','changes_requested'))
with check (borrower_id = (select auth.uid()) and status in ('draft','changes_requested'));

revoke update on public.waitlist_entries from authenticated;
drop policy if exists waitlist_member_update on public.waitlist_entries;

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function api.has_capability(required_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_capability((select auth.uid()), required_capability);
$$;
revoke all on function api.has_capability(text) from public, anon;
grant execute on function api.has_capability(text) to authenticated;

create or replace function api.decide_request(request_id uuid, decisions jsonb, reason text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.requests%rowtype;
  v_decision jsonb;
  v_line public.request_lines%rowtype;
  v_reservation_id uuid;
  v_asset_id uuid;
  v_mode public.tracking_mode;
  v_approved_count integer := 0;
  v_changed_count integer := 0;
  v_available integer;
  v_allocated integer;
  v_result jsonb;
  v_existing jsonb;
begin
  if v_actor_id is null or not private.has_capability(v_actor_id, 'request:approve') then
    raise exception 'resource unavailable' using errcode = '42501';
  end if;
  if char_length(idempotency_key) not between 12 and 120 then raise exception 'invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text || ':decide_request:' || idempotency_key, 0));
  select k.response into v_existing from public.idempotency_keys k
    where k.actor_id = v_actor_id and k.command = 'decide_request' and k.key = idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select r.* into v_request from public.requests r where r.id = decide_request.request_id for update;
  if not found or v_request.status not in ('submitted','under_review') then
    raise exception 'request state changed' using errcode = '40001';
  end if;
  if v_request.borrower_id = v_actor_id then
    raise exception 'requester cannot approve own request' using errcode = '42501';
  end if;
  if jsonb_typeof(decisions) <> 'array'
     or jsonb_array_length(decisions) <> (select count(*) from public.request_lines where request_lines.request_id = decide_request.request_id)
     or (select count(distinct value->>'line_id') from jsonb_array_elements(decisions)) <> jsonb_array_length(decisions) then
    raise exception 'every request line requires exactly one decision';
  end if;

  perform 1 from public.catalog_items i
    where i.id in (select rl.catalog_item_id from public.request_lines rl where rl.request_id = decide_request.request_id)
    order by i.id for update;

  for v_decision in select value from jsonb_array_elements(decisions) loop
    select * into v_line from public.request_lines
      where id = (v_decision->>'line_id')::uuid and request_lines.request_id = decide_request.request_id;
    if not found then raise exception 'request line unavailable'; end if;
    select tracking_mode into v_mode from public.catalog_items where id = v_line.catalog_item_id and archived_at is null;
    if not found then raise exception 'catalog item unavailable' using errcode = '40001'; end if;

    if (v_decision->>'decision') in ('approved','reduced') then
      if (v_decision->>'approved_quantity')::integer <= 0
         or (v_decision->>'approved_quantity')::integer > v_line.requested_quantity then
        raise exception 'approved quantity is invalid';
      end if;

      if v_mode = 'individual_asset' then
        if (v_decision->>'approved_quantity')::integer <> 1 then raise exception 'individual assets are approved one per line'; end if;
        select a.id into v_asset_id
        from public.individual_assets a
        where a.catalog_item_id = v_line.catalog_item_id
          and a.archived_at is null
          and a.custody_state = 'on_hand'
          and a.condition in ('perfect','minor_damage')
          and not exists (
            select 1 from public.reservation_lines arl
            join public.reservations ar on ar.id = arl.reservation_id
            where arl.individual_asset_id = a.id
              and ar.status in ('reserved','ready_for_pickup')
              and tstzrange(ar.starts_at, ar.ends_at, '[)') && tstzrange(v_request.requested_start, v_request.requested_end, '[)')
          )
        order by a.id
        limit 1
        for update of a;
        if v_asset_id is null then raise exception 'availability conflict' using errcode = '40001'; end if;
      else
        select coalesce(sum(quantity_on_hand), 0)::integer into v_available
          from public.pool_balances where catalog_item_id = v_line.catalog_item_id and condition in ('perfect','minor_damage');
        select coalesce(sum(rl.approved_quantity), 0)::integer into v_allocated
          from public.reservation_lines rl join public.reservations r on r.id = rl.reservation_id
          where rl.catalog_item_id = v_line.catalog_item_id
            and r.status in ('reserved','ready_for_pickup')
            and tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(v_request.requested_start, v_request.requested_end, '[)');
        if (v_decision->>'approved_quantity')::integer > v_available - v_allocated then
          raise exception 'availability conflict' using errcode = '40001';
        end if;
      end if;

      if v_reservation_id is null then
        insert into public.reservations(request_id, borrower_id, starts_at, ends_at, pickup_deadline)
        values(decide_request.request_id, v_request.borrower_id, v_request.requested_start, v_request.requested_end,
          v_request.requested_start + interval '24 hours') returning id into v_reservation_id;
      end if;
      insert into public.request_line_decisions(request_line_id, decision, approved_quantity, approved_start, approved_end, reason, actor_id)
      values(v_line.id, (v_decision->>'decision')::public.decision_state,
        (v_decision->>'approved_quantity')::integer, v_request.requested_start, v_request.requested_end,
        case when (v_decision->>'decision') = 'approved' then nullif(v_decision->>'reason','')
             else nullif(coalesce(v_decision->>'reason', decide_request.reason),'') end, v_actor_id);
      insert into public.reservation_lines(reservation_id, request_line_id, catalog_item_id, individual_asset_id, approved_quantity, remaining_quantity)
      values(v_reservation_id, v_line.id, v_line.catalog_item_id, v_asset_id,
        (v_decision->>'approved_quantity')::integer, (v_decision->>'approved_quantity')::integer);
      v_approved_count := v_approved_count + 1;
      if (v_decision->>'decision') = 'reduced' then v_changed_count := v_changed_count + 1; end if;
      v_asset_id := null;
    else
      insert into public.request_line_decisions(request_line_id, decision, approved_quantity, reason, actor_id)
      values(v_line.id, (v_decision->>'decision')::public.decision_state, 0,
        nullif(coalesce(v_decision->>'reason', decide_request.reason),''), v_actor_id);
      v_changed_count := v_changed_count + 1;
    end if;
  end loop;

  update public.requests r set status = case
      when v_approved_count = 0 and exists(select 1 from public.request_line_decisions d join public.request_lines l on l.id=d.request_line_id where l.request_id=r.id and d.decision='changes_requested') then 'changes_requested'::public.request_state
      when v_approved_count = 0 then 'rejected'::public.request_state
      when v_changed_count > 0 then 'partially_approved'::public.request_state
      else 'approved'::public.request_state end,
    updated_at = now(), version = version + 1
  where r.id = decide_request.request_id;
  insert into public.audit_events(actor_id, action, target_type, target_id, reason)
    values(v_actor_id, 'request.decided', 'request', decide_request.request_id, decide_request.reason);
  insert into public.notification_outbox(event_type, recipient_id, payload, deduplication_key)
    values('request_decided', v_request.borrower_id, jsonb_build_object('request_id',decide_request.request_id), 'request-decided:'||decide_request.request_id::text);
  v_result := jsonb_build_object('request_id', decide_request.request_id, 'reservation_id', v_reservation_id, 'approved_lines', v_approved_count);
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at)
    values(v_actor_id, 'decide_request', idempotency_key, v_result, now());
  return v_result;
end;
$$;

create or replace function api.confirm_handover(reservation_id uuid, due_at timestamptz, remarks text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid(); v_reservation public.reservations%rowtype; v_line record; v_balance record;
  v_needed integer; v_take integer; v_loan_id uuid; v_result jsonb; v_existing jsonb;
  v_mode public.tracking_mode; v_outgoing_condition public.condition_state;
begin
  if v_actor_id is null or not (private.has_capability(v_actor_id,'circulation:handover') or private.has_capability(v_actor_id,'inventory:manage')) then
    raise exception 'resource unavailable' using errcode = '42501';
  end if;
  if char_length(idempotency_key) not between 12 and 120 then raise exception 'invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text || ':confirm_handover:' || idempotency_key, 0));
  select k.response into v_existing from public.idempotency_keys k
    where k.actor_id = v_actor_id and k.command = 'confirm_handover' and k.key = idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select r.* into v_reservation from public.reservations r where r.id = confirm_handover.reservation_id for update;
  if not found or v_reservation.status not in ('reserved','ready_for_pickup') then raise exception 'reservation state changed' using errcode = '40001'; end if;
  if not exists(select 1 from public.profiles p join public.memberships m on m.profile_id=p.id where p.id=v_reservation.borrower_id and p.active and m.status='active') then
    raise exception 'borrower is not eligible';
  end if;
  perform 1 from public.reservation_lines where reservation_lines.reservation_id = confirm_handover.reservation_id order by catalog_item_id for update;
  insert into public.loans(borrower_id,reservation_id,handler_id,remarks)
    values(v_reservation.borrower_id,confirm_handover.reservation_id,v_actor_id,remarks) returning id into v_loan_id;

  for v_line in select rl.*, i.tracking_mode from public.reservation_lines rl
      join public.catalog_items i on i.id=rl.catalog_item_id
      where rl.reservation_id=confirm_handover.reservation_id order by rl.catalog_item_id loop
    v_needed := v_line.remaining_quantity; v_mode := v_line.tracking_mode; v_outgoing_condition := 'perfect';
    if v_mode in ('pooled_reusable','consumable') then
      for v_balance in select * from public.pool_balances
          where catalog_item_id=v_line.catalog_item_id and condition in ('perfect','minor_damage') and quantity_on_hand>0
          order by case condition when 'perfect' then 1 else 2 end, id for update loop
        exit when v_needed=0; v_take := least(v_needed,v_balance.quantity_on_hand);
        update public.pool_balances set quantity_on_hand=quantity_on_hand-v_take,version=version+1 where id=v_balance.id;
        insert into public.stock_adjustments(catalog_item_id,condition_from,quantity_delta,reason,source,actor_id)
          values(v_line.catalog_item_id,v_balance.condition,-v_take,remarks,'handover',v_actor_id);
        if v_balance.condition = 'minor_damage' then v_outgoing_condition := 'minor_damage'; end if;
        v_needed := v_needed-v_take;
      end loop;
      if v_needed>0 then raise exception 'stock changed before handover' using errcode='40001'; end if;
    else
      update public.individual_assets set custody_state='issued'
        where id=v_line.individual_asset_id and custody_state='on_hand' and condition in ('perfect','minor_damage')
        returning condition into v_outgoing_condition;
      if not found then raise exception 'asset is unavailable' using errcode='40001'; end if;
      insert into public.stock_adjustments(catalog_item_id,individual_asset_id,condition_from,quantity_delta,reason,source,actor_id)
        values(v_line.catalog_item_id,v_line.individual_asset_id,v_outgoing_condition,-1,remarks,'handover',v_actor_id);
    end if;
    insert into public.loan_lines(loan_id,catalog_item_id,reservation_line_id,individual_asset_id,issued_quantity,unresolved_quantity,outgoing_condition,due_at)
      values(v_loan_id,v_line.catalog_item_id,v_line.id,v_line.individual_asset_id,v_line.remaining_quantity,
        case when v_mode='consumable' then 0 else v_line.remaining_quantity end,v_outgoing_condition,
        case when v_mode='consumable' then null else confirm_handover.due_at end);
    update public.reservation_lines set remaining_quantity=0 where id=v_line.id;
  end loop;
  update public.reservations set status='issued' where id=confirm_handover.reservation_id;
  update public.loans l set status='returned' where l.id=v_loan_id
    and not exists(select 1 from public.loan_lines ll where ll.loan_id=v_loan_id and ll.unresolved_quantity>0);
  insert into public.audit_events(actor_id,action,target_type,target_id,reason) values(v_actor_id,'handover.confirmed','loan',v_loan_id,remarks);
  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key)
    values('handover_confirmed',v_reservation.borrower_id,jsonb_build_object('loan_id',v_loan_id),'handover:'||v_loan_id::text);
  v_result:=jsonb_build_object('loan_id',v_loan_id,'status','committed');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor_id,'confirm_handover',idempotency_key,v_result,now());
  return v_result;
end;
$$;

create or replace function api.confirm_return(loan_id uuid, lines jsonb, remarks text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid:=auth.uid(); v_loan public.loans%rowtype; v_input jsonb; v_line public.loan_lines%rowtype;
  v_event_id uuid; v_quantity integer; v_condition public.condition_state; v_result jsonb; v_existing jsonb;
  v_mode public.tracking_mode;
begin
  if v_actor_id is null or not (private.has_capability(v_actor_id,'circulation:return') or private.has_capability(v_actor_id,'inventory:manage')) then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines)=0 then raise exception 'return lines required'; end if;
  if char_length(idempotency_key) not between 12 and 120 then raise exception 'invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text || ':confirm_return:' || idempotency_key, 0));
  select k.response into v_existing from public.idempotency_keys k where k.actor_id=v_actor_id and k.command='confirm_return' and k.key=idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select l.* into v_loan from public.loans l where l.id=confirm_return.loan_id for update;
  if not found or v_loan.status='returned' then raise exception 'loan state changed' using errcode='40001'; end if;
  insert into public.return_events(loan_id,receiver_id,remarks) values(confirm_return.loan_id,v_actor_id,remarks) returning id into v_event_id;
  for v_input in select value from jsonb_array_elements(lines) loop
    select * into v_line from public.loan_lines
      where id=(v_input->>'loan_line_id')::uuid and loan_lines.loan_id=confirm_return.loan_id for update;
    v_quantity:=(v_input->>'quantity')::integer; v_condition:=(v_input->>'condition')::public.condition_state;
    if not found or v_quantity<=0 or v_quantity>v_line.unresolved_quantity then raise exception 'return quantity is invalid'; end if;
    select tracking_mode into v_mode from public.catalog_items where id=v_line.catalog_item_id;
    insert into public.return_lines(return_event_id,loan_line_id,quantity,incoming_condition,routed_to_maintenance)
      values(v_event_id,v_line.id,v_quantity,v_condition,v_condition in ('repair_required','not_working'));
    update public.loan_lines set unresolved_quantity=unresolved_quantity-v_quantity,
      due_at=case when unresolved_quantity-v_quantity=0 then null else due_at end, version=version+1 where id=v_line.id;
    if v_mode = 'individual_asset' then
      if v_quantity <> 1 then raise exception 'individual asset return quantity is invalid'; end if;
      update public.individual_assets set condition=v_condition,
        custody_state=case when v_condition in ('repair_required','not_working') then 'maintenance' else 'on_hand' end
        where id=v_line.individual_asset_id and custody_state='issued';
      if not found then raise exception 'asset return state changed' using errcode='40001'; end if;
    else
      insert into public.pool_balances(catalog_item_id,storage_location_id,condition,quantity_on_hand)
        values(v_line.catalog_item_id,null,v_condition,v_quantity)
        on conflict (catalog_item_id,storage_location_id,condition) do update
          set quantity_on_hand=public.pool_balances.quantity_on_hand+excluded.quantity_on_hand,version=public.pool_balances.version+1;
    end if;
    insert into public.stock_adjustments(catalog_item_id,individual_asset_id,condition_from,condition_to,quantity_delta,reason,source,actor_id)
      values(v_line.catalog_item_id,v_line.individual_asset_id,v_line.outgoing_condition,v_condition,v_quantity,remarks,'return',v_actor_id);
    if v_condition in ('repair_required','not_working') then
      insert into public.maintenance_events(catalog_item_id,individual_asset_id,condition_from,condition_to,action,remarks,actor_id)
        values(v_line.catalog_item_id,v_line.individual_asset_id,v_line.outgoing_condition,v_condition,'return_routed',remarks,v_actor_id);
    end if;
  end loop;
  update public.loans l set status=case
      when exists(select 1 from public.loan_lines ll where ll.loan_id=confirm_return.loan_id and unresolved_quantity>0) then 'partially_returned'::public.loan_state
      else 'returned'::public.loan_state end where l.id=confirm_return.loan_id;
  insert into public.audit_events(actor_id,action,target_type,target_id,reason) values(v_actor_id,'return.confirmed','return_event',v_event_id,remarks);
  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key)
    values('return_confirmed',v_loan.borrower_id,jsonb_build_object('return_event_id',v_event_id),'return:'||v_event_id::text);
  v_result:=jsonb_build_object('return_event_id',v_event_id,'status','committed');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor_id,'confirm_return',idempotency_key,v_result,now());
  return v_result;
end;
$$;

revoke all on function api.decide_request(uuid,jsonb,text,text) from public, anon;
revoke all on function api.confirm_handover(uuid,timestamptz,text,text) from public, anon;
revoke all on function api.confirm_return(uuid,jsonb,text,text) from public, anon;
grant execute on function api.decide_request(uuid,jsonb,text,text), api.confirm_handover(uuid,timestamptz,text,text), api.confirm_return(uuid,jsonb,text,text) to authenticated;
