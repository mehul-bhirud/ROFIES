import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeInstitutionalEmail } from "@/lib/auth/identity";

export function buildApplicantProfile(id: string, email: string, authenticatedAt: string) {
  const institutionalEmail = normalizeInstitutionalEmail(email);
  return {
    id,
    institutional_email: institutionalEmail,
    display_name: institutionalEmail.slice(0, institutionalEmail.lastIndexOf("@")).slice(0, 120),
    active: false,
    last_authenticated_at: authenticatedAt,
    updated_at: authenticatedAt
  } as const;
}

export function buildSafeProfileUpdate(displayName: string, authenticatedAt: string) {
  return {
    display_name: displayName,
    last_authenticated_at: authenticatedAt,
    updated_at: authenticatedAt
  } as const;
}

export async function provisionConfirmedApplicant(
  service: SupabaseClient,
  user: { id: string; email?: string | null },
  authenticatedAt = new Date().toISOString()
) {
  if (!user.email) return false;
  try {
    const { data: existing, error: lookupError } = await service
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (lookupError) return false;

    if (existing) {
      const { error } = await service
        .from("profiles")
        .update({ last_authenticated_at: authenticatedAt, updated_at: authenticatedAt })
        .eq("id", user.id);
      if (error) return false;
    } else {
      const { error } = await service
        .from("profiles")
        .insert(buildApplicantProfile(user.id, user.email, authenticatedAt));
      if (error) return false;
    }

    const { error: applicationError } = await service
      .from("member_applications")
      .upsert(
        { profile_id: user.id, state: "incomplete" },
        { onConflict: "profile_id", ignoreDuplicates: true }
      );
    return !applicationError;
  } catch {
    return false;
  }
}
