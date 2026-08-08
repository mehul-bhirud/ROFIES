import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asActor, queryDatabase } from "../helpers/database";

const memberId = "00000000-0000-0000-0000-000000000002";
const idempotencyKey = `integration-request-${randomUUID()}`;

describe("atomic request command", () => {
  it("commits request, lines, audit, and retry response exactly once", async () => {
    const command = `select api.create_request(
      $1,$2,$3::timestamptz,$4::timestamptz,$5::jsonb,$6
    ) as result`;
    const values = [
      "Calibrate the manipulator test fixture",
      "Fixture Sprint",
      "2026-10-10T10:00:00Z",
      "2026-10-12T10:00:00Z",
      JSON.stringify([
        {
          catalog_item_id: "00000000-0000-0000-0000-000000000101",
          quantity: 1,
          remarks: "One control board"
        }
      ]),
      idempotencyKey
    ];

    const first = await asActor<{ result: { request_id: string; status: string } }>(
      memberId,
      command,
      values
    );
    const second = await asActor<{ result: { request_id: string; status: string } }>(
      memberId,
      command,
      values
    );
    const requestId = first.rows[0]!.result.request_id;
    expect(second.rows[0]!.result).toEqual(first.rows[0]!.result);
    const evidence = await queryDatabase<{ requests: string; lines: string; audits: string }>(
      `select
        (select count(*) from public.requests where id=$1)::text as requests,
        (select count(*) from public.request_lines where request_id=$1)::text as lines,
        (select count(*) from public.audit_events where target_id=$1 and action='request.submitted')::text as audits`,
      [requestId]
    );
    expect(evidence.rows[0]).toEqual({ requests: "1", lines: "1", audits: "1" });
  });
});
