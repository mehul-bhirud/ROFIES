import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * `auth.getUser()` always makes a network round-trip to the Supabase Auth
 * server. Every server component that needs the current user (layouts, the
 * app shell, page components) used to call it independently, so a single
 * page render fired off several redundant round-trips in sequence. Wrapping
 * it in React's request-scoped `cache()` collapses those into one call per
 * render, same as the profile/capability lookups below.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user ?? null;
});

export const getMemberApplicationStatus = cache(async (): Promise<unknown | null> => {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.schema("api").rpc("member_application_status");
  return error ? null : data;
});

export const getProfileSummary = cache(
  async (userId: string): Promise<{ displayName: string | null; active: boolean } | null> => {
    const client = await createSupabaseServerClient();
    if (!client) return null;
    const { data } = await client
      .from("profiles")
      .select("display_name,active")
      .eq("id", userId)
      .maybeSingle();
    if (!data) return null;
    return {
      displayName: typeof data.display_name === "string" ? data.display_name : null,
      active: Boolean(data.active)
    };
  }
);

export const getCapabilities = cache(async (userId: string): Promise<string[]> => {
  const client = await createSupabaseServerClient();
  if (!client) return [];
  const { data } = await client
    .from("role_assignments")
    .select("capability")
    .eq("profile_id", userId)
    .is("revoked_at", null);
  return (data ?? []).map((role) => String(role.capability));
});
