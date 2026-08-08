import { execFileSync } from "node:child_process";

function docker(args: string[]) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

const containers = docker(["ps", "--format", "{{.Names}}"])
  .split(/\r?\n/)
  .filter((name) => name.startsWith("supabase_db_"));
if (containers.length !== 1)
  throw new Error(
    `Expected exactly one local Supabase database container; found ${containers.length}.`
  );

const container = containers[0]!;
const restoreDatabase = `rofies_restore_${Date.now()}`;
const dumpPath = `/tmp/${restoreDatabase}.dump`;
const exerciseProfileId = "99999999-9999-4999-8999-999999999991";
const exerciseApplicationId = "99999999-9999-4999-8999-999999999992";
const exerciseDocumentId = "99999999-9999-4999-8999-999999999993";
let created = false;

try {
  docker([
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `
      insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
      values('00000000-0000-0000-0000-000000000000','${exerciseProfileId}','authenticated','authenticated','backup.exercise@iiitp.ac.in','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')
      on conflict (id) do nothing;
      insert into public.profiles(id,institutional_email,display_name,student_identifier,department,study_year,active)
      values('${exerciseProfileId}','backup.exercise@iiitp.ac.in','Backup Exercise','BACKUP-EX','ECE',1,false)
      on conflict (id) do nothing;
      insert into public.member_applications(id,profile_id,state,submitted_at,reviewed_at,decided_at,decided_by,decision_reason)
      values('${exerciseApplicationId}','${exerciseProfileId}','incomplete',now()-interval '35 days',null,null,null,null)
      on conflict (profile_id) do nothing;
      insert into public.college_id_documents(id,application_id,owner_id,object_name,byte_size,width,height,checksum_sha256)
      values('${exerciseDocumentId}','${exerciseApplicationId}','${exerciseProfileId}','applications/${exerciseApplicationId}/99999999-9999-4999-8999-999999999994.webp',1000,640,400,repeat('9',64))
      on conflict (object_name) do nothing;
      update public.member_applications
      set state='rejected',reviewed_at=now()-interval '34 days',decided_at=now()-interval '34 days',decided_by='00000000-0000-0000-0000-000000000006',decision_reason='Backup exercise fixture'
      where id='${exerciseApplicationId}';
      update public.college_id_documents
      set deletion_due_at=now()-interval '4 days',deleted_at=now()-interval '3 days',deletion_claimed_at=null,updated_at=now()
      where id='${exerciseDocumentId}';
    `
  ]);
  docker([
    "exec",
    container,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--schema=auth",
    "--schema=storage",
    "--schema=private",
    "--schema=api",
    "--schema=public",
    "-f",
    dumpPath
  ]);
  docker(["exec", container, "createdb", "-U", "postgres", restoreDatabase]);
  created = true;
  docker([
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    restoreDatabase,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "drop schema public; create schema extensions; create extension pgcrypto with schema extensions; create extension pg_trgm with schema extensions; create extension btree_gist with schema extensions; create extension pgtap with schema extensions;"
  ]);
  docker([
    "exec",
    container,
    "pg_restore",
    "-U",
    "postgres",
    "-d",
    restoreDatabase,
    "--no-owner",
    "--no-acl",
    dumpPath
  ]);
  const evidence = docker([
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    restoreDatabase,
    "-At",
    "-c",
    `select json_build_object(
      'profiles',(select count(*) from public.profiles),
      'catalog_items',(select count(*) from public.catalog_items),
      'audit_events',(select count(*) from public.audit_events),
      'member_application_decisions',(select count(*) from public.member_applications where id='${exerciseApplicationId}' and state='rejected' and decision_reason='Backup exercise fixture'),
      'college_id_document_metadata',(select count(*) from public.college_id_documents where id='${exerciseDocumentId}' and deleted_at is not null and deletion_due_at is not null),
      'expired_id_object_content_expected',false,
      'rls_requests',(select relrowsecurity from pg_class where oid='public.requests'::regclass)
    );`
  ]);
  const parsed = JSON.parse(evidence) as {
    profiles: number;
    catalog_items: number;
    audit_events: number;
    member_application_decisions: number;
    college_id_document_metadata: number;
    expired_id_object_content_expected: boolean;
    rls_requests: boolean;
  };
  if (
    parsed.profiles < 1 ||
    parsed.catalog_items < 1 ||
    parsed.audit_events < 1 ||
    parsed.member_application_decisions !== 1 ||
    parsed.college_id_document_metadata !== 1 ||
    parsed.expired_id_object_content_expected ||
    !parsed.rls_requests
  ) {
    throw new Error(`Restored database failed smoke checks: ${evidence}`);
  }
  console.log(
    `Backup/restore exercise passed in isolated database ${restoreDatabase}: ${evidence}`
  );
} finally {
  docker([
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `
      delete from public.college_id_documents where id='${exerciseDocumentId}';
      delete from public.member_applications where id='${exerciseApplicationId}';
      delete from public.profiles where id='${exerciseProfileId}';
      delete from auth.users where id='${exerciseProfileId}';
    `
  ]);
  if (created)
    docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", restoreDatabase]);
  docker(["exec", container, "rm", "-f", dumpPath]);
}
