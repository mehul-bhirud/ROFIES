import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  userRpc: vi.fn(),
  serviceRpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({
    ROFIES_APP_ORIGIN: "http://localhost:3000",
    allowedEmailDomains: ["iiitp.ac.in"],
    maintenanceMode: false
  })
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: routeMocks.createSupabaseServerClient,
  createSupabaseServiceClient: routeMocks.createSupabaseServiceClient
}));

import {
  handleMemberApplicationRequest,
  MAX_COLLEGE_ID_INPUT_BYTES,
  type MemberApplicationDependencies
} from "@/lib/auth/member-application";
import { POST } from "@/app/api/member-application/route";

const ownedApplicationId = "11111111-1111-4111-8111-111111111111";
const foreignApplicationId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

async function validCollegeId() {
  return new File(
    [
      await sharp({
        create: { width: 640, height: 400, channels: 3, background: "#d9f2f5" }
      })
        .png()
        .toBuffer()
    ],
    "college-id.png",
    { type: "image/png" }
  );
}

async function requestWith(
  file: File,
  overrides: Record<string, string> = {},
  contentLength = file.size + 4096
) {
  const form = new FormData();
  const values = {
    fullName: "Ada Student",
    studentIdentifier: "S-2026-0042",
    department: "Electronics and Communication Engineering",
    studyYear: "2",
    phone: "+91 98765 43210",
    ...overrides
  };
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  form.set("collegeId", file);
  return new Request("http://localhost:3000/api/member-application", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-length": String(contentLength)
    },
    body: form
  });
}

function createDependencies(initialState: "incomplete" | "changes_requested" = "incomplete") {
  let state: "incomplete" | "changes_requested" | "pending_review" = initialState;
  let submitFailure = false;
  let registerFailure = false;
  const storedObjects = new Map<string, Uint8Array>();
  const registeredApplications: string[] = [];
  const uploadedObjectNames: string[] = [];
  const removedObjectNames: string[] = [];
  const submissions: Array<Record<string, unknown>> = [];
  let objectSequence = 0;
  let referenceSequence = 0;

  const dependencies: MemberApplicationDependencies = {
    appOrigin: "http://localhost:3000",
    allowedEmailDomains: ["iiitp.ac.in"],
    maintenanceMode: false,
    createReferenceId: () => `reference-${++referenceSequence}`,
    createObjectId: () =>
      `${String(++objectSequence).padStart(8, "0")}-0000-4000-8000-000000000000`,
    getCurrentUser: async () => ({
      id: userId,
      email: "student@iiitp.ac.in",
      emailConfirmedAt: "2026-08-08T10:00:00.000Z"
    }),
    getApplicationStatus: async () => ({
      applicationId: ownedApplicationId,
      state,
      membershipStatus: "inactive",
      decisionReason: null
    }),
    consumeRateLimit: async () => true,
    uploadCollegeId: async (objectName, bytes) => {
      uploadedObjectNames.push(objectName);
      storedObjects.set(objectName, bytes);
      return { ok: true };
    },
    registerCollegeId: async (metadata) => {
      registeredApplications.push(metadata.applicationId);
      if (registerFailure) return { ok: false };
      return { ok: true };
    },
    submitApplication: async (fields) => {
      submissions.push(fields);
      if (submitFailure) return { ok: false };
      state = "pending_review";
      return { ok: true };
    },
    removeCollegeId: async (objectName) => {
      removedObjectNames.push(objectName);
      storedObjects.delete(objectName);
    }
  };

  return {
    dependencies,
    storedObjects,
    registeredApplications,
    uploadedObjectNames,
    removedObjectNames,
    submissions,
    failSubmit: () => {
      submitFailure = true;
    },
    failRegistration: () => {
      registerFailure = true;
    }
  };
}

describe("member application upload coordination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.userRpc.mockImplementation(async (command: string) => {
      if (command === "member_application_status")
        return {
          data: {
            application_id: ownedApplicationId,
            state: "incomplete",
            membership_status: "inactive",
            decision_reason: null
          },
          error: null
        };
      if (command === "consume_rate_limit") return { data: true, error: null };
      if (command === "submit_member_application")
        return {
          data: { application_id: ownedApplicationId, state: "pending_review" },
          error: null
        };
      return { data: null, error: new Error("unexpected command") };
    });
    routeMocks.serviceRpc.mockResolvedValue({
      data: { application_id: ownedApplicationId, state: "registered" },
      error: null
    });
    routeMocks.upload.mockResolvedValue({ data: { path: "private" }, error: null });
    routeMocks.remove.mockResolvedValue({ data: [], error: null });
    routeMocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: userId,
              email: "student@iiitp.ac.in",
              email_confirmed_at: "2026-08-08T10:00:00.000Z"
            }
          },
          error: null
        })
      },
      schema: () => ({ rpc: routeMocks.userRpc })
    });
    routeMocks.createSupabaseServiceClient.mockReturnValue({
      storage: {
        from: () => ({ upload: routeMocks.upload, remove: routeMocks.remove })
      },
      schema: () => ({ rpc: routeMocks.serviceRpc })
    });
  });

  it("rejects non-image bytes before touching private storage", async () => {
    const harness = createDependencies();
    const response = await handleMemberApplicationRequest(
      await requestWith(new File(["not an image"], "id.png", { type: "image/png" })),
      harness.dependencies
    );

    expect(response.status).toBe(422);
    expect(harness.uploadedObjectNames).toEqual([]);
    expect(await response.json()).toEqual({
      message: "Use one JPEG, PNG, or WebP image up to 8 MB.",
      referenceId: "reference-1"
    });
  });

  it("rejects an oversized college-ID file before decoding or storage", async () => {
    const harness = createDependencies();
    const oversized = new File([new Uint8Array(MAX_COLLEGE_ID_INPUT_BYTES + 1)], "oversized.png", {
      type: "image/png"
    });
    const response = await handleMemberApplicationRequest(
      await requestWith(oversized, {}, oversized.size + 4096),
      harness.dependencies
    );

    expect(response.status).toBe(413);
    expect(harness.uploadedObjectNames).toEqual([]);
  });

  it("derives the replacement application from the caller and ignores a foreign form field", async () => {
    const harness = createDependencies("changes_requested");
    const response = await handleMemberApplicationRequest(
      await requestWith(await validCollegeId(), { applicationId: foreignApplicationId }),
      harness.dependencies
    );

    expect(response.status).toBe(201);
    expect(harness.registeredApplications).toEqual([ownedApplicationId]);
    expect(harness.uploadedObjectNames).toHaveLength(1);
    expect(harness.uploadedObjectNames[0]).toMatch(
      new RegExp(`^applications/${ownedApplicationId}/[0-9a-f-]+\\.webp$`)
    );
    expect(harness.uploadedObjectNames[0]).not.toContain(foreignApplicationId);
  });

  it.each(["registration", "submission"] as const)(
    "deletes a newly uploaded object when %s database work fails",
    async (failure) => {
      const harness = createDependencies("changes_requested");
      if (failure === "registration") harness.failRegistration();
      else harness.failSubmit();

      const response = await handleMemberApplicationRequest(
        await requestWith(await validCollegeId()),
        harness.dependencies
      );

      expect(response.status).toBe(409);
      expect(harness.storedObjects.size).toBe(0);
      expect(harness.removedObjectNames).toEqual(harness.uploadedObjectNames);
      expect(await response.json()).toEqual({
        message: "Application could not be submitted. Review your details and retry.",
        referenceId: "reference-1"
      });
    }
  );

  it("makes a changes-requested resubmission idempotent after the first commit", async () => {
    const harness = createDependencies("changes_requested");
    const first = await handleMemberApplicationRequest(
      await requestWith(await validCollegeId()),
      harness.dependencies
    );
    const retry = await handleMemberApplicationRequest(
      await requestWith(await validCollegeId()),
      harness.dependencies
    );

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(harness.uploadedObjectNames).toHaveLength(1);
    expect(harness.submissions).toHaveLength(1);
    expect(await first.json()).toEqual({ status: "pending_review", referenceId: "reference-1" });
    expect(await retry.json()).toEqual({ status: "pending_review", referenceId: "reference-2" });
  });

  it("returns no applicant fields, private object path, or provider details after commit", async () => {
    const harness = createDependencies();
    const response = await handleMemberApplicationRequest(
      await requestWith(await validCollegeId()),
      harness.dependencies
    );
    const body = await response.text();

    expect(response.status).toBe(201);
    expect(JSON.parse(body)).toEqual({ status: "pending_review", referenceId: "reference-1" });
    expect(body).not.toContain("applications/");
    expect(body).not.toContain("Ada Student");
    expect(body).not.toContain("S-2026-0042");
    expect(body).not.toContain("98765");
    expect(body).not.toContain("service");
  });

  it("adapts the reviewed user and service RPC interfaces without exposing provider results", async () => {
    const response = await POST(await requestWith(await validCollegeId()));
    const registrationCall = routeMocks.serviceRpc.mock.calls.find(
      ([command]) => command === "register_college_id_document"
    );
    const submissionCall = routeMocks.userRpc.mock.calls.find(
      ([command]) => command === "submit_member_application"
    );

    expect(response.status).toBe(201);
    expect(registrationCall?.[1]).toEqual({
      application_id: ownedApplicationId,
      object_name: expect.stringMatching(
        new RegExp(`^applications/${ownedApplicationId}/[0-9a-f-]+\\.webp$`)
      ),
      byte_size: expect.any(Number),
      width: 640,
      height: 400,
      checksum_sha256: expect.stringMatching(/^[0-9a-f]{64}$/)
    });
    expect(submissionCall?.[1]).toEqual({
      display_name: "Ada Student",
      student_identifier: "S-2026-0042",
      study_year: 2,
      department: "Electronics and Communication Engineering",
      phone: "+91 98765 43210"
    });
    expect(await response.json()).toMatchObject({ status: "pending_review" });
  });

  it("retries idempotent metadata registration before treating an ambiguous response as failure", async () => {
    routeMocks.serviceRpc
      .mockResolvedValueOnce({ data: null, error: new Error("response lost") })
      .mockResolvedValueOnce({
        data: { application_id: ownedApplicationId, state: "registered" },
        error: null
      });

    const response = await POST(await requestWith(await validCollegeId()));

    expect(response.status).toBe(201);
    expect(routeMocks.serviceRpc).toHaveBeenCalledTimes(2);
    expect(routeMocks.remove).not.toHaveBeenCalled();
  });

  it("verifies submission state before deleting an object after an ambiguous response", async () => {
    let statusChecks = 0;
    routeMocks.userRpc.mockImplementation(async (command: string) => {
      if (command === "member_application_status") {
        statusChecks += 1;
        return {
          data: {
            application_id: ownedApplicationId,
            state: statusChecks === 1 ? "incomplete" : "pending_review",
            membership_status: "inactive",
            decision_reason: null
          },
          error: null
        };
      }
      if (command === "consume_rate_limit") return { data: true, error: null };
      if (command === "submit_member_application")
        return { data: null, error: new Error("response lost") };
      return { data: null, error: new Error("unexpected command") };
    });

    const response = await POST(await requestWith(await validCollegeId()));

    expect(response.status).toBe(201);
    expect(statusChecks).toBe(2);
    expect(routeMocks.remove).not.toHaveBeenCalled();
  });
});
