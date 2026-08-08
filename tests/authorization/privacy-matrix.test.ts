import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asActor, queryDatabase } from "../helpers/database";

const selfApprovalRequestId = randomUUID();
const selfApprovalLineId = randomUUID();
const inactiveApplicantId = "00000000-0000-0000-0000-000000000003";
const reviewApplicantId = "00000000-0000-0000-0000-000000000007";
const reviewApplicationId = randomUUID();
const reviewDocumentId = randomUUID();

afterAll(async () => {
  await queryDatabase(
    `with deleted_lines as (delete from public.request_lines where request_id=$1 returning request_id)
     delete from public.requests where id=$1`,
    [selfApprovalRequestId]
  );
  await queryDatabase("delete from public.notifications where related_entity_id=$1", [
    reviewApplicationId
  ]);
  await queryDatabase("delete from public.college_id_documents where application_id=$1", [
    reviewApplicationId
  ]);
  await queryDatabase("delete from public.member_applications where id=$1", [reviewApplicationId]);
  await queryDatabase(
    "update public.memberships set status='inactive', approved_by=null, approved_at=null, reason='Awaiting orientation' where profile_id=$1",
    [inactiveApplicantId]
  );
  await queryDatabase(
    "update public.memberships set status='suspended', approved_by='00000000-0000-0000-0000-000000000006', approved_at=now()-interval '1 year', reason='Orientation renewal required' where profile_id=$1",
    [reviewApplicantId]
  );
});

describe("server/database authorization and privacy matrix", () => {
  it("limits an approved member to their own borrower records", async () => {
    const result = await asActor<{ borrower_id: string }>(
      "00000000-0000-0000-0000-000000000002",
      "select borrower_id from public.requests order by borrower_id"
    );
    expect(new Set(result.rows.map((row) => row.borrower_id))).toEqual(
      new Set(["00000000-0000-0000-0000-000000000002"])
    );
  });

  it("denies request creation for an authenticated non-member", async () => {
    await queryDatabase(
      "update public.memberships set status='inactive', approved_by=null, approved_at=null, reason='Awaiting orientation' where profile_id=$1",
      [inactiveApplicantId]
    );
    await expect(
      asActor(
        inactiveApplicantId,
        `select api.create_request('Unauthorized fixture','',now()+interval '2 days',now()+interval '3 days',
          '[{"catalog_item_id":"00000000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,$1)`,
        [`inactive-${randomUUID()}`]
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("denies self-approval even when the borrower has approval capability", async () => {
    await queryDatabase(
      `with inserted_request as (
         insert into public.requests(id,borrower_id,status,purpose,requested_start,requested_end,submitted_at)
         values($1,'00000000-0000-0000-0000-000000000004','submitted','Self approval regression',now()+interval '2 days',now()+interval '3 days',now()) returning id
       )
       insert into public.request_lines(id,request_id,catalog_item_id,requested_quantity)
       select $2,id,'00000000-0000-0000-0000-000000000101',1 from inserted_request`,
      [selfApprovalRequestId, selfApprovalLineId]
    );
    await expect(
      asActor(
        "00000000-0000-0000-0000-000000000004",
        "select api.decide_request($1,$2::jsonb,'Self approval must fail',$3)",
        [
          selfApprovalRequestId,
          JSON.stringify([
            { line_id: selfApprovalLineId, decision: "approved", approved_quantity: 1 }
          ]),
          `self-${randomUUID()}`
        ]
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("does not expose internal inventory remarks to ordinary members", async () => {
    const result = await asActor(
      "00000000-0000-0000-0000-000000000001",
      "select internal_remarks from public.catalog_items"
    );
    expect(result.rowCount).toBe(0);
  });

  it("allows only membership administrators to review pending applications atomically", async () => {
    await queryDatabase(
      "update public.memberships set status='suspended', approved_by='00000000-0000-0000-0000-000000000006', approved_at=now()-interval '1 year', reason='Orientation renewal required' where profile_id=$1",
      [reviewApplicantId]
    );
    await queryDatabase(
      `insert into public.member_applications(id,profile_id,state,submitted_at)
       values($1,$2,'incomplete',null)
       on conflict (profile_id) do update
       set id=excluded.id,state='incomplete',submitted_at=null,reviewed_at=null,decided_at=null,decided_by=null,decision_reason=null`,
      [reviewApplicationId, reviewApplicantId]
    );
    await queryDatabase(
      `insert into public.college_id_documents(id,application_id,owner_id,object_name,byte_size,width,height,checksum_sha256)
       values($1,$2,$3,$4,1000,900,600,$5)
       on conflict (object_name) do nothing`,
      [
        reviewDocumentId,
        reviewApplicationId,
        reviewApplicantId,
        `applications/${reviewApplicationId}/11111111-1111-4111-8111-111111111144.webp`,
        "a".repeat(64)
      ]
    );
    await queryDatabase(
      "update public.member_applications set state='pending_review',submitted_at=now() where id=$1",
      [reviewApplicationId]
    );

    await expect(
      asActor(
        "00000000-0000-0000-0000-000000000005",
        "select api.review_member_application($1,'approved','Identity verified at desk',$2)",
        [reviewApplicationId, `review-denied-${randomUUID()}`]
      )
    ).rejects.toMatchObject({ code: "42501" });

    const decision = await asActor<{ result: { state: string; membership_status: string } }>(
      "00000000-0000-0000-0000-000000000006",
      "select api.review_member_application($1,'approved','Identity verified at desk',$2) as result",
      [reviewApplicationId, `review-ok-${randomUUID()}`]
    );
    expect(decision.rows[0]?.result).toMatchObject({
      state: "approved",
      membership_status: "active"
    });

    const row = await queryDatabase<{ state: string; status: string; active: boolean }>(
      `select a.state,m.status,p.active
       from public.member_applications a
       join public.memberships m on m.profile_id=a.profile_id
       join public.profiles p on p.id=a.profile_id
       where a.id=$1`,
      [reviewApplicationId]
    );
    expect(row.rows[0]).toEqual({ state: "approved", status: "active", active: true });
  });
});
