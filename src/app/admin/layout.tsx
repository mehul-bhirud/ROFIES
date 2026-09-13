import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { hasStaffCapability } from "@/lib/auth/access";
import { getServerEnvironment } from "@/lib/env/server";
import { getCapabilities, getCurrentUser, getProfileSummary } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const environment = getServerEnvironment();
  if (environment.demoMode) return children;
  if (!environment.supabaseConfigured) redirect("/auth/error?code=service_unavailable");

  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const [profile, capabilities] = await Promise.all([
    getProfileSummary(user.id),
    getCapabilities(user.id)
  ]);
  if (!profile?.active) redirect("/auth/error?code=account_inactive");
  if (!hasStaffCapability(capabilities)) {
    redirect("/auth/error?code=permission_denied");
  }
  return children;
}
