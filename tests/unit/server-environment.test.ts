import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseServerEnvironment } from "@/lib/env/server";

const productionBase = {
  ROFIES_ENVIRONMENT: "production",
  ROFIES_DEMO_MODE: "false",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-123456",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-123456",
  CRON_SECRET: "cron-secret-123456"
} as const;

describe("server environment auth origin", () => {
  it("uses localhost only when the environment is local or test", () => {
    expect(parseServerEnvironment({ ROFIES_ENVIRONMENT: "local" }).ROFIES_APP_ORIGIN).toBe(
      "http://localhost:3000"
    );
    expect(parseServerEnvironment({ ROFIES_ENVIRONMENT: "test" }).ROFIES_APP_ORIGIN).toBe(
      "http://localhost:3000"
    );
    expect(() => parseServerEnvironment({ ROFIES_ENVIRONMENT: "preview" })).toThrow(
      /ROFIES_APP_ORIGIN/
    );
  });

  it("requires an explicit HTTPS origin in production", () => {
    expect(() => parseServerEnvironment(productionBase)).toThrow(/ROFIES_APP_ORIGIN/);
    expect(() =>
      parseServerEnvironment({
        ...productionBase,
        ROFIES_APP_ORIGIN: "http://equipment.iiitp.ac.in"
      })
    ).toThrow(/HTTPS/);
  });

  it("treats Vercel production as production even when app environment is missing", () => {
    expect(() =>
      parseServerEnvironment({
        VERCEL_ENV: "production",
        ROFIES_APP_ORIGIN: "https://equipment.iiitp.ac.in"
      })
    ).toThrow(/ROFIES_ENVIRONMENT/);
  });

  it.each([
    "https://user:secret@equipment.iiitp.ac.in",
    "https://equipment.iiitp.ac.in/auth",
    "https://equipment.iiitp.ac.in?environment=production",
    "https://equipment.iiitp.ac.in#auth",
    "ftp://equipment.iiitp.ac.in"
  ])("rejects a non-origin URL: %s", (origin) => {
    expect(() => parseServerEnvironment({ ...productionBase, ROFIES_APP_ORIGIN: origin })).toThrow(
      /ROFIES_APP_ORIGIN/
    );
  });

  it("accepts and normalizes a clean production origin", () => {
    expect(
      parseServerEnvironment({
        ...productionBase,
        ROFIES_APP_ORIGIN: "https://equipment.iiitp.ac.in/"
      }).ROFIES_APP_ORIGIN
    ).toBe("https://equipment.iiitp.ac.in");
  });
});
