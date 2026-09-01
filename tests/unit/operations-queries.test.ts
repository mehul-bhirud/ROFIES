import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  environment: {
    ROFIES_ENVIRONMENT: "test",
    demoMode: false,
    supabaseConfigured: true
  }
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => mocks.environment
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

import { getMemberApplicationQueue } from "@/lib/operations/queries";

describe("operations query loaders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.environment.demoMode = false;
    mocks.environment.supabaseConfigured = true;
  });

  it("disambiguates the applicant profile relationship in the member review queue", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "00000000-0000-0000-0000-000000000111",
          state: "pending_review",
          submitted_at: "2026-08-08T10:30:00.000Z",
          decision_reason: null,
          profiles: {
            display_name: "Confirmed Applicant",
            student_identifier: "TEST-11",
            department: "CSE",
            study_year: 2,
            institutional_email: "confirmed@iiitp.ac.in"
          }
        }
      ],
      error: null
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createSupabaseServerClient.mockResolvedValue({ from });

    const applications = await getMemberApplicationQueue();

    expect(from).toHaveBeenCalledWith("member_applications");
    expect(select).toHaveBeenCalledWith(
      "id,state,submitted_at,decision_reason,profiles!member_applications_profile_id_fkey(display_name,student_identifier,department,study_year,institutional_email)"
    );
    expect(applications[0]).toMatchObject({
      applicationId: "00000000-0000-0000-0000-000000000111",
      applicantName: "Confirmed Applicant",
      institutionalEmail: "confirmed@iiitp.ac.in"
    });
  });
});
