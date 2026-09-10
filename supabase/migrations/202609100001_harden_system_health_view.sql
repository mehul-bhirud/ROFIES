-- Fixes Supabase lint: Security Definer View (api.system_health).
-- The view intentionally needs to read across all users' rows to compute
-- org-wide health counts, so it can't use security_invoker=true (the
-- underlying tables' RLS policies restrict each user to their own rows).
-- Instead of owning the view with `postgres` (BYPASSRLS, unlimited blast
-- radius), it's re-owned by a dedicated role that can only SELECT the
-- specific tables this view needs, via additive RLS policies scoped to
-- that role. Access is still gated by private.has_capability(auth.uid(),
-- 'system:manage') in the view body -- this just narrows what a bug or
-- bypass of that gate could expose.

create role api_system_health_reader nologin noinherit;

-- postgres must be a member of the new role to transfer view ownership to it
grant api_system_health_reader to postgres;

-- alter ... owner to requires the new owner to have create on the schema
grant usage, create on schema api to api_system_health_reader;

grant select on
  public.notifications,
  public.college_id_documents,
  public.audit_events,
  public.outage_reconciliations,
  public.loan_lines,
  public.system_notices
to api_system_health_reader;

create policy system_health_full_read on public.notifications
  for select to api_system_health_reader using (true);
create policy system_health_full_read on public.college_id_documents
  for select to api_system_health_reader using (true);
create policy system_health_full_read on public.audit_events
  for select to api_system_health_reader using (true);
create policy system_health_full_read on public.outage_reconciliations
  for select to api_system_health_reader using (true);
create policy system_health_full_read on public.loan_lines
  for select to api_system_health_reader using (true);
create policy system_health_full_read on public.system_notices
  for select to api_system_health_reader using (true);

alter view api.system_health owner to api_system_health_reader;
