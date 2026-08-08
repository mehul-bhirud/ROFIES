import { z } from "zod";
import { validateInstitutionalEmail } from "@/lib/auth/identity";

export const PASSWORD_REQUIREMENTS =
  "Use at least 12 characters with an uppercase letter, a lowercase letter, and a number.";

const normalizedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

const strongPasswordSchema = z
  .string()
  .min(12, PASSWORD_REQUIREMENTS)
  .max(128, "Password must be 128 characters or fewer.")
  .regex(/[a-z]/, PASSWORD_REQUIREMENTS)
  .regex(/[A-Z]/, PASSWORD_REQUIREMENTS)
  .regex(/[0-9]/, PASSWORD_REQUIREMENTS);

function institutionalEmailSchema(allowedDomains: readonly string[]) {
  return normalizedEmailSchema.refine(
    (email) => validateInstitutionalEmail(email, allowedDomains),
    "Use your institutional email address."
  );
}

export function createSignUpSchema(allowedDomains: readonly string[]) {
  return z.object({
    email: institutionalEmailSchema(allowedDomains),
    password: strongPasswordSchema
  });
}

export function createSignInSchema(allowedDomains: readonly string[]) {
  return z.object({
    email: institutionalEmailSchema(allowedDomains),
    password: z.string().min(1, "Enter your password.").max(128, "Password is too long.")
  });
}

export function createPasswordResetRequestSchema(allowedDomains: readonly string[]) {
  return z.object({ email: institutionalEmailSchema(allowedDomains) });
}

export const updatePasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

const defaultAllowedDomains = ["iiitp.ac.in", "ece.iiitp.ac.in", "cse.iiitp.ac.in"] as const;

export const signUpSchema = createSignUpSchema(defaultAllowedDomains);
export const signInSchema = createSignInSchema(defaultAllowedDomains);
export const passwordResetRequestSchema = createPasswordResetRequestSchema(defaultAllowedDomains);
export const recoverySchema = passwordResetRequestSchema;
