import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asActor, queryDatabase } from "../helpers/database";

const requestIds = [randomUUID(), randomUUID()];
const lineIds = [randomUUID(), randomUUID()];
const idempotencyKeys = [`race-${randomUUID()}`, `race-${randomUUID()}`];
const approverId = "00000000-0000-0000-0000-000000000004";

beforeAll(async () => {
  for (let index = 0; index < 2; index += 1) {
    await queryDatabase(
      `with inserted_request as (
         insert into public.requests(id,borrower_id,status,purpose,requested_start,requested_end,submitted_at)
         values($1,$2,'submitted',$3,'2026-11-10T10:00:00Z','2026-11-12T10:00:00Z',now()) returning id
       )
       insert into public.request_lines(id,request_id,catalog_item_id,requested_quantity)
       select $4,id,'00000000-0000-0000-0000-000000000108',2 from inserted_request`,
      [
        requestIds[index],
        index === 0
          ? "00000000-0000-0000-0000-000000000001"
          : "00000000-0000-0000-0000-000000000002",
        `Concurrent request ${index}`,
        lineIds[index]
      ]
    );
  }
});

describe("approval concurrency", () => {
  it("serializes overlapping approvals and never overbooks usable stock", async () => {
    const attempts = requestIds.map((requestId, index) =>
      asActor(approverId, "select api.decide_request($1,$2::jsonb,'Concurrent capacity test',$3)", [
        requestId,
        JSON.stringify([{ line_id: lineIds[index], decision: "approved", approved_quantity: 2 }]),
        idempotencyKeys[index]
      ])
    );
    const outcomes = await Promise.allSettled(attempts);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "40001" } });

    const allocation = await queryDatabase<{ allocated: string; usable: string }>(
      `select
        coalesce((select sum(rl.approved_quantity) from public.reservation_lines rl join public.reservations r on r.id=rl.reservation_id
          where rl.catalog_item_id='00000000-0000-0000-0000-000000000108' and r.status in ('reserved','ready_for_pickup')),0)::text as allocated,
        (select sum(quantity_on_hand) from public.pool_balances where catalog_item_id='00000000-0000-0000-0000-000000000108' and condition in ('perfect','minor_damage'))::text as usable`
    );
    expect(Number(allocation.rows[0]!.allocated)).toBeLessThanOrEqual(
      Number(allocation.rows[0]!.usable)
    );
    expect(allocation.rows[0]!.allocated).toBe("2");
  });
});
