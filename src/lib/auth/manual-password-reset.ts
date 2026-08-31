import "server-only";
import { randomBytes } from "crypto";
import { postgresUuidSchema } from "@/lib/validation/uuid";

export type ManualPasswordResetResult = {
  ok: boolean;
  message: string;
  temporaryPassword?: string;
};

type RpcClient = {
  schema: (schema: string) => {
    rpc: (
      name: string,
      args?: Record<string, unknown>
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
};

type TableMutationResult<T> = PromiseLike<{ data: T | null; error: unknown }>;

type UpdateSelectBuilder<T> = {
  maybeSingle: () => TableMutationResult<T>;
};

type UpdateFilterBuilder<T> = {
  eq: (column: string, value: unknown) => UpdateFilterBuilder<T>;
  select: (columns: string) => UpdateSelectBuilder<T>;
};

type TableClient = {
  insert: (values: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
  update: (values: Record<string, unknown>) => UpdateFilterBuilder<Record<string, unknown>>;
};

type QueryClient = {
  from: (table: string) => TableClient;
};

type ServerClient = RpcClient & {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null }; error?: unknown }>;
  };
};

type ServiceClient = RpcClient &
  QueryClient & {
    auth: {
      admin: {
        listUsers: (args: { page: number; perPage: number }) => Promise<{
          data: { users: Array<{ id: string; email?: string | null }> };
          error: unknown;
        }>;
        updateUserById: (
          userId: string,
          attributes: { password: string }
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };

type CompleteManualResetOptions = {
  serverClient: ServerClient | null;
  serviceClient: ServiceClient | null;
  requestId: string;
  reason: string;
  passwordFactory?: () => string;
};

const authorizedCapabilities = ["system:manage", "roles:manage"] as const;

export const manualRecoveryMessage =
  "If an account can use this address, a club administrator will review the reset request.";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeReason(reason: string) {
  return reason.trim().slice(0, 500);
}

export function generateTemporaryPassword() {
  const token = randomBytes(18).toString("base64url");
  return `Rofies-${token}-7A`;
}

export async function queueManualPasswordResetRequest(client: RpcClient | null, email: string) {
  if (!client) return;
  await client.schema("api").rpc("request_manual_password_reset", {
    requested_email: normalizeEmail(email)
  });
}

async function hasResetAuthority(client: ServerClient) {
  const checks = await Promise.all(
    authorizedCapabilities.map((capability) =>
      client.schema("api").rpc("has_capability", { required_capability: capability })
    )
  );
  return checks.some((check) => check.data === true);
}

async function findAuthUserIdByEmail(client: ServiceClient, email: string) {
  const normalized = normalizeEmail(email);
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const user = data.users.find(
      (candidate) => normalizeEmail(candidate.email ?? "") === normalized
    );
    if (user) return user.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function claimPendingRequest(
  client: ServiceClient,
  requestId: string,
  adminId: string,
  reason: string
) {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("password_reset_requests")
    .update({
      status: "processing",
      processed_by: adminId,
      processed_at: now,
      admin_note: normalizeReason(reason)
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id,institutional_email")
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; institutional_email: string };
}

async function markRequest(
  client: ServiceClient,
  requestId: string,
  status: "pending" | "completed" | "dismissed"
) {
  await client
    .from("password_reset_requests")
    .update({ status, processed_at: status === "pending" ? null : new Date().toISOString() })
    .eq("id", requestId)
    .select("id")
    .maybeSingle();
}

async function recordAudit(
  client: ServiceClient,
  actorId: string,
  action: string,
  targetId: string | null,
  reason: string
) {
  await client.from("audit_events").insert({
    actor_id: actorId,
    action,
    target_type: "auth_user",
    target_id: targetId,
    reason: normalizeReason(reason),
    after_summary: { password_visible: false, temporary_password_stored: false }
  });
}

export async function completeManualPasswordReset({
  serverClient,
  serviceClient,
  requestId,
  reason,
  passwordFactory = generateTemporaryPassword
}: CompleteManualResetOptions): Promise<ManualPasswordResetResult> {
  if (!postgresUuidSchema.safeParse(requestId).success)
    return { ok: false, message: "Invalid reset request." };
  if (!serverClient || !serviceClient)
    return { ok: false, message: "Account recovery is temporarily unavailable." };

  const { data } = await serverClient.auth.getUser();
  const adminId = data.user?.id;
  if (!adminId) return { ok: false, message: "Sign in as an administrator." };
  if (!(await hasResetAuthority(serverClient))) return { ok: false, message: "Permission denied." };

  const claimed = await claimPendingRequest(serviceClient, requestId, adminId, reason);
  if (!claimed) return { ok: false, message: "Reset request is no longer pending." };

  const authUserId = await findAuthUserIdByEmail(serviceClient, claimed.institutional_email);
  if (!authUserId) {
    await markRequest(serviceClient, requestId, "dismissed");
    await recordAudit(serviceClient, adminId, "auth.manual_password_reset_dismissed", null, reason);
    return { ok: false, message: "No matching Supabase Auth user was found." };
  }

  const temporaryPassword = passwordFactory();
  const { error } = await serviceClient.auth.admin.updateUserById(authUserId, {
    password: temporaryPassword
  });
  if (error) {
    await markRequest(serviceClient, requestId, "pending");
    return { ok: false, message: "Supabase Auth rejected the password update." };
  }

  await markRequest(serviceClient, requestId, "completed");
  await recordAudit(
    serviceClient,
    adminId,
    "auth.manual_password_reset_completed",
    authUserId,
    reason
  );
  return {
    ok: true,
    message: "Temporary password generated. Share it through an approved manual channel.",
    temporaryPassword
  };
}
