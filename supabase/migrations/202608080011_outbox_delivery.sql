grant usage on schema api to service_role;

alter table public.notifications add column outbox_id uuid references public.notification_outbox(id) on delete restrict;
create unique index notifications_outbox_unique_idx on public.notifications(outbox_id) where outbox_id is not null;

create or replace function api.complete_outbox(
  outbox_id uuid,
  worker_id text,
  delivered boolean,
  provider_message_id text,
  error_class text,
  failure_classification text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_event public.notification_outbox%rowtype; v_attempt integer; v_terminal boolean; v_result jsonb;
begin
  if coalesce((select auth.role()),'')<>'service_role' then raise exception 'resource unavailable' using errcode='42501'; end if;
  if failure_classification not in ('transient','permanent') then raise exception 'invalid failure classification'; end if;
  select * into v_event from public.notification_outbox where id=complete_outbox.outbox_id for update;
  if not found or v_event.state<>'processing' or v_event.locked_by<>complete_outbox.worker_id then raise exception 'outbox claim changed' using errcode='40001'; end if;

  insert into public.notifications(outbox_id,recipient_id,event_type,title,body,related_entity_type,related_entity_id)
  values(v_event.id,v_event.recipient_id,v_event.event_type,
    initcap(replace(v_event.event_type,'_',' ')),
    'Open R.O.F.I.E.S Equipment Manager to review this update.',
    case when v_event.payload ? 'request_id' then 'request' when v_event.payload ? 'loan_id' then 'loan' else null end,
    case when v_event.payload ? 'request_id' then (v_event.payload->>'request_id')::uuid when v_event.payload ? 'loan_id' then (v_event.payload->>'loan_id')::uuid else null end)
  on conflict do nothing;

  v_attempt:=v_event.attempts+1;
  if delivered then
    update public.notification_outbox set state='delivered',attempts=v_attempt,locked_at=null,locked_by=null,terminal_error_class=null where id=v_event.id;
    insert into public.email_deliveries(outbox_id,provider_message_id,attempt,state) values(v_event.id,provider_message_id,v_attempt,'delivered');
    v_result:=jsonb_build_object('outbox_id',v_event.id,'state','delivered','attempts',v_attempt);
  else
    v_terminal:=failure_classification='permanent' or v_attempt>=5;
    update public.notification_outbox set state=case when v_terminal then 'failed'::public.delivery_state else 'pending'::public.delivery_state end,
      attempts=v_attempt,next_attempt_at=case when v_terminal then next_attempt_at else now()+make_interval(mins=>(2^(v_attempt-1))::integer) end,
      locked_at=null,locked_by=null,terminal_error_class=case when v_terminal then complete_outbox.error_class else null end where id=v_event.id;
    insert into public.email_deliveries(outbox_id,attempt,state,error_class) values(v_event.id,v_attempt,'failed',complete_outbox.error_class);
    v_result:=jsonb_build_object('outbox_id',v_event.id,'state',case when v_terminal then 'failed' else 'pending' end,'attempts',v_attempt);
  end if;
  return v_result;
end; $$;

revoke all on function api.complete_outbox(uuid,text,boolean,text,text,text) from public,anon,authenticated;
grant execute on function api.complete_outbox(uuid,text,boolean,text,text,text) to service_role;
