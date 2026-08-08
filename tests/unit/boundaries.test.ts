import { describe, expect, it } from "vitest";
import { isAllowedInstitutionalIdentity } from "@/lib/auth/identity";
import { isTrustedMutationOrigin } from "@/lib/safety/origin";
import { handoverCommandSchema, requestCommandSchema } from "@/lib/validation/commands";

describe("server boundaries", () => {
  it("accepts only verified identities from an exact allowed domain", () => {
    expect(
      isAllowedInstitutionalIdentity({ email: "anaya@iiitp.ac.in", emailVerified: true }, [
        "iiitp.ac.in"
      ])
    ).toBe(true);
    expect(
      isAllowedInstitutionalIdentity({ email: "anaya@evil-iiitp.ac.in", emailVerified: true }, [
        "iiitp.ac.in"
      ])
    ).toBe(false);
    expect(
      isAllowedInstitutionalIdentity({ email: "anaya@iiitp.ac.in", emailVerified: false }, [
        "iiitp.ac.in"
      ])
    ).toBe(false);
  });

  it("requires an exact configured origin for cookie-authenticated mutations", () => {
    expect(
      isTrustedMutationOrigin("https://equipment.iiitp.ac.in", "https://equipment.iiitp.ac.in")
    ).toBe(true);
    expect(
      isTrustedMutationOrigin(
        "https://equipment.iiitp.ac.in.evil.test",
        "https://equipment.iiitp.ac.in"
      )
    ).toBe(false);
    expect(isTrustedMutationOrigin(null, "https://equipment.iiitp.ac.in")).toBe(false);
  });

  it("bounds request quantities, purpose, and date ranges", () => {
    expect(
      requestCommandSchema.safeParse({
        purpose: "Robotic arm control test",
        requestedStart: "2026-08-10T00:00:00.000Z",
        requestedEnd: "2026-08-12T00:00:00.000Z",
        lines: [{ catalogItemId: "00000000-0000-0000-0000-000000000101", quantity: 2 }]
      }).success
    ).toBe(true);
    expect(
      requestCommandSchema.safeParse({
        purpose: "x",
        requestedStart: "2026-08-12T00:00:00.000Z",
        requestedEnd: "2026-08-10T00:00:00.000Z",
        lines: [{ catalogItemId: "bad", quantity: 0 }]
      }).success
    ).toBe(false);
  });

  it("requires a due date and idempotency key for handover", () => {
    expect(
      handoverCommandSchema.safeParse({
        reservationId: "00000000-0000-0000-0000-000000000501",
        dueAt: "2026-08-20T00:00:00.000Z",
        remarks: "Identity checked in person",
        idempotencyKey: "handover-20260808-0001"
      }).success
    ).toBe(true);
    expect(handoverCommandSchema.safeParse({ reservationId: "bad" }).success).toBe(false);
  });
});
