import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  serviceRpc: vi.fn(),
  serviceSchema: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  provisionConfirmedApplicant: vi.fn(),
  environment: {
    ROFIES_APP_ORIGIN: "https://equipment.iiitp.ac.in",
    allowedEmailDomains: ["iiitp.ac.in"],
    demoMode: false
  }
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => mocks.environment
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseServiceClient: mocks.createSupabaseServiceClient
}));
vi.mock("@/lib/auth/profile-provisioning", () => ({
  provisionConfirmedApplicant: mocks.provisionConfirmedApplicant
}));

import {
  requestPasswordResetAction,
  signInAction,
  signOutAction,
  signUpAction,
  updatePasswordAction
} from "@/lib/auth/actions";

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("password authentication server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.environment.demoMode = false;
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        signUp: mocks.signUp,
        signInWithPassword: mocks.signInWithPassword,
        resetPasswordForEmail: mocks.resetPasswordForEmail,
        updateUser: mocks.updateUser,
        signOut: mocks.signOut
      }
    });
    mocks.createSupabaseServiceClient.mockReturnValue({ from: vi.fn() });
    mocks.provisionConfirmedApplicant.mockResolvedValue(true);
    mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "student@iiitp.ac.in",
          email_confirmed_at: "2026-08-08T10:00:00.000Z"
        }
      },
      error: null
    });
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mocks.updateUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.serviceRpc.mockResolvedValue({ data: { id: "reset-1" }, error: null });
    mocks.serviceSchema.mockReturnValue({ rpc: mocks.serviceRpc });
  });

  it("normalizes signup input and constructs confirmation redirects from the configured origin", async () => {
    const result = await signUpAction(
      formData({ email: " STUDENT@IIITP.AC.IN ", password: "Correct-Horse-42" })
    );

    expect(result.ok).toBe(true);
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "student@iiitp.ac.in",
      password: "Correct-Horse-42",
      options: { emailRedirectTo: "https://equipment.iiitp.ac.in/auth/confirm" }
    });
  });

  it("returns the same signup acknowledgement when the provider rejects an existing account", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new Error("exists")
    });

    const existing = await signUpAction(
      formData({ email: "student@iiitp.ac.in", password: "Correct-Horse-42" })
    );
    mocks.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: null });
    const newAccount = await signUpAction(
      formData({ email: "student@iiitp.ac.in", password: "Correct-Horse-42" })
    );

    expect(existing).toEqual(newAccount);
  });

  it("returns field errors without calling Supabase for external signup addresses", async () => {
    const result = await signUpAction(
      formData({ email: "student@gmail.com", password: "Correct-Horse-42" })
    );

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.email).toBeDefined();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("uses a non-disclosing sign-in failure", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new Error("User not found")
    });

    const result = await signInAction(
      formData({ email: "student@iiitp.ac.in", password: "Correct-Horse-42" })
    );

    expect(result).toEqual({ ok: false, message: "Email or password is incorrect." });
    expect(mocks.provisionConfirmedApplicant).not.toHaveBeenCalled();
  });

  it("repairs confirmed applicant provisioning after password sign-in", async () => {
    const result = await signInAction(
      formData({ email: "student@iiitp.ac.in", password: "Correct-Horse-42" })
    );

    expect(result.ok).toBe(true);
    expect(mocks.provisionConfirmedApplicant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "user-1", email: "student@iiitp.ac.in" })
    );
  });

  it("permits the configured developer email exception during sign-in", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: {
        user: {
          id: "developer-1",
          email: "mehul.c.bhirud@gmail.com",
          email_confirmed_at: "2026-08-08T10:00:00.000Z"
        }
      },
      error: null
    });

    const result = await signInAction(
      formData({ email: "mehul.c.bhirud@gmail.com", password: "Correct-Horse-42" })
    );

    expect(result.ok).toBe(true);
    expect(mocks.provisionConfirmedApplicant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "developer-1", email: "mehul.c.bhirud@gmail.com" })
    );
  });

  it("keeps demo sign-in deterministic even when Supabase credentials are configured", async () => {
    mocks.environment.demoMode = true;

    const result = await signInAction(
      formData({ email: "student@iiitp.ac.in", password: "Correct-Horse-42" })
    );

    expect(result).toEqual({ ok: true, message: "Signed in. Redirecting to your account…" });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("fails closed locally and repairs a partial applicant on the next sign-in", async () => {
    mocks.provisionConfirmedApplicant.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const first = await signInAction(
      formData({ email: "student@iiitp.ac.in", password: "Correct-Horse-42" })
    );
    const retry = await signInAction(
      formData({ email: "student@iiitp.ac.in", password: "Correct-Horse-42" })
    );

    expect(first).toEqual({
      ok: false,
      message: "Account setup could not finish. Sign in again to retry."
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(retry.ok).toBe(true);
    expect(mocks.provisionConfirmedApplicant).toHaveBeenCalledTimes(2);
  });

  it("continues to fail closed when a later repair retry also fails", async () => {
    mocks.provisionConfirmedApplicant.mockResolvedValue(false);

    const first = await signInAction(
      formData({ email: "student@iiitp.ac.in", password: "Correct-Horse-42" })
    );
    const retry = await signInAction(
      formData({ email: "student@iiitp.ac.in", password: "Correct-Horse-42" })
    );

    expect(first.ok).toBe(false);
    expect(retry.ok).toBe(false);
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    expect(mocks.signOut).toHaveBeenNthCalledWith(1, { scope: "local" });
    expect(mocks.signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
  });

  it("contains a rejected sign-in repair and cleanup promise", async () => {
    mocks.provisionConfirmedApplicant.mockRejectedValueOnce(new Error("raw database failure"));
    mocks.signOut.mockRejectedValueOnce(new Error("cleanup failure"));

    await expect(
      signInAction(formData({ email: "student@iiitp.ac.in", password: "Correct-Horse-42" }))
    ).resolves.toEqual({
      ok: false,
      message: "Account setup could not finish. Sign in again to retry."
    });
  });

  it("keeps recovery acknowledgements generic and queues manual admin review", async () => {
    mocks.createSupabaseServiceClient.mockReturnValueOnce({ schema: mocks.serviceSchema });

    const result = await requestPasswordResetAction(formData({ email: " STUDENT@IIITP.AC.IN " }));

    expect(result.ok).toBe(true);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(mocks.serviceSchema).toHaveBeenCalledWith("api");
    expect(mocks.serviceRpc).toHaveBeenCalledWith("request_manual_password_reset", {
      requested_email: "student@iiitp.ac.in"
    });
  });

  it("updates only a matching strong replacement password", async () => {
    const invalid = await updatePasswordAction(
      formData({ password: "Correct-Horse-42", confirmPassword: "Different-Horse-42" })
    );
    const valid = await updatePasswordAction(
      formData({ password: "Correct-Horse-42", confirmPassword: "Correct-Horse-42" })
    );

    expect(invalid.ok).toBe(false);
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "Correct-Horse-42" });
    expect(valid.ok).toBe(true);
  });

  it("signs out the cookie-backed Supabase session", async () => {
    expect(await signOutAction(new FormData())).toEqual({
      ok: true,
      message: "You are signed out."
    });
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
