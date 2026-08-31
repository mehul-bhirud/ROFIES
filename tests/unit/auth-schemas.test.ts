import { describe, expect, it } from "vitest";
import {
  createPasswordResetRequestSchema,
  createSignInSchema,
  createSignUpSchema,
  updatePasswordSchema
} from "@/lib/auth/schemas";
import { normalizeInstitutionalEmail, validateInstitutionalEmail } from "@/lib/auth/identity";
import { buildApplicantProfile } from "@/lib/auth/profile-provisioning";

const allowedDomains = ["iiitp.ac.in"] as const;

describe("institutional password authentication schemas", () => {
  it("normalizes institutional email before returning validated signup data", () => {
    const result = createSignUpSchema(allowedDomains).safeParse({
      email: " STUDENT@IIITP.AC.IN ",
      password: "Correct-Horse-42"
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("student@iiitp.ac.in");
  });

  it("rejects a valid external email address", () => {
    expect(
      createSignUpSchema(allowedDomains).safeParse({
        email: "student@gmail.com",
        password: "Correct-Horse-42"
      }).success
    ).toBe(false);
  });

  it("allows the configured developer email without allowing the whole Gmail domain", () => {
    expect(
      createSignInSchema(allowedDomains).safeParse({
        email: " MEHUL.C.BHIRUD@GMAIL.COM ",
        password: "Correct-Horse-42"
      }).success
    ).toBe(true);
    expect(
      createSignInSchema(allowedDomains).safeParse({
        email: "someone.else@gmail.com",
        password: "Correct-Horse-42"
      }).success
    ).toBe(false);
  });

  it.each(["short", "all-lowercase-42", "ALL-UPPERCASE-42", "No-Numbers-Here"])(
    "rejects a password missing a required strength characteristic: %s",
    (password) => {
      expect(
        createSignUpSchema(allowedDomains).safeParse({
          email: "student@iiitp.ac.in",
          password
        }).success
      ).toBe(false);
    }
  );

  it("normalizes sign-in and recovery addresses through the same boundary", () => {
    const signIn = createSignInSchema(allowedDomains).parse({
      email: " MEMBER@IIITP.AC.IN ",
      password: "Correct-Horse-42"
    });
    const recovery = createPasswordResetRequestSchema(allowedDomains).parse({
      email: " MEMBER@IIITP.AC.IN "
    });

    expect(signIn.email).toBe("member@iiitp.ac.in");
    expect(recovery.email).toBe("member@iiitp.ac.in");
  });

  it("requires matching strong passwords when setting a replacement", () => {
    expect(
      updatePasswordSchema.safeParse({
        password: "Correct-Horse-42",
        confirmPassword: "Different-Horse-42"
      }).success
    ).toBe(false);
    expect(
      updatePasswordSchema.safeParse({
        password: "Correct-Horse-42",
        confirmPassword: "Correct-Horse-42"
      }).success
    ).toBe(true);
  });
});

describe("institutional identity", () => {
  it("normalizes surrounding whitespace and casing", () => {
    expect(normalizeInstitutionalEmail(" STUDENT@IIITP.AC.IN ")).toBe("student@iiitp.ac.in");
  });

  it("validates only an exact configured domain", () => {
    expect(validateInstitutionalEmail("student@iiitp.ac.in", allowedDomains)).toBe(true);
    expect(validateInstitutionalEmail("student@sub.iiitp.ac.in", allowedDomains)).toBe(false);
    expect(validateInstitutionalEmail("student@iiitp.ac.in.attacker.test", allowedDomains)).toBe(
      false
    );
  });

  it("validates only the configured developer email exception", () => {
    expect(validateInstitutionalEmail("mehul.c.bhirud@gmail.com", allowedDomains)).toBe(true);
    expect(validateInstitutionalEmail("mehul.c.bhirud+test@gmail.com", allowedDomains)).toBe(false);
    expect(validateInstitutionalEmail("attacker@gmail.com", allowedDomains)).toBe(false);
  });

  it("builds a new applicant profile without granting active access", () => {
    expect(
      buildApplicantProfile(
        "5a6a36f7-5927-4fa4-a9bd-0a6d9a8022ab",
        "student@iiitp.ac.in",
        "2026-08-08T10:00:00.000Z"
      )
    ).toEqual({
      id: "5a6a36f7-5927-4fa4-a9bd-0a6d9a8022ab",
      institutional_email: "student@iiitp.ac.in",
      display_name: "student",
      active: false,
      last_authenticated_at: "2026-08-08T10:00:00.000Z",
      updated_at: "2026-08-08T10:00:00.000Z"
    });
  });
});
