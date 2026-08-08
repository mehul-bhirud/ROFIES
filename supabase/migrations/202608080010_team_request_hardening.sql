create or replace function api.create_request(
  purpose text,
  project_name text,
  requested_start timestamptz,
  requested_end timestamptz,
  team_members jsonb,
  lines jsonb,
  idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_request uuid; v_input jsonb; v_item uuid; v_quantity integer; v_result jsonb; v_existing jsonb;
begin
  if v_actor is null or not private.is_active_member(v_actor) then raise exception 'resource unavailable' using errcode='42501'; end if;
  if char_length(idempotency_key) not between 12 and 120 then raise exception 'invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':create_request:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys where actor_id=v_actor and command='create_request' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;
  if char_length(trim(purpose)) not between 3 and 1000 or requested_end<=requested_start or requested_end<=now()
    or jsonb_typeof(team_members)<>'array' or jsonb_array_length(team_members)>20
    or jsonb_typeof(lines)<>'array' or jsonb_array_length(lines) not between 1 and 20 then raise exception 'request input is invalid' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(team_members) member where jsonb_typeof(member.value)<>'string' or char_length(trim(member.value#>>'{}')) not between 1 and 120) then raise exception 'team member input is invalid'; end if;
  if exists(select 1 from public.loan_lines ll join public.loans l on l.id=ll.loan_id where l.borrower_id=v_actor and ll.unresolved_quantity>0 and ll.due_at<now()) then raise exception 'overdue equipment prevents new requests'; end if;
  insert into public.requests(borrower_id,status,purpose,project_name,team_members,requested_start,requested_end,submitted_at)
    values(v_actor,'submitted',trim(purpose),nullif(trim(project_name),''),team_members,requested_start,requested_end,now()) returning id into v_request;
  for v_input in select value from jsonb_array_elements(lines) loop
    v_item:=(v_input->>'catalog_item_id')::uuid; v_quantity:=(v_input->>'quantity')::integer;
    if v_quantity not between 1 and 50 or not exists(
      select 1 from public.catalog_items i where i.id=v_item and i.archived_at is null
        and (i.member_quantity_limit is null or v_quantity<=i.member_quantity_limit)
        and (exists(select 1 from public.pool_balances b where b.catalog_item_id=i.id and b.condition in ('perfect','minor_damage'))
          or exists(select 1 from public.individual_assets a where a.catalog_item_id=i.id and a.archived_at is null and a.condition in ('perfect','minor_damage')))
    ) then raise exception 'request line is invalid' using errcode='22023'; end if;
    insert into public.request_lines(request_id,catalog_item_id,requested_quantity,member_remarks)
      values(v_request,v_item,v_quantity,coalesce(v_input->>'remarks',''));
  end loop;
  insert into public.audit_events(actor_id,action,target_type,target_id) values(v_actor,'request.submitted','request',v_request);
  insert into public.notification_outbox(event_type,recipient_id,payload,deduplication_key) values('request_submitted',v_actor,jsonb_build_object('request_id',v_request),'request-submitted:'||v_request::text);
  v_result:=jsonb_build_object('request_id',v_request,'status','submitted');
  insert into public.idempotency_keys(actor_id,command,key,response,completed_at) values(v_actor,'create_request',idempotency_key,v_result,now());
  return v_result;
end; $$;

create or replace function api.create_request(
  purpose text, project_name text, requested_start timestamptz, requested_end timestamptz, lines jsonb, idempotency_key text
)
returns jsonb language sql security definer set search_path=''
as $$ select api.create_request(purpose,project_name,requested_start,requested_end,'[]'::jsonb,lines,idempotency_key); $$;

revoke all on function api.create_request(text,text,timestamptz,timestamptz,jsonb,jsonb,text) from public,anon;
revoke all on function api.create_request(text,text,timestamptz,timestamptz,jsonb,text) from public,anon;
grant execute on function api.create_request(text,text,timestamptz,timestamptz,jsonb,jsonb,text),api.create_request(text,text,timestamptz,timestamptz,jsonb,text) to authenticated;
