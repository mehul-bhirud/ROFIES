create type public.member_application_state as enum (
  'incomplete',
  'pending_review',
  'changes_requested',
  'approved',
  'rejected'
);

create table public.institution_domains (
  domain text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (domain = lower(btrim(domain))),
  check (domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$')
);

create table public.member_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  state public.member_application_state not null default 'incomplete',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete restrict,
  decision_reason text check (decision_reason is null or char_length(decision_reason) between 3 and 500),
  decision_idempotency_key text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state in ('approved','rejected')) = (decided_at is not null)),
  check (decided_by is null or reviewed_at is not null)
);
create index member_applications_review_queue_idx
  on public.member_applications (submitted_at, id)
  where state = 'pending_review';
create index member_applications_reviewer_idx
  on public.member_applications (decided_by, reviewed_at desc)
  where decided_by is not null;

create table public.college_id_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.member_applications(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  bucket_id text not null default 'college-ids' check (bucket_id = 'college-ids'),
  object_name text not null unique check (char_length(object_name) between 40 and 240),
  media_type text not null default 'image/webp' check (media_type = 'image/webp'),
  byte_size integer not null check (byte_size between 1 and 5242880),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  is_current boolean not null default true,
  replaces_document_id uuid references public.college_id_documents(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  deletion_due_at timestamptz,
  deletion_claimed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deleted_at is null or deletion_due_at is not null)
);
create unique index college_id_documents_current_application_idx
  on public.college_id_documents (application_id)
  where is_current;
create index college_id_documents_owner_current_idx
  on public.college_id_documents (owner_id, application_id)
  where is_current and deleted_at is null;
create index college_id_documents_retention_idx
  on public.college_id_documents (deletion_due_at, id)
  where deleted_at is null and deletion_due_at is not null;
create index college_id_documents_replacement_idx
  on public.college_id_documents (replaces_document_id)
  where replaces_document_id is not null;

alter table public.profiles alter column active set default false;

insert into public.member_applications (
  profile_id,
  state,
  submitted_at,
  reviewed_at,
  decided_at,
  decided_by,
  decision_reason,
  created_at,
  updated_at
)
select
  m.profile_id,
  'approved'::public.member_application_state,
  coalesce(m.approved_at, p.created_at),
  coalesce(m.approved_at, p.created_at),
  coalesce(m.approved_at, p.created_at),
  m.approved_by,
  case
    when char_length(coalesce(m.reason, '')) between 3 and 500 then m.reason
    else 'Membership predates application verification'
  end,
  p.created_at,
  coalesce(m.updated_at, p.updated_at)
from public.memberships m
join public.profiles p on p.id = m.profile_id
where m.status = 'active'
on conflict (profile_id) do nothing;

alter table public.notifications add column deduplication_key text;
create unique index notifications_deduplication_key_unique_idx
  on public.notifications (deduplication_key)
  where deduplication_key is not null;
alter table public.idempotency_keys add column request_fingerprint text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('college-ids', 'college-ids', false, 5242880, array['image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.institution_domains enable row level security;
alter table public.member_applications enable row level security;
alter table public.college_id_documents enable row level security;

grant select on public.member_applications to authenticated;
revoke insert, update, delete on public.college_id_documents from authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke update on public.profiles from authenticated;
revoke select on api.catalog from authenticated;

create policy member_applications_own_or_reviewer_read
on public.member_applications
for select to authenticated
using (
  profile_id = (select auth.uid())
  or (select private.has_capability((select auth.uid()), 'membership:manage'))
);

create or replace function private.prepare_college_id_replacement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_id uuid;
begin
  if not exists (
    select 1
    from public.member_applications a
    where a.id = new.application_id
      and a.profile_id = new.owner_id
      and a.state in ('incomplete','changes_requested')
  ) then
    raise exception 'application is not open for document registration' using errcode = '42501';
  end if;

  if new.is_current then
    select d.id into v_previous_id
    from public.college_id_documents d
    where d.application_id = new.application_id and d.is_current
    for update;

    if v_previous_id is not null then
      if new.replaces_document_id is not null and new.replaces_document_id <> v_previous_id then
        raise exception 'replacement document changed' using errcode = '40001';
      end if;
      new.replaces_document_id := v_previous_id;
      update public.college_id_documents
      set is_current = false, updated_at = now()
      where id = v_previous_id;
    elsif new.replaces_document_id is not null then
      raise exception 'replacement document changed' using errcode = '40001';
    end if;
  end if;
  return new;
end;
$$;

create trigger college_id_documents_prepare_replacement
before insert on public.college_id_documents
for each row execute function private.prepare_college_id_replacement();

revoke all on function private.prepare_college_id_replacement() from public, anon, authenticated, service_role;

create or replace function api.register_college_id_document(
  application_id uuid,
  object_name text,
  byte_size integer,
  width integer,
  height integer,
  checksum_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.member_applications%rowtype;
  v_document public.college_id_documents%rowtype;
  v_document_id uuid;
begin
  if coalesce((select auth.role()),'') <> 'service_role' then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  if object_name !~ (
       '^applications/' || application_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
     )
     or byte_size not between 1 and 5242880
     or width not between 1 and 4096
     or height not between 1 and 4096
     or checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid college ID metadata';
  end if;

  select * into v_application
  from public.member_applications a
  where a.id=register_college_id_document.application_id
  for update;
  if not found or v_application.state not in ('incomplete','changes_requested') then
    raise exception 'application is not open for document registration' using errcode='40001';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='college-ids'
      and o.name=register_college_id_document.object_name
      and o.metadata->>'mimetype'='image/webp'
      and coalesce(o.metadata->>'size','') ~ '^[0-9]+$'
      and (o.metadata->>'size')::integer=register_college_id_document.byte_size
  ) then
    raise exception 'processed college ID object required';
  end if;

  select * into v_document from public.college_id_documents d
  where d.object_name=register_college_id_document.object_name;
  if found then
    if v_document.application_id<>register_college_id_document.application_id
       or v_document.owner_id<>v_application.profile_id
       or v_document.byte_size<>register_college_id_document.byte_size
       or v_document.width<>register_college_id_document.width
       or v_document.height<>register_college_id_document.height
       or v_document.checksum_sha256<>register_college_id_document.checksum_sha256 then
      raise exception 'document registration idempotency conflict' using errcode='40001';
    end if;
    return jsonb_build_object('application_id',v_application.id,'document_id',v_document.id,'state','registered');
  end if;

  insert into public.college_id_documents(
    application_id,owner_id,object_name,byte_size,width,height,checksum_sha256
  ) values (
    v_application.id,v_application.profile_id,register_college_id_document.object_name,
    register_college_id_document.byte_size,register_college_id_document.width,
    register_college_id_document.height,register_college_id_document.checksum_sha256
  ) returning id into v_document_id;
  insert into public.audit_events(actor_id,action,target_type,target_id,after_summary)
  values(null,'college_id.registered','member_application',v_application.id,
    jsonb_build_object('document_id',v_document_id,'byte_size',byte_size,'width',width,'height',height));
  return jsonb_build_object('application_id',v_application.id,'document_id',v_document_id,'state','registered');
end;
$$;

revoke all on function api.register_college_id_document(uuid,text,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function api.register_college_id_document(uuid,text,integer,integer,integer,text) to service_role;

create or replace function api.search_catalog(
  search_query text default '', range_start timestamptz default null, range_end timestamptz default null,
  result_limit integer default 40, result_offset integer default 0
)
returns table(
  id uuid,name text,description text,category_name text,tracking_mode public.tracking_mode,public_remarks text,
  usable_on_hand integer,available_quantity integer,repair_quantity integer,expected_on timestamptz,tags jsonb,specifications jsonb
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not private.is_active_member((select auth.uid())) then return; end if;
  return query select * from api.search_catalog_unchecked(search_query,range_start,range_end,result_limit,result_offset);
end;
$$;

revoke all on function api.search_catalog(text,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function api.search_catalog(text,timestamptz,timestamptz,integer,integer) to authenticated;

create or replace function private.create_notification(
  recipient_id uuid,
  event_type text,
  title text,
  body text,
  related_entity_type text,
  related_entity_id uuid,
  deduplication_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_id uuid;
  v_existing public.notifications%rowtype;
begin
  if recipient_id is null
     or char_length(btrim(event_type)) not between 3 and 100
     or char_length(btrim(title)) not between 1 and 160
     or char_length(btrim(body)) not between 1 and 1000
     or char_length(btrim(deduplication_key)) not between 12 and 240 then
    raise exception 'invalid notification';
  end if;

  insert into public.notifications (
    recipient_id,event_type,title,body,related_entity_type,related_entity_id,deduplication_key
  ) values (
    recipient_id,btrim(event_type),btrim(title),btrim(body),related_entity_type,related_entity_id,deduplication_key
  )
  on conflict do nothing
  returning id into v_notification_id;

  if v_notification_id is not null then return v_notification_id; end if;

  select * into v_existing
  from public.notifications n
  where n.deduplication_key = create_notification.deduplication_key;
  if not found
     or v_existing.recipient_id <> recipient_id
     or v_existing.event_type <> btrim(event_type)
     or v_existing.title <> btrim(title)
     or v_existing.body <> btrim(body)
     or v_existing.related_entity_type is distinct from related_entity_type
     or v_existing.related_entity_id is distinct from related_entity_id then
    raise exception 'notification idempotency conflict' using errcode = '40001';
  end if;
  return v_existing.id;
end;
$$;

create or replace function api.submit_member_application(
  display_name text,
  student_identifier text,
  study_year smallint,
  department text,
  phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_auth_email text;
  v_jwt_email text := lower(btrim(coalesce(auth.jwt()->>'email','')));
  v_email_confirmed_at timestamptz;
  v_application public.member_applications%rowtype;
begin
  if v_actor is null then raise exception 'resource unavailable' using errcode = '42501'; end if;
  select lower(btrim(u.email)),u.email_confirmed_at into v_auth_email,v_email_confirmed_at
  from auth.users u where u.id=v_actor;
  if v_email_confirmed_at is null then
    raise exception 'email confirmation required' using errcode = '42501';
  end if;
  if v_jwt_email = '' or v_jwt_email <> v_auth_email
     or not exists (
       select 1 from public.institution_domains d
       where d.active and d.domain = split_part(v_jwt_email,'@',2)
         and split_part(v_jwt_email,'@',1) <> ''
     ) then
    raise exception 'institutional email required' using errcode = '42501';
  end if;
  if char_length(btrim(display_name)) not between 1 and 120
     or char_length(btrim(student_identifier)) not between 1 and 80
     or char_length(btrim(department)) not between 1 and 120
     or study_year not between 1 and 8
     or (phone is not null and char_length(btrim(phone)) not between 7 and 24) then
    raise exception 'invalid application profile';
  end if;

  update public.profiles p set
    institutional_email=v_auth_email,
    display_name=btrim(submit_member_application.display_name),
    student_identifier=btrim(submit_member_application.student_identifier),
    department=btrim(submit_member_application.department),
    study_year=submit_member_application.study_year,
    phone=nullif(btrim(submit_member_application.phone),''),
    updated_at=now()
  where p.id=v_actor;
  if not found then raise exception 'application unavailable' using errcode='42501'; end if;

  select * into v_application
  from public.member_applications a where a.profile_id=v_actor for update;
  if not found or v_application.state not in ('incomplete','changes_requested') then
    raise exception 'application state changed' using errcode='40001';
  end if;
  if not exists (
    select 1 from public.college_id_documents d
    join storage.objects o on o.bucket_id=d.bucket_id and o.name=d.object_name
    where d.application_id=v_application.id and d.owner_id=v_actor
      and d.is_current and d.deleted_at is null
      and o.metadata->>'mimetype'=d.media_type
      and coalesce(o.metadata->>'size','') ~ '^[0-9]+$'
      and (o.metadata->>'size')::integer=d.byte_size
  ) then raise exception 'current college ID storage object required'; end if;

  update public.member_applications set
    state='pending_review', submitted_at=now(), updated_at=now(), version=version+1
  where id=v_application.id;
  insert into public.audit_events(actor_id,action,target_type,target_id,after_summary)
  values(v_actor,'member_application.submitted','member_application',v_application.id,
    jsonb_build_object('state','pending_review'));
  return jsonb_build_object('application_id',v_application.id,'state','pending_review');
end;
$$;

create or replace function api.member_application_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'application_id',a.id,
    'state',a.state,
    'submitted_at',a.submitted_at,
    'decided_at',a.decided_at,
    'decision_reason',a.decision_reason,
    'membership_status',coalesce(m.status::text,'inactive')
  ) into v_result
  from public.member_applications a
  left join public.memberships m on m.profile_id=a.profile_id
  where a.profile_id=(select auth.uid());
  return v_result;
end;
$$;

create or replace function api.review_member_application(
  application_id uuid,
  decision text,
  reason text,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_application public.member_applications%rowtype;
  v_existing jsonb;
  v_existing_fingerprint text;
  v_request_fingerprint text;
  v_result jsonb;
  v_now timestamptz := now();
  v_membership_status text;
  v_event_type text;
  v_title text;
  v_body text;
begin
  if v_actor is null or not private.has_capability(v_actor,'membership:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  if char_length(idempotency_key) not between 12 and 120 then raise exception 'invalid idempotency key'; end if;
  if decision not in ('approved','changes_requested','rejected')
     or char_length(btrim(reason)) not between 3 and 500 then
    raise exception 'invalid review decision';
  end if;
  v_request_fingerprint:=encode(extensions.digest(
    jsonb_build_object(
      'application_id',application_id,
      'decision',decision,
      'reason',btrim(reason)
    )::text,
    'sha256'
  ),'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':review_member_application:'||idempotency_key,0));
  select k.response,k.request_fingerprint into v_existing,v_existing_fingerprint from public.idempotency_keys k
  where k.actor_id=v_actor and k.command='review_member_application' and k.key=idempotency_key;
  if v_existing is not null then
    if v_existing_fingerprint is distinct from v_request_fingerprint then
      raise exception 'idempotency key reused with different request' using errcode='40001';
    end if;
    return v_existing;
  end if;

  select * into v_application from public.member_applications a
  where a.id=review_member_application.application_id for update;
  if not found then raise exception 'application unavailable' using errcode='40001'; end if;
  if v_application.profile_id=v_actor then
    raise exception 'requester may not review own application' using errcode='42501';
  end if;
  if v_application.state<>'pending_review' then raise exception 'application state changed' using errcode='40001'; end if;
  update public.member_applications set
    state=decision::public.member_application_state,
    reviewed_at=v_now,
    decided_at=case when decision in ('approved','rejected') then v_now else null end,
    decided_by=v_actor,
    decision_reason=btrim(reason),
    decision_idempotency_key=idempotency_key,
    version=version+1,
    updated_at=v_now
  where id=v_application.id;

  if decision in ('approved','rejected') then
    update public.college_id_documents d set
      deletion_due_at=v_now+interval '30 days', deletion_claimed_at=null, updated_at=v_now
    where d.application_id=v_application.id and d.deleted_at is null;
  end if;

  if decision='approved' then
    insert into public.memberships(profile_id,status,approved_by,approved_at,reason,updated_at)
    values(v_application.profile_id,'active',v_actor,v_now,btrim(reason),v_now)
    on conflict (profile_id) do update set
      status='active',approved_by=excluded.approved_by,approved_at=excluded.approved_at,
      reason=excluded.reason,updated_at=excluded.updated_at;
    update public.profiles set active=true,updated_at=v_now where id=v_application.profile_id;
    v_membership_status:='active';
    v_event_type:='member_application_approved';
    v_title:='Membership approved';
    v_body:='Your identity was verified and your membership is now active.';
  elsif decision='changes_requested' then
    select coalesce(m.status::text,'inactive') into v_membership_status
    from public.profiles p left join public.memberships m on m.profile_id=p.id
    where p.id=v_application.profile_id;
    v_event_type:='member_application_changes_requested';
    v_title:='Changes requested';
    v_body:='Your membership application needs changes before it can be reviewed again.';
  else
    select coalesce(m.status::text,'inactive') into v_membership_status
    from public.profiles p left join public.memberships m on m.profile_id=p.id
    where p.id=v_application.profile_id;
    update public.profiles set active=false,updated_at=v_now where id=v_application.profile_id;
    v_event_type:='member_application_rejected';
    v_title:='Membership application rejected';
    v_body:='Your membership application was not approved.';
  end if;

  insert into public.audit_events(actor_id,action,target_type,target_id,reason,after_summary)
  values(v_actor,'member_application.reviewed','member_application',v_application.id,btrim(reason),
    jsonb_build_object('state',decision,'membership_status',v_membership_status));
  perform private.create_notification(
    v_application.profile_id,v_event_type,v_title,v_body,'member_application',v_application.id,
    'member-application:'||v_application.id::text||':'||idempotency_key
  );
  v_result:=jsonb_build_object(
    'application_id',v_application.id,'state',decision,'membership_status',v_membership_status
  );
  insert into public.idempotency_keys(actor_id,command,key,response,request_fingerprint,completed_at)
  values(v_actor,'review_member_application',idempotency_key,v_result,v_request_fingerprint,v_now);
  return v_result;
end;
$$;

create or replace function api.college_id_object(application_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_object_name text;
begin
  if v_actor is null or not private.has_capability(v_actor,'membership:manage') then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  select d.object_name into v_object_name
  from public.member_applications a
  join public.college_id_documents d on d.application_id=a.id
  where a.id=college_id_object.application_id and a.state='pending_review'
    and d.is_current and d.deleted_at is null;
  if not found then raise exception 'document unavailable' using errcode='42501'; end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,after_summary)
  values(v_actor,'college_id.accessed','member_application',college_id_object.application_id,
    jsonb_build_object('document_id',(select id from public.college_id_documents where object_name=v_object_name)));
  return v_object_name;
end;
$$;

create or replace function api.claim_expired_college_ids(batch_size integer default 100)
returns table(document_id uuid, bucket_id text, object_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'resource unavailable' using errcode='42501';
  end if;
  if batch_size not between 1 and 100 then raise exception 'invalid batch size'; end if;
  return query
  with candidates as (
    select d.id
    from public.college_id_documents d
    where d.deleted_at is null
      and d.deletion_due_at<=now()
      and (d.deletion_claimed_at is null or d.deletion_claimed_at<now()-interval '15 minutes')
    order by d.deletion_due_at,d.id
    limit batch_size
    for update skip locked
  ), claimed as (
    update public.college_id_documents d
    set deletion_claimed_at=now(),updated_at=now()
    from candidates c where d.id=c.id
    returning d.id,d.bucket_id,d.object_name
  )
  select c.id,c.bucket_id,c.object_name from claimed c;
end;
$$;

revoke all on function private.create_notification(uuid,text,text,text,text,uuid,text) from public, anon, authenticated, service_role;
revoke all on function api.submit_member_application(text,text,smallint,text,text) from public, anon;
revoke all on function api.member_application_status() from public, anon;
revoke all on function api.review_member_application(uuid,text,text,text) from public, anon;
revoke all on function api.college_id_object(uuid) from public, anon;
revoke all on function api.claim_expired_college_ids(integer) from public, anon, authenticated;

grant execute on function api.submit_member_application(text,text,smallint,text,text) to authenticated;
grant execute on function api.member_application_status() to authenticated;
grant execute on function api.review_member_application(uuid,text,text,text) to authenticated;
grant execute on function api.college_id_object(uuid) to authenticated;
grant execute on function api.claim_expired_college_ids(integer) to service_role;
