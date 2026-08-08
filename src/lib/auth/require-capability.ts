import "server-only";
import { redirect } from "next/navigation";
import { getServerEnvironment } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAnyCapability(required: readonly string[]) {
  const environment = getServerEnvironment();
  if (environment.demoMode) return;
  const client = await createSupabaseServerClient();
  if (!client) redirect("/auth/error?code=service_unavailable");
  const checks = await Promise.all(
    required.map((capability) =>
      client.schema("api").rpc("has_capability", { required_capability: capability })
    )
  );
  if (!checks.some((check) => check.data === true)) redirect("/auth/error?code=permission_denied");
}
