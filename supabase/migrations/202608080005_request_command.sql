create or replace function api.create_request(
  purpose text,
  project_name text,
  requested_start timestamptz,
  requested_end timestamptz,
  lines jsonb,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor_id uuid:=auth.uid(); v_request_id uuid; input_line jsonb; v_item_id uuid; v_quantity integer; v_result jsonb; v_existing jsonb;
begin
  if v_actor_id is null or not private.is_active_member(v_actor_id) then raise exception 'resource unavailable' using errcode='42501'; end if;
  select k.response into v_existing from public.idempotency_keys k where k.actor_id=v_actor_id and k.command='create_request' and k.key=idempotency_key;
  if v_existing is not null then return v_existing; end if;
  if char_length(trim(purpose)) not between 3 and 1000 or requested_end<=requested_start or jsonb_typeof(lines)<>'array' or jsonb_array_length(lines) not between 1 and 20 then raise exception 'request input is invalid' using errcode='22023'; end if;
  if exists(select 1 from public.loan_lines ll join public.loans l on l.id=ll.loan_id where l.borrower_id=v_actor_id and ll.unresolved_quantity>0 and ll.due_at<now()) then raise exception 'overdue equipment prevents new requests' using errcode='P0001'; end if;
  insert into public.requests(borrower_id,status,purpose,project_name,requested_start,requested_end,submitted_at)
  values(v_actor_id,'submitted',trim(purpose),nullif(trim(project_name),''),requested_start,requested_end,now()) returning id into v_request_id;
  for input_line in select value from jsonb_array_elements(lines) loop
    v_item_id:=(input_line->>'catalog_item_id')::uuid; v_quantity:=(input_line->>'quantity')::integer;
    if v_quantity not between 1 and 50 or not exists(select 1 from public.catalog_items i where i.id=v_item_id and i.archived_at is null and (i.member_quantity_limit is null or v_quantity<=i.member_quantity_limit)) then raise exception 'request line is invalid' using errcode='22023'; end if;
    insert into public.request_lines(request_id,catalog_item_id,requested_quantity,member_remarks) values(v_request_id,v_item_id,v_quantity,coalesce(input_line->>'remarks',''));
  end loop;
  insert into public.audit_events(actor_id,action,target_type,target_id) values(v_actor_id,'request.submitted','request',v_request_id);
  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key) values('request_submitted',v_actor_id,jsonb_build_object('request_id',v_request_id),'request-submitted:'||v_request_id::text);
  v_result:=jsonb_build_object('request_id',v_request_id,'status','submitted');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor_id,'create_request',idempotency_key,v_result,now());
  return v_result;
end;
$$;
revoke all on function api.create_request(text,text,timestamptz,timestamptz,jsonb,text) from public,anon;
grant execute on function api.create_request(text,text,timestamptz,timestamptz,jsonb,text) to authenticated;
