import { describe, expect, it } from "vitest";
import { authorize, can } from "@/lib/domain/authorization";

const member = {
  userId: "member-1",
  active: true,
  membership: "active" as const,
  capabilities: []
};

describe("authorization", () => {
  it("allows an active member to create their own request", () => {
    expect(can(member, "request:create", { ownerId: "member-1" })).toBe(true);
  });

  it("denies a student and suspended member from borrowing", () => {
    expect(can({ ...member, membership: "inactive" }, "request:create")).toBe(false);
    expect(can({ ...member, membership: "suspended" }, "request:create")).toBe(false);
  });

  it("prevents an approver from approving their own request", () => {
    const approver = { ...member, capabilities: ["request:approve" as const] };
    expect(can(approver, "request:approve", { ownerId: "member-1" })).toBe(false);
    expect(can(approver, "request:approve", { ownerId: "member-2" })).toBe(true);
  });

  it("fails closed for inactive accounts and returns a non-disclosing error", () => {
    expect(() => authorize({ ...member, active: false }, "inventory:manage")).toThrow(
      "Resource unavailable"
    );
  });
});
