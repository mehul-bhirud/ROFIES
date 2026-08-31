create table public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  institutional_email text not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','dismissed')),
  requested_at timestamptz not null default now(),
  processed_by uuid references public.profiles(id) on delete restrict,
  processed_at timestamptz,
  admin_note text,
  check (institutional_email = lower(btrim(institutional_email))),
  check (institutional_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  check (admin_note is null or char_length(admin_note) <= 500),
  check (status = 'pending' or processed_at is not null)
);

create unique index password_reset_requests_open_email_idx
on public.password_reset_requests (institutional_email)
where status in ('pending','processing');
create index password_reset_requests_pending_idx
on public.password_reset_requests (status, requested_at);

alter table public.password_reset_requests enable row level security;
revoke all on public.password_reset_requests from public, anon, authenticated;
grant select on public.password_reset_requests to authenticated;

create policy password_reset_requests_admin_read
on public.password_reset_requests
for select
to authenticated
using (
  (select private.has_capability((select auth.uid()), 'system:manage'))
  or (select private.has_capability((select auth.uid()), 'roles:manage'))
);

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
  if not exists (
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
