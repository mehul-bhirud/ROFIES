import { Client } from "pg";
import { performance } from "node:perf_hooks";
import { localDatabaseUrl } from "../tests/helpers/database";

type Plan = { "Execution Time": number; "Planning Time": number; Plan: { "Node Type": string } };

const client = new Client({ connectionString: localDatabaseUrl });
await client.connect();
const results: Array<{ name: string; executionMs: number; planningMs: number; rootNode: string }> =
  [];
const started = performance.now();

async function explain(name: string, sql: string, values: readonly unknown[] = []) {
  const response = await client.query<{ "QUERY PLAN": Plan[] }>(
    `explain (analyze, buffers, format json) ${sql}`,
    [...values]
  );
  const plan = response.rows[0]!["QUERY PLAN"][0]!;
  results.push({
    name,
    executionMs: plan["Execution Time"],
    planningMs: plan["Planning Time"],
    rootNode: plan.Plan["Node Type"]
  });
}

try {
  await client.query("begin");
  await client.query("set local synchronous_commit=off");
  await client.query(`
    insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    select '00000000-0000-0000-0000-000000000000', md5('perf-user-'||g)::uuid, 'authenticated', 'authenticated',
      'student-'||g||'@iiitp.ac.in', '{"provider":"google"}'::jsonb, '{}'::jsonb, now(), now()
    from generate_series(1,1993) g;
    insert into public.profiles(id,institutional_email,display_name,active)
    select md5('perf-user-'||g)::uuid, 'student-'||g||'@iiitp.ac.in', 'Performance Student '||g, true
    from generate_series(1,1993) g;
    insert into public.memberships(profile_id,status,approved_by,approved_at,reason)
    select md5('perf-user-'||g)::uuid, 'active', '00000000-0000-0000-0000-000000000006', now(), 'Performance fixture'
    from generate_series(1,293) g;
    insert into public.catalog_items(id,category_id,name,description,tracking_mode,return_required,default_loan_days,maximum_loan_days,member_quantity_limit,created_by)
    select md5('perf-item-'||g)::uuid, '00000000-0000-0000-0000-000000000201',
      'Performance controller '||g, 'Synthetic production-scale search fixture '||g, 'pooled_reusable', true, 7, 21, 4,
      '00000000-0000-0000-0000-000000000005'
    from generate_series(1,250) g;
    insert into public.pool_balances(catalog_item_id,condition,quantity_on_hand)
    select md5('perf-item-'||g)::uuid, 'perfect', 8 from generate_series(1,250) g;
    insert into public.requests(id,borrower_id,status,purpose,requested_start,requested_end,submitted_at)
    select md5('perf-request-'||g)::uuid, md5('perf-user-'||((g-1)%293+1))::uuid,
      case when g%3=0 then 'submitted'::public.request_state else 'approved'::public.request_state end,
      'Performance request '||g, now()+interval '2 days', now()+interval '5 days', now()-((g%72)||' hours')::interval
    from generate_series(1,2000) g;
    insert into public.audit_events(actor_id,action,target_type,target_id,reason)
    select '00000000-0000-0000-0000-000000000006','performance.fixture','request',md5('perf-request-'||g)::uuid,'Production-scale fixture'
    from generate_series(1,5000) g;
    analyze public.profiles; analyze public.catalog_items; analyze public.pool_balances; analyze public.requests; analyze public.audit_events;
  `);

  await explain(
    "catalog search",
    `select id,name from public.catalog_items
    where archived_at is null and search_document @@ websearch_to_tsquery('english',$1) order by name limit 40`,
    ["performance controller"]
  );
  await explain(
    "date availability",
    `select i.id,
      coalesce(sum(b.quantity_on_hand) filter(where b.condition in ('perfect','minor_damage')),0)
      - coalesce((select sum(rl.approved_quantity) from public.reservation_lines rl join public.reservations r on r.id=rl.reservation_id
        where rl.catalog_item_id=i.id and r.status in ('reserved','ready_for_pickup')
        and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange($1::timestamptz,$2::timestamptz,'[)')),0) as available
    from public.catalog_items i left join public.pool_balances b on b.catalog_item_id=i.id
    where i.archived_at is null group by i.id order by i.name limit 40`,
    ["2026-11-10T10:00:00Z", "2026-11-12T10:00:00Z"]
  );
  await explain(
    "admin dashboard",
    `select
      count(*) filter(where status in ('submitted','under_review')) pending,
      count(*) filter(where status in ('approved','partially_approved')) approved
    from public.requests`
  );
  await explain(
    "pending approvals",
    `select id,submitted_at from public.requests where status in ('submitted','under_review') order by submitted_at limit 50`
  );
  await explain(
    "borrower history",
    `select id,status,created_at from public.requests where borrower_id=$1 order by created_at desc limit 50`,
    ["00000000-0000-0000-0000-000000000001"]
  );
  await explain(
    "overdue loans",
    `select id,loan_id,due_at from public.loan_lines where unresolved_quantity>0 and due_at<now() order by due_at limit 50`
  );

  const slow = results.filter((result) => result.executionMs > 250);
  if (slow.length > 0)
    throw new Error(
      `Local query budget exceeded: ${slow.map((item) => `${item.name}=${item.executionMs}ms`).join(", ")}`
    );
  console.log(
    JSON.stringify(
      {
        fixture: {
          users: 2000,
          activeMembers: 300,
          inventoryUnits: 2000,
          requests: 2000,
          auditEvents: 5000
        },
        setupAndPlansMs: Math.round(performance.now() - started),
        queries: results
      },
      null,
      2
    )
  );
} finally {
  await client.query("rollback");
  await client.end();
}
