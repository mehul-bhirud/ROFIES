import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: "pending_review" as
    "incomplete" | "pending_review" | "changes_requested" | "approved" | "rejected",
  membershipStatus: "inactive",
  email: "student@iiitp.ac.in",
  emailConfirmedAt: "2026-08-08T10:00:00.000Z" as string | null,
  rpc: vi.fn()
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "33333333-3333-4333-8333-333333333333",
            email: mocks.email,
            email_confirmed_at: mocks.emailConfirmedAt
          }
        }
      })
    },
    schema: () => ({ rpc: mocks.rpc })
  })
}));

import { proxy } from "@/proxy";

describe("proxy applicant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key-123456";
    process.env.ROFIES_DEMO_MODE = "false";
    delete process.env.ROFIES_ENVIRONMENT;
    delete process.env.VERCEL_ENV;
    mocks.state = "pending_review";
    mocks.membershipStatus = "inactive";
    mocks.email = "student@iiitp.ac.in";
    mocks.emailConfirmedAt = "2026-08-08T10:00:00.000Z";
    mocks.rpc.mockImplementation(async () => ({
      data: {
        application_id: "11111111-1111-4111-8111-111111111111",
        state: mocks.state,
        membership_status: mocks.membershipStatus,
        decision_reason: null
      },
      error: null
    }));
  });

  it.each([
    ["incomplete", "/onboarding"],
    ["changes_requested", "/onboarding"],
    ["pending_review", "/pending"],
    ["rejected", "/pending"]
  ] as const)("redirects an inactive %s applicant away from the catalog", async (state, path) => {
    mocks.state = state;
    const response = await proxy(new NextRequest("http://localhost:3000/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost:3000${path}`);
    expect(mocks.rpc).toHaveBeenCalledWith("member_application_status");
  });

  it("does not silently enter demo mode when the demo flag is missing", async () => {
    delete process.env.ROFIES_DEMO_MODE;
    const response = await proxy(new NextRequest("http://localhost:3000/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/pending");
    expect(mocks.rpc).toHaveBeenCalledWith("member_application_status");
  });

  it("fails closed when Vercel production is not marked as app production", async () => {
    process.env.VERCEL_ENV = "production";
    const response = await proxy(new NextRequest("https://equipment.iiitp.ac.in/"));

    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("allows the applicant only on the page matching their current state", async () => {
    const pending = await proxy(new NextRequest("http://localhost:3000/pending"));
    const catalog = await proxy(new NextRequest("http://localhost:3000/contacts"));

    expect(pending.status).toBe(200);
    expect(pending.headers.get("location")).toBeNull();
    expect(catalog.headers.get("location")).toBe("http://localhost:3000/pending");
  });

  it("fails closed when confirmation, application, and membership state disagree", async () => {
    mocks.state = "approved";
    mocks.membershipStatus = "inactive";
    const response = await proxy(new NextRequest("http://localhost:3000/"));

    expect(response.headers.get("location")).toContain("/auth/error");
  });

  it("allows only an approved active member through to protected pages", async () => {
    mocks.state = "approved";
    mocks.membershipStatus = "active";
    const response = await proxy(new NextRequest("http://localhost:3000/requests"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows the exact developer email exception through the protected route gate", async () => {
    mocks.email = "mehul.c.bhirud@gmail.com";
    mocks.state = "approved";
    mocks.membershipStatus = "active";
    const response = await proxy(new NextRequest("http://localhost:3000/admin"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
