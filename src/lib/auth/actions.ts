"use server";

import { getServerEnvironment } from "@/lib/env/server";
import { isAllowedInstitutionalIdentity } from "@/lib/auth/identity";
import { provisionConfirmedApplicant } from "@/lib/auth/profile-provisioning";
import {
  createPasswordResetRequestSchema,
  createSignInSchema,
  createSignUpSchema,
  updatePasswordSchema
} from "@/lib/auth/schemas";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

export type AuthActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

const initialState: AuthActionState = { ok: false, message: "" };
const genericSignupMessage =
  "If this address can be registered, check your inbox for a confirmation link.";
const genericRecoveryMessage =
  "If an account can use this address, check your inbox for password reset instructions.";
const unavailableMessage = "Authentication is temporarily unavailable. Try again.";

function actionFormData(first: AuthActionState | FormData, second?: FormData) {
  return first instanceof FormData ? first : (second ?? new FormData());
}

function fields(data: FormData, names: readonly string[]) {
  return Object.fromEntries(names.map((name) => [name, data.get(name)]));
}

function invalidResult(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}) {
  const fieldErrors = Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] =>
      Boolean(entry[1]?.length)
    )
  );
  return {
    ok: false,
    message: "Check the highlighted fields.",
    fieldErrors
  } satisfies AuthActionState;
}

function confirmationUrl(origin: string) {
  return new URL("/auth/confirm", origin).toString();
}

async function clearLocalSession(client: {
  auth: { signOut: (options: { scope: "local" }) => Promise<unknown> };
}) {
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Cleanup is best effort; never surface or log provider/session details.
  }
}

export async function signUpAction(formData: FormData): Promise<AuthActionState>;
export async function signUpAction(
  previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState>;
export async function signUpAction(
  first: AuthActionState | FormData,
  second?: FormData
): Promise<AuthActionState> {
  const env = getServerEnvironment();
  const parsed = createSignUpSchema(env.allowedEmailDomains).safeParse(
    fields(actionFormData(first, second), ["email", "password"])
  );
  if (!parsed.success) return invalidResult(parsed.error);

  if (env.demoMode) return { ok: true, message: genericSignupMessage };
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, message: unavailableMessage };
  try {
    await client.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: confirmationUrl(env.ROFIES_APP_ORIGIN) }
    });
  } catch {
    // Deliberately return the same acknowledgement for provider and account states.
  }
  return { ok: true, message: genericSignupMessage };
}

export async function signInAction(formData: FormData): Promise<AuthActionState>;
export async function signInAction(
  previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState>;
export async function signInAction(
  first: AuthActionState | FormData,
  second?: FormData
): Promise<AuthActionState> {
  const env = getServerEnvironment();
  const parsed = createSignInSchema(env.allowedEmailDomains).safeParse(
    fields(actionFormData(first, second), ["email", "password"])
  );
  if (!parsed.success) return invalidResult(parsed.error);

  if (env.demoMode) return { ok: true, message: "Signed in. Redirecting to your account…" };
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, message: unavailableMessage };
  let user;
  try {
    const { data, error } = await client.auth.signInWithPassword(parsed.data);
    user = data.user;
    if (
      error ||
      !user ||
      !isAllowedInstitutionalIdentity(
        { email: user.email, emailVerified: Boolean(user.email_confirmed_at) },
        env.allowedEmailDomains
      )
    ) {
      await clearLocalSession(client);
      return { ok: false, message: "Email or password is incorrect." };
    }
  } catch {
    return { ok: false, message: "Email or password is incorrect." };
  }

  let provisioned = false;
  try {
    const service = createSupabaseServiceClient();
    provisioned = Boolean(service && (await provisionConfirmedApplicant(service, user)));
  } catch {
    provisioned = false;
  }
  if (!provisioned) {
    await clearLocalSession(client);
    return { ok: false, message: "Account setup could not finish. Sign in again to retry." };
  }
  return { ok: true, message: "Signed in. Redirecting to your account…" };
}

export async function requestPasswordResetAction(formData: FormData): Promise<AuthActionState>;
export async function requestPasswordResetAction(
  previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState>;
export async function requestPasswordResetAction(
  first: AuthActionState | FormData,
  second?: FormData
): Promise<AuthActionState> {
  const env = getServerEnvironment();
  const parsed = createPasswordResetRequestSchema(env.allowedEmailDomains).safeParse(
    fields(actionFormData(first, second), ["email"])
  );
  if (!parsed.success) return invalidResult(parsed.error);

  if (env.demoMode) return { ok: true, message: genericRecoveryMessage };
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, message: unavailableMessage };
  try {
    await client.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: confirmationUrl(env.ROFIES_APP_ORIGIN)
    });
  } catch {
    // Deliberately return the same acknowledgement for provider and account states.
  }
  return { ok: true, message: genericRecoveryMessage };
}

export async function updatePasswordAction(formData: FormData): Promise<AuthActionState>;
export async function updatePasswordAction(
  previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState>;
export async function updatePasswordAction(
  first: AuthActionState | FormData,
  second?: FormData
): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse(
    fields(actionFormData(first, second), ["password", "confirmPassword"])
  );
  if (!parsed.success) return invalidResult(parsed.error);

  const env = getServerEnvironment();
  if (env.demoMode) return { ok: true, message: "You are signed out." };
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, message: unavailableMessage };
  try {
    const { error } = await client.auth.updateUser({ password: parsed.data.password });
    if (error) return { ok: false, message: "Password could not be updated. Request a new link." };
  } catch {
    return { ok: false, message: "Password could not be updated. Request a new link." };
  }
  return { ok: true, message: "Password updated. You can now sign in." };
}

export async function signOutAction(_formData?: FormData): Promise<AuthActionState>;
export async function signOutAction(
  previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState>;
export async function signOutAction(
  first: AuthActionState | FormData = initialState,
  second?: FormData
): Promise<AuthActionState> {
  void first;
  void second;
  const env = getServerEnvironment();
  if (env.demoMode) return { ok: true, message: "You are signed out." };
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, message: unavailableMessage };
  try {
    const { error } = await client.auth.signOut();
    if (error) return { ok: false, message: "Sign-out could not be completed. Try again." };
  } catch {
    return { ok: false, message: "Sign-out could not be completed. Try again." };
  }
  return { ok: true, message: "You are signed out." };
}
