import { describe, expect, it } from "vitest";
import { constantTimeSecretEqual } from "@/lib/safety/secrets";

describe("scheduled-job secret comparison", () => {
  it("accepts only an exact non-empty secret", () => {
    expect(constantTimeSecretEqual("cron-secret-value", "cron-secret-value")).toBe(true);
    expect(constantTimeSecretEqual("cron-secret-value", "cron-secret-valuE")).toBe(false);
    expect(constantTimeSecretEqual("short", "longer")).toBe(false);
    expect(constantTimeSecretEqual("", "")).toBe(false);
  });
});
