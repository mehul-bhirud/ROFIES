import { type NextRequest, NextResponse } from "next/server";
import { getServerEnvironment } from "@/lib/env/server";
import { isAllowedInstitutionalIdentity } from "@/lib/auth/identity";
import { provisionConfirmedApplicant } from "@/lib/auth/profile-provisioning";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

const supportedTypes = new Set(["email", "recovery"] as const);

type SupportedType = "email" | "recovery";

function redirectTo(path: string, origin: string) {
  return NextResponse.redirect(new URL(path, origin));
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

export async function GET(request: NextRequest) {
  const env = getServerEnvironment();
  let client;
  try {
    client = await createSupabaseServerClient();
  } catch {
    return redirectTo("/auth/error?code=service_unavailable", env.ROFIES_APP_ORIGIN);
  }
  if (!client) return redirectTo("/auth/error?code=service_unavailable", env.ROFIES_APP_ORIGIN);

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const requestedType = request.nextUrl.searchParams.get("type");
  if (!tokenHash || !requestedType || !supportedTypes.has(requestedType as SupportedType)) {
    await clearLocalSession(client);
    return redirectTo("/auth/error?code=confirmation_failed", env.ROFIES_APP_ORIGIN);
  }

  const type = requestedType as SupportedType;
  let verification;
  try {
    verification = await client.auth.verifyOtp({ token_hash: tokenHash, type });
  } catch {
    await clearLocalSession(client);
    return redirectTo("/auth/error?code=confirmation_failed", env.ROFIES_APP_ORIGIN);
  }
  const { data, error } = verification;
  const user = data.user;
  if (
    error ||
    !user ||
    !isAllowedInstitutionalIdentity(
      { email: user.email, emailVerified: Boolean(user.email_confirmed_at) },
      env.allowedEmailDomains
    )
  ) {
    await clearLocalSession(client);
    return redirectTo("/auth/error?code=confirmation_failed", env.ROFIES_APP_ORIGIN);
  }

  if (type === "recovery") {
    return redirectTo("/auth/update-password", env.ROFIES_APP_ORIGIN);
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
    return redirectTo("/auth/error?code=profile_unavailable", env.ROFIES_APP_ORIGIN);
  }

  return redirectTo("/onboarding", env.ROFIES_APP_ORIGIN);
}
