import sharp from "sharp";
import { test, expect } from "./fixtures";

const id = "00000000-0000-0000-0000-000000000101";
const relatedId = "00000000-0000-0000-0000-000000000501";
const start = "2026-09-10T10:00:00.000Z";
const end = "2026-09-12T18:00:00.000Z";

async function pngFixture() {
  return sharp({
    create: { width: 640, height: 400, channels: 3, background: "#d9f2f5" }
  })
    .png()
    .toBuffer();
}

test("all command API variants accept valid demo payloads without server errors", async ({
  request
}) => {
  const payloads: Record<string, unknown> = {
    request: {
      purpose: "Smoke-test reservation request",
      projectName: "Release smoke",
      requestedStart: start,
      requestedEnd: end,
      teamMembers: [],
      lines: [{ catalogItemId: id, quantity: 1, remarks: "Bench validation" }]
    },
    decision: {
      requestId: id,
      reason: "Release smoke decision",
      idempotencyKey: "smoke-decision-0001",
      decisions: [
        { line_id: relatedId, decision: "approved", approved_quantity: 1, reason: "Available" }
      ]
    },
    handover: {
      reservationId: relatedId,
      dueAt: end,
      remarks: "Identity checked in person",
      idempotencyKey: "smoke-handover-0001"
    },
    return: {
      loanId: relatedId,
      remarks: "Returned at desk",
      idempotencyKey: "smoke-return-0001",
      lines: [{ loan_line_id: relatedId, quantity: 1, condition: "perfect" }]
    },
    cancel: {
      requestId: relatedId,
      reason: "Release smoke cancellation",
      idempotencyKey: "smoke-cancel-0001"
    },
    waitlist: {
      catalogItemId: id,
      quantity: 1,
      desiredStart: start,
      desiredEnd: end,
      idempotencyKey: "smoke-waitlist-0001"
    },
    extension: {
      loanLineId: relatedId,
      proposedDueAt: end,
      reason: "Need one more day for smoke validation",
      idempotencyKey: "smoke-extension-0001"
    },
    extensionDecision: {
      extensionRequestId: relatedId,
      decision: "approved",
      reason: "Release smoke approval",
      idempotencyKey: "smoke-extension-decision-0001"
    },
    counterIssue: {
      memberId: id,
      catalogItemId: id,
      quantity: 1,
      remarks: "Counter issue smoke test",
      idempotencyKey: "smoke-counter-0001"
    },
    loss: {
      loanLineId: relatedId,
      quantity: 1,
      resolution: "written_off",
      reason: "Release smoke loss resolution",
      idempotencyKey: "smoke-loss-0001"
    },
    memberDecision: {
      applicationId: id,
      decision: "changes_requested",
      reason: "Release smoke review",
      idempotencyKey: "smoke-member-decision-0001"
    }
  };

  for (const [command, data] of Object.entries(payloads)) {
    const response = await request.post(`/api/commands/${command}`, {
      headers: { Origin: "http://127.0.0.1:3000" },
      data
    });
    expect(response.status(), command).toBe(200);
    await expect(response, command).toBeOK();
    await expect(response.json(), command).resolves.toMatchObject({
      status: "committed",
      demo: true
    });
  }
});

test("API route handlers fail closed or return expected demo data", async ({ request }) => {
  await test.step("inventory export returns a downloadable CSV", async () => {
    const response = await request.get("/api/exports/inventory");
    await expect(response).toBeOK();
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(await response.text()).toContain("Arduino Mega 2560");
  });

  await test.step("college ID delivery is private and no-store in demo", async () => {
    const response = await request.get(`/api/member-application/id-document?applicationId=${id}`);
    await expect(response).toBeOK();
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  await test.step("protected/invalid API paths do not crash", async () => {
    expect((await request.get(`/api/photos/${id}`)).status()).toBeLessThan(500);
    expect((await request.get("/api/photos/not-a-uuid")).status()).toBe(404);
    expect((await request.post("/api/jobs/retention")).status()).toBe(404);
    expect(
      (
        await request.post("/api/commands/notACommand", {
          headers: { Origin: "http://127.0.0.1:3000" },
          data: {}
        })
      ).status()
    ).toBe(404);
    expect(
      (
        await request.post("/api/commands/request", {
          headers: { Origin: "http://127.0.0.1:3000" },
          data: { purpose: "" }
        })
      ).status()
    ).toBe(422);
  });
});

test("member application upload API accepts a valid bounded demo submission", async ({
  request
}) => {
  const response = await request.post("/api/member-application", {
    headers: { Origin: "http://127.0.0.1:3000" },
    multipart: {
      fullName: "Release Smoke",
      studentIdentifier: "FIC-9001",
      department: "Electronics and Communication Engineering",
      studyYear: "2",
      phone: "+91 98765 43210",
      collegeId: {
        name: "college-id.png",
        mimeType: "image/png",
        buffer: await pngFixture()
      }
    }
  });
  expect(response.status()).toBe(201);
  await expect(response.json()).resolves.toMatchObject({ status: "pending_review" });
});

test("equipment photo upload API accepts a valid bounded demo image", async ({ request }) => {
  const response = await request.post("/api/uploads/equipment-photo", {
    headers: { Origin: "http://127.0.0.1:3000" },
    multipart: {
      catalogId: id,
      caption: "Release smoke equipment photo",
      photo: {
        name: "equipment.png",
        mimeType: "image/png",
        buffer: await pngFixture()
      }
    }
  });
  expect(response.status()).toBe(201);
  await expect(response.json()).resolves.toMatchObject({ status: "committed", demo: true });
});
