import { describe, expect, it } from "vitest";
import { applicationDestination } from "@/lib/auth/application-access";

describe("applicant route isolation", () => {
  it.each([
    ["incomplete", "/onboarding"],
    ["changes_requested", "/onboarding"],
    ["pending_review", "/pending"],
    ["rejected", "/pending"]
  ] as const)("routes an inactive %s applicant to %s", (applicationState, expected) => {
    expect(applicationDestination({ emailConfirmed: true, active: false, applicationState })).toBe(
      expected
    );
  });

  it("allows only an approved application with active membership into the member app", () => {
    expect(
      applicationDestination({
        emailConfirmed: true,
        active: true,
        applicationState: "approved"
      })
    ).toBe("/");
  });

  it.each([
    { emailConfirmed: false, active: false, applicationState: "incomplete" as const },
    { emailConfirmed: true, active: true, applicationState: "pending_review" as const },
    { emailConfirmed: true, active: false, applicationState: "approved" as const },
    { emailConfirmed: true, active: true, applicationState: "rejected" as const },
    { emailConfirmed: true, active: false, applicationState: null }
  ])("fails closed for inconsistent application access: %o", (input) => {
    expect(applicationDestination(input)).toBe("/auth/error");
  });
});
