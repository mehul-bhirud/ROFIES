import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  provisionConfirmedApplicant: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({
    ROFIES_APP_ORIGIN: "https://equipment.iiitp.ac.in",
    allowedEmailDomains: ["iiitp.ac.in"]
  })
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseServiceClient: mocks.createSupabaseServiceClient
}));
vi.mock("@/lib/auth/profile-provisioning", () => ({
  provisionConfirmedApplicant: mocks.provisionConfirmedApplicant
}));

import { GET } from "@/app/auth/confirm/route";

describe("email token confirmation route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { verifyOtp: mocks.verifyOtp, signOut: mocks.signOut }
    });
    mocks.createSupabaseServiceClient.mockReturnValue({ from: vi.fn() });
    mocks.verifyOtp.mockResolvedValue({
      data: {
        user: {
          id: "5a6a36f7-5927-4fa4-a9bd-0a6d9a8022ab",
          email: "student@iiitp.ac.in",
          email_confirmed_at: "2026-08-08T10:00:00.000Z"
        }
      },
      error: null
    });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.provisionConfirmedApplicant.mockResolvedValue(true);
  });

  it("verifies a supported confirmation token and uses the fixed onboarding destination", async () => {
    const request = new NextRequest(
      "https://equipment.iiitp.ac.in/auth/confirm?token_hash=safe-token&type=email&next=https://attacker.test"
    );

    const response = await GET(request);

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "safe-token", type: "email" });
    expect(response.headers.get("location")).toBe("https://equipment.iiitp.ac.in/onboarding");
  });

  it("routes a valid recovery token to the fixed password update page", async () => {
    const response = await GET(
      new NextRequest(
        "https://equipment.iiitp.ac.in/auth/confirm?token_hash=safe-token&type=recovery"
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://equipment.iiitp.ac.in/auth/update-password"
    );
    expect(mocks.provisionConfirmedApplicant).not.toHaveBeenCalled();
  });

  it.each(["invite", "magiclink", "email_change", "signup", "access_token"])(
    "rejects the unsupported %s token purpose",
    async (type) => {
      const response = await GET(
        new NextRequest(
          `https://equipment.iiitp.ac.in/auth/confirm?token_hash=safe-token&type=${type}`
        )
      );

      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(response.headers.get("location")).toBe(
        "https://equipment.iiitp.ac.in/auth/error?code=confirmation_failed"
      );
    }
  );

  it("clears only the local session when token verification fails", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ data: { user: null }, error: new Error("expired") });

    const response = await GET(
      new NextRequest("https://equipment.iiitp.ac.in/auth/confirm?token_hash=expired&type=email")
    );

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("location")).toBe(
      "https://equipment.iiitp.ac.in/auth/error?code=confirmation_failed"
    );
  });

  it("contains a rejected token exchange and best-effort cleanup failure", async () => {
    mocks.verifyOtp.mockRejectedValueOnce(new Error("raw provider failure"));
    mocks.signOut.mockRejectedValueOnce(new Error("cleanup failure"));

    const response = await GET(
      new NextRequest("https://equipment.iiitp.ac.in/auth/confirm?token_hash=safe-token&type=email")
    );

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("location")).toBe(
      "https://equipment.iiitp.ac.in/auth/error?code=confirmation_failed"
    );
  });

  it("contains a rejected provisioning attempt and clears only the local session", async () => {
    mocks.provisionConfirmedApplicant.mockRejectedValueOnce(new Error("raw database failure"));

    const response = await GET(
      new NextRequest("https://equipment.iiitp.ac.in/auth/confirm?token_hash=safe-token&type=email")
    );

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("location")).toBe(
      "https://equipment.iiitp.ac.in/auth/error?code=profile_unavailable"
    );
  });

  it("contains local cleanup rejection after a resolved provisioning failure", async () => {
    mocks.provisionConfirmedApplicant.mockResolvedValueOnce(false);
    mocks.signOut.mockRejectedValueOnce(new Error("cleanup failure"));

    const response = await GET(
      new NextRequest("https://equipment.iiitp.ac.in/auth/confirm?token_hash=safe-token&type=email")
    );

    expect(response.headers.get("location")).toBe(
      "https://equipment.iiitp.ac.in/auth/error?code=profile_unavailable"
    );
  });
});
