create or replace function api.create_category(name text, idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing jsonb;
  v_category_id uuid;
  v_result jsonb;
begin
  if v_actor is null or not private.has_capability(v_actor,'inventory:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':create_category:'||idempotency_key,0));
  select response into v_existing from public.idempotency_keys
    where actor_id=v_actor and command='create_category' and key=idempotency_key;
  if v_existing is not null then return v_existing; end if;

  begin
    insert into public.categories(name) values (create_category.name)
      returning id into v_category_id;
  exception
    when unique_violation then
      raise exception 'a category with this name already exists' using errcode='P0001';
  end;

  insert into public.audit_events(actor_id, action, target_type, target_id, reason)
    values (v_actor, 'category.created', 'category', v_category_id, 'Created via inventory admin');
  v_result := jsonb_build_object('category_id', v_category_id, 'status', 'committed');
  insert into public.idempotency_keys(actor_id, command, key, response, completed_at)
    values (v_actor, 'create_category', idempotency_key, v_result, now());
  return v_result;
end;
$$;

revoke all on function api.create_category(text,text) from public, anon;
grant execute on function api.create_category(text,text) to authenticated;
