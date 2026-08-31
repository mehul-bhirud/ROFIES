create or replace function api.request_manual_password_reset(requested_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(requested_email));
  v_id uuid;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return null;
  end if;
  if v_email <> 'mehul.c.bhirud@gmail.com'
     and not exists (
       select 1
       from public.institution_domains d
       where d.active and d.domain = split_part(v_email, '@', 2)
     ) then
    return null;
  end if;

  select id into v_id
  from public.password_reset_requests
  where institutional_email = v_email and status in ('pending','processing')
  order by requested_at desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.password_reset_requests(institutional_email)
    values (v_email)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id
    from public.password_reset_requests
    where institutional_email = v_email and status in ('pending','processing')
    order by requested_at desc
    limit 1;
  end;
  return v_id;
end;
$$;

revoke all on function api.request_manual_password_reset(text) from public, anon, authenticated;
grant execute on function api.request_manual_password_reset(text) to service_role;
