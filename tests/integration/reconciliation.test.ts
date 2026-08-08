import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { queryDatabase } from "../helpers/database";

const reconciliationId = randomUUID();
const manualReference = `MANUAL-${randomUUID()}`;

afterAll(async () => {
  await queryDatabase("delete from public.outage_reconciliations where id=$1", [reconciliationId]);
});

describe("outage reconciliation record", () => {
  it("preserves actual event time separately from append time and requires review", async () => {
    const result = await queryDatabase<{
      actual_event_at: Date;
      entered_at: Date;
      review_state: string;
    }>(
      `insert into public.outage_reconciliations(id,manual_log_reference,actual_event_at,entered_by,reason)
       values($1,$2,now()-interval '2 hours','00000000-0000-0000-0000-000000000005','Isolated restore drill entry')
       returning actual_event_at,entered_at,review_state`,
      [reconciliationId, manualReference]
    );
    expect(result.rows[0]!.entered_at.getTime()).toBeGreaterThan(
      result.rows[0]!.actual_event_at.getTime()
    );
    expect(result.rows[0]!.review_state).toBe("pending");
  });
});
