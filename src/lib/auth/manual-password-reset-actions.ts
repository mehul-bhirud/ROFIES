"use server";

import { revalidatePath } from "next/cache";
import {
  completeManualPasswordReset,
  type ManualPasswordResetResult
} from "@/lib/auth/manual-password-reset";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

export type ManualPasswordResetActionState = ManualPasswordResetResult;

export async function completeManualPasswordResetAction(
  _previousState: ManualPasswordResetActionState,
  formData: FormData
): Promise<ManualPasswordResetActionState> {
  const result = await completeManualPasswordReset({
    serverClient: await createSupabaseServerClient(),
    serviceClient: createSupabaseServiceClient(),
    requestId: String(formData.get("requestId") ?? ""),
    reason: String(formData.get("reason") ?? "")
  });
  revalidatePath("/admin");
  revalidatePath("/admin/account-recovery");
  return result;
}
