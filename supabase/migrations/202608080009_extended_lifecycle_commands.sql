revoke insert,update on public.waitlist_entries from authenticated;

create or replace function api.cancel_request(request_id uuid, reason text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_request public.requests%rowtype; v_existing jsonb; v_result jsonb;
begin
  if v_actor is null then raise exception 'resource unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':cancel_request:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys where actor_id=v_actor and command='cancel_request' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_request from public.requests where id=cancel_request.request_id for update;
  if not found or v_request.borrower_id<>v_actor or v_request.status not in ('draft','submitted','under_review','approved','partially_approved','changes_requested') then
    raise exception 'request state changed' using errcode='40001';
  end if;
  if exists(select 1 from public.reservations r where r.request_id=cancel_request.request_id and r.status='issued') then raise exception 'issued custody cannot be cancelled'; end if;
  update public.reservations r set status='cancelled',cancellation_reason=cancel_request.reason where r.request_id=cancel_request.request_id and r.status in ('reserved','ready_for_pickup');
  update public.requests set status='cancelled',updated_at=now(),version=version+1 where id=cancel_request.request_id;
  insert into public.audit_events(actor_id,action,target_type,target_id,reason) values(v_actor,'request.cancelled','request',cancel_request.request_id,cancel_request.reason);
  v_result:=jsonb_build_object('request_id',cancel_request.request_id,'status','cancelled');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor,'cancel_request',idempotency_key,v_result,now());
  return v_result;
end; $$;

create or replace function api.join_waitlist(catalog_item_id uuid, quantity integer, desired_start timestamptz, desired_end timestamptz, idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_item public.catalog_items%rowtype; v_entry uuid; v_existing jsonb; v_result jsonb;
begin
  if v_actor is null or not private.is_active_member(v_actor) then raise exception 'resource unavailable' using errcode='42501'; end if;
  if quantity<=0 or desired_end<=desired_start or desired_end<=now() then raise exception 'invalid waitlist range or quantity'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':join_waitlist:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys where actor_id=v_actor and command='join_waitlist' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;
  if exists(select 1 from public.loan_lines ll join public.loans l on l.id=ll.loan_id where l.borrower_id=v_actor and ll.unresolved_quantity>0 and ll.due_at<now()) then raise exception 'overdue equipment prevents waitlist join'; end if;
  select * into v_item from public.catalog_items where id=join_waitlist.catalog_item_id and archived_at is null for update;
  if not found or not v_item.waitlist_enabled or quantity>coalesce(v_item.member_quantity_limit,quantity) then raise exception 'waitlist unavailable'; end if;
  if not exists(select 1 from public.pool_balances where pool_balances.catalog_item_id=join_waitlist.catalog_item_id and condition in ('perfect','minor_damage')
                union all select 1 from public.individual_assets where individual_assets.catalog_item_id=join_waitlist.catalog_item_id and condition in ('perfect','minor_damage') and archived_at is null) then
    raise exception 'item is not requestable';
  end if;
  if exists(select 1 from public.waitlist_entries where member_id=v_actor and waitlist_entries.catalog_item_id=join_waitlist.catalog_item_id and state in ('waiting','offered')
    and tstzrange(waitlist_entries.desired_start,waitlist_entries.desired_end,'[)') && tstzrange(join_waitlist.desired_start,join_waitlist.desired_end,'[)')) then raise exception 'active waitlist entry already exists'; end if;
  insert into public.waitlist_entries(member_id,catalog_item_id,quantity,desired_start,desired_end)
    values(v_actor,join_waitlist.catalog_item_id,join_waitlist.quantity,join_waitlist.desired_start,join_waitlist.desired_end) returning id into v_entry;
  insert into public.audit_events(actor_id,action,target_type,target_id) values(v_actor,'waitlist.joined','waitlist_entry',v_entry);
  v_result:=jsonb_build_object('waitlist_entry_id',v_entry,'status','waiting');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor,'join_waitlist',idempotency_key,v_result,now());
  return v_result;
end; $$;

create or replace function api.request_extension(loan_line_id uuid, proposed_due_at timestamptz, reason text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_line public.loan_lines%rowtype; v_loan public.loans%rowtype; v_max smallint; v_extension uuid; v_existing jsonb; v_result jsonb;
begin
  if v_actor is null or not private.is_active_member(v_actor) then raise exception 'resource unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':request_extension:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys where actor_id=v_actor and command='request_extension' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_line from public.loan_lines where id=request_extension.loan_line_id for update;
  select * into v_loan from public.loans where id=v_line.loan_id;
  select maximum_loan_days into v_max from public.catalog_items where id=v_line.catalog_item_id;
  if not found or v_loan.borrower_id<>v_actor or v_line.unresolved_quantity<=0 or proposed_due_at<=v_line.due_at
    or (v_max is not null and proposed_due_at>v_loan.handover_at+make_interval(days=>v_max)) then raise exception 'extension unavailable' using errcode='40001'; end if;
  if exists(select 1 from public.extension_requests where extension_requests.loan_line_id=request_extension.loan_line_id and decision='pending') then raise exception 'extension already pending'; end if;
  insert into public.extension_requests(loan_line_id,requester_id,proposed_due_at,member_reason)
    values(request_extension.loan_line_id,v_actor,request_extension.proposed_due_at,request_extension.reason) returning id into v_extension;
  insert into public.audit_events(actor_id,action,target_type,target_id,reason) values(v_actor,'extension.requested','extension_request',v_extension,request_extension.reason);
  v_result:=jsonb_build_object('extension_request_id',v_extension,'status','pending');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor,'request_extension',idempotency_key,v_result,now());
  return v_result;
end; $$;

create or replace function api.decide_extension(extension_request_id uuid, decision text, reason text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_extension public.extension_requests%rowtype; v_line public.loan_lines%rowtype; v_result jsonb; v_existing jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'request:approve') then raise exception 'resource unavailable' using errcode='42501'; end if;
  if decision not in ('approved','rejected') then raise exception 'invalid extension decision'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':decide_extension:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys where actor_id=v_actor and command='decide_extension' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_extension from public.extension_requests where id=decide_extension.extension_request_id for update;
  if not found or v_extension.decision<>'pending' or v_extension.requester_id=v_actor then raise exception 'extension state changed' using errcode='40001'; end if;
  select * into v_line from public.loan_lines where id=v_extension.loan_line_id for update;
  if decision='approved' and exists(
    select 1 from public.reservation_lines rl join public.reservations r on r.id=rl.reservation_id
    where rl.catalog_item_id=v_line.catalog_item_id and r.status in ('reserved','ready_for_pickup')
      and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(v_line.due_at,v_extension.proposed_due_at,'[)')
  ) then raise exception 'extension availability conflict' using errcode='40001'; end if;
  update public.extension_requests set decision=decide_extension.decision,approver_id=v_actor,decision_reason=decide_extension.reason,decided_at=now()
    where id=decide_extension.extension_request_id;
  if decision='approved' then update public.loan_lines set due_at=v_extension.proposed_due_at,version=version+1 where id=v_extension.loan_line_id; end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,reason) values(v_actor,'extension.decided','extension_request',decide_extension.extension_request_id,decide_extension.reason);
  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key)
    values('extension_decided',v_extension.requester_id,jsonb_build_object('extension_request_id',decide_extension.extension_request_id,'decision',decision),'extension-decided:'||decide_extension.extension_request_id::text);
  v_result:=jsonb_build_object('extension_request_id',decide_extension.extension_request_id,'status',decision);
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor,'decide_extension',idempotency_key,v_result,now());
  return v_result;
end; $$;

create or replace function api.counter_issue(member_id uuid, catalog_item_id uuid, quantity integer, remarks text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_item public.catalog_items%rowtype; v_balance record; v_needed integer; v_take integer; v_loan uuid; v_result jsonb; v_existing jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'inventory:manage') then raise exception 'resource unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':counter_issue:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys where actor_id=v_actor and command='counter_issue' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;
  if not exists(select 1 from public.profiles p join public.memberships m on m.profile_id=p.id where p.id=counter_issue.member_id and p.active and m.status='active') then raise exception 'member unavailable'; end if;
  select * into v_item from public.catalog_items where id=counter_issue.catalog_item_id and archived_at is null for update;
  if not found or v_item.tracking_mode<>'consumable' or not v_item.counter_issue_enabled or quantity<=0 or quantity>coalesce(v_item.member_quantity_limit,quantity) then raise exception 'counter issue unavailable'; end if;
  v_needed:=quantity;
  for v_balance in select * from public.pool_balances where pool_balances.catalog_item_id=counter_issue.catalog_item_id and condition in ('perfect','minor_damage') and quantity_on_hand>0 order by id for update loop
    exit when v_needed=0; v_take:=least(v_needed,v_balance.quantity_on_hand);
    update public.pool_balances set quantity_on_hand=quantity_on_hand-v_take,version=version+1 where id=v_balance.id;
    insert into public.stock_adjustments(catalog_item_id,condition_from,quantity_delta,reason,source,actor_id) values(counter_issue.catalog_item_id,v_balance.condition,-v_take,counter_issue.remarks,'handover',v_actor);
    v_needed:=v_needed-v_take;
  end loop;
  if v_needed>0 then raise exception 'stock changed before counter issue' using errcode='40001'; end if;
  insert into public.loans(borrower_id,handler_id,status,remarks) values(counter_issue.member_id,v_actor,'returned',counter_issue.remarks) returning id into v_loan;
  insert into public.loan_lines(loan_id,catalog_item_id,issued_quantity,unresolved_quantity,outgoing_condition,due_at) values(v_loan,counter_issue.catalog_item_id,quantity,0,'perfect',null);
  insert into public.audit_events(actor_id,action,target_type,target_id,reason) values(v_actor,'counter_issue.confirmed','loan',v_loan,counter_issue.remarks);
  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key) values('counter_issue_confirmed',counter_issue.member_id,jsonb_build_object('loan_id',v_loan),'counter-issue:'||v_loan::text);
  v_result:=jsonb_build_object('loan_id',v_loan,'status','committed');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor,'counter_issue',idempotency_key,v_result,now());
  return v_result;
end; $$;

create or replace function api.resolve_loss(loan_line_id uuid, quantity integer, resolution text, reason text, idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_line public.loan_lines%rowtype; v_loan public.loans%rowtype; v_loss uuid; v_result jsonb; v_existing jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'inventory:manage') then raise exception 'resource unavailable' using errcode='42501'; end if;
  if resolution not in ('lost','written_off') then raise exception 'invalid loss resolution'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':resolve_loss:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys where actor_id=v_actor and command='resolve_loss' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_line from public.loan_lines where id=resolve_loss.loan_line_id for update;
  if not found or quantity<=0 or quantity>v_line.unresolved_quantity then raise exception 'loss quantity invalid'; end if;
  select * into v_loan from public.loans where id=v_line.loan_id for update;
  insert into public.loss_resolutions(loan_line_id,quantity,resolution,reason,actor_id)
    values(resolve_loss.loan_line_id,resolve_loss.quantity,resolve_loss.resolution,resolve_loss.reason,v_actor) returning id into v_loss;
  update public.loan_lines set unresolved_quantity=unresolved_quantity-resolve_loss.quantity,
    due_at=case when unresolved_quantity-resolve_loss.quantity=0 then null else due_at end,version=version+1 where id=resolve_loss.loan_line_id;
  if v_line.individual_asset_id is not null then update public.individual_assets set custody_state='written_off',condition='not_working' where id=v_line.individual_asset_id; end if;
  update public.loans set status=case when exists(select 1 from public.loan_lines where loan_id=v_loan.id and unresolved_quantity>0) then 'partially_returned'::public.loan_state else 'returned'::public.loan_state end where id=v_loan.id;
  insert into public.audit_events(actor_id,action,target_type,target_id,reason) values(v_actor,'loss.resolved','loss_resolution',v_loss,resolve_loss.reason);
  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key) values('loss_resolved',v_loan.borrower_id,jsonb_build_object('loss_resolution_id',v_loss),'loss:'||v_loss::text);
  v_result:=jsonb_build_object('loss_resolution_id',v_loss,'status','committed');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor,'resolve_loss',idempotency_key,v_result,now());
  return v_result;
end; $$;

revoke all on function api.cancel_request(uuid,text,text),api.join_waitlist(uuid,integer,timestamptz,timestamptz,text),api.request_extension(uuid,timestamptz,text,text),api.decide_extension(uuid,text,text,text),api.counter_issue(uuid,uuid,integer,text,text),api.resolve_loss(uuid,integer,text,text,text) from public,anon;
grant execute on function api.cancel_request(uuid,text,text),api.join_waitlist(uuid,integer,timestamptz,timestamptz,text),api.request_extension(uuid,timestamptz,text,text),api.decide_extension(uuid,text,text,text),api.counter_issue(uuid,uuid,integer,text,text),api.resolve_loss(uuid,integer,text,text,text) to authenticated;
