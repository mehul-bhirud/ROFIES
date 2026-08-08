create table private.rate_limit_events (
  actor_id uuid not null,
  command text not null,
  occurred_at timestamptz not null default now()
);
create index rate_limit_events_window_idx on private.rate_limit_events (actor_id, command, occurred_at desc);
revoke all on private.rate_limit_events from public, anon, authenticated;

create or replace function api.consume_rate_limit(command text, maximum integer, window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor_id uuid := auth.uid(); event_count integer;
begin
  if v_actor_id is null or maximum not between 1 and 1000 or window_seconds not between 1 and 86400 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text || ':' || command, 0));
  delete from private.rate_limit_events where actor_id=v_actor_id and rate_limit_events.command=consume_rate_limit.command and occurred_at < now() - make_interval(secs => window_seconds);
  select count(*) into event_count from private.rate_limit_events where actor_id=v_actor_id and rate_limit_events.command=consume_rate_limit.command and occurred_at >= now() - make_interval(secs => window_seconds);
  if event_count >= maximum then return false; end if;
  insert into private.rate_limit_events(actor_id,command) values(v_actor_id,command);
  return true;
end;
$$;
revoke all on function api.consume_rate_limit(text,integer,integer) from public, anon;
grant execute on function api.consume_rate_limit(text,integer,integer) to authenticated;
