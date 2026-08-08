import { describe, expect, it } from "vitest";
import { hasStaffCapability, isPublicApplicationPath } from "@/lib/auth/access";

describe("application access routing", () => {
  it("keeps only authentication, offline, and framework assets public", () => {
    expect(isPublicApplicationPath("/auth/sign-in")).toBe(true);
    expect(isPublicApplicationPath("/auth/callback")).toBe(true);
    expect(isPublicApplicationPath("/offline")).toBe(true);
    expect(isPublicApplicationPath("/manifest.webmanifest")).toBe(true);
    expect(isPublicApplicationPath("/")).toBe(false);
    expect(isPublicApplicationPath("/admin/inventory")).toBe(false);
  });

  it("does not treat member-only capabilities as staff access", () => {
    expect(hasStaffCapability([])).toBe(false);
    expect(hasStaffCapability(["member:request"])).toBe(false);
    expect(hasStaffCapability(["request:approve"])).toBe(true);
    expect(hasStaffCapability(["inventory:manage"])).toBe(true);
  });
});
