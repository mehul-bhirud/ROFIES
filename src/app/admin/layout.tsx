import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { hasStaffCapability } from "@/lib/auth/access";
import { getServerEnvironment } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const environment = getServerEnvironment();
  if (environment.demoMode) return children;

  const client = await createSupabaseServerClient();
  if (!client) redirect("/auth/error?code=service_unavailable");
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) redirect("/auth/sign-in");

  const [{ data: profile }, { data: roles }] = await Promise.all([
    client.from("profiles").select("active").eq("id", userData.user.id).maybeSingle(),
    client
      .from("role_assignments")
      .select("capability")
      .eq("profile_id", userData.user.id)
      .is("revoked_at", null)
  ]);
  if (!profile?.active) redirect("/auth/error?code=account_inactive");
  if (!hasStaffCapability((roles ?? []).map((role) => String(role.capability)))) {
    redirect("/auth/error?code=permission_denied");
  }
  return children;
}
