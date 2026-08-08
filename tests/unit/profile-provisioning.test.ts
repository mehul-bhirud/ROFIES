import { describe, expect, it } from "vitest";
import { buildSafeProfileUpdate } from "@/lib/auth/profile-provisioning";

describe("profile authentication timestamps", () => {
  it("never lets a login overwrite account activation state", () => {
    const update = buildSafeProfileUpdate("Member Name", "2026-08-08T10:00:00.000Z");

    expect(update).toEqual({
      display_name: "Member Name",
      last_authenticated_at: "2026-08-08T10:00:00.000Z",
      updated_at: "2026-08-08T10:00:00.000Z"
    });
    expect(update).not.toHaveProperty("active");
    expect(update).not.toHaveProperty("institutional_email");
  });
});
