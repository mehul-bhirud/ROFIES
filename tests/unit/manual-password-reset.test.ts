import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  completeManualPasswordReset,
  queueManualPasswordResetRequest
} from "@/lib/auth/manual-password-reset";

const adminUser = { id: "00000000-0000-0000-0000-000000000006" };
const resetRequest = {
  id: "00000000-0000-0000-0000-000000000701",
  institutional_email: "student@iiitp.ac.in"
};

function serverClient(capabilityResults: boolean[]) {
  const getUser = vi.fn().mockResolvedValue({ data: { user: adminUser }, error: null });
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: capabilityResults[0], error: null })
    .mockResolvedValueOnce({ data: capabilityResults[1], error: null });
  return {
    auth: { getUser },
    schema: vi.fn(() => ({ rpc }))
  };
}

function serviceClient() {
  const updateUserById = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  const listUsers = vi.fn().mockResolvedValue({
    data: { users: [{ id: "user-1", email: "student@iiitp.ac.in" }] },
    error: null
  });
  const rpc = vi.fn().mockResolvedValue({ data: { id: resetRequest.id }, error: null });
  const updateResult = {
    maybeSingle: vi.fn().mockResolvedValue({ data: resetRequest, error: null })
  };
  const updateBuilder = {
    eq: vi.fn(),
    select: vi.fn(() => updateResult)
  };
  updateBuilder.eq.mockReturnValue(updateBuilder);
  const update = vi.fn(() => updateBuilder);
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({
    insert,
    update,
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: resetRequest, error: null })
        }))
      }))
    }))
  }));
  return {
    auth: { admin: { listUsers, updateUserById } },
    schema: vi.fn(() => ({ rpc })),
    from,
    rpc,
    insert,
    update,
    listUsers,
    updateUserById
  };
}

describe("manual password reset", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("queues a normalized request through the database API without storing a password", async () => {
    const service = serviceClient();

    await queueManualPasswordResetRequest(service, " STUDENT@IIITP.AC.IN ");

    expect(service.schema).toHaveBeenCalledWith("api");
    expect(service.rpc).toHaveBeenCalledWith("request_manual_password_reset", {
      requested_email: "student@iiitp.ac.in"
    });
  });

  it("requires privileged staff before generating a temporary password", async () => {
    const result = await completeManualPasswordReset({
      serverClient: serverClient([false, false]),
      serviceClient: serviceClient(),
      requestId: resetRequest.id,
      reason: "Student called from registered phone",
      passwordFactory: () => "Temp-Pass-1234"
    });

    expect(result).toEqual({ ok: false, message: "Permission denied." });
  });

  it("sets a new temporary password and returns it once without writing it to database rows", async () => {
    const server = serverClient([false, true]);
    const service = serviceClient();

    const result = await completeManualPasswordReset({
      serverClient: server,
      serviceClient: service,
      requestId: resetRequest.id,
      reason: "Student called from registered phone",
      passwordFactory: () => "Temp-Pass-1234"
    });

    expect(result).toEqual({
      ok: true,
      message: "Temporary password generated. Share it through an approved manual channel.",
      temporaryPassword: "Temp-Pass-1234"
    });
    expect(service.updateUserById).toHaveBeenCalledWith("user-1", { password: "Temp-Pass-1234" });
    expect(JSON.stringify(service.from.mock.calls)).not.toContain("Temp-Pass-1234");
    expect(JSON.stringify(service.update.mock.calls)).not.toContain("Temp-Pass-1234");
  });
});
