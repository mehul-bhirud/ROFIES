import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PasswordResetRequestCard } from "@/components/admin/password-reset-request-card";
import { requireAnyCapability } from "@/lib/auth/require-capability";
import { getManualPasswordResetQueue } from "@/lib/operations/queries";

export const metadata: Metadata = { title: "Account recovery" };

export default async function AccountRecoveryPage() {
  await requireAnyCapability(["system:manage", "roles:manage"]);
  const requests = await getManualPasswordResetQueue();

  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Administration / Account recovery</p>
          <h1>Manual password reset requests</h1>
          <p>
            Generate a new temporary password only after verifying the student through an approved
            manual channel. Existing passwords are never visible.
          </p>
        </div>
      </div>
      <div className="notice notice-warning">
        <KeyRound size={19} aria-hidden="true" />
        <p>
          Temporary passwords are shown once after generation and are not stored by the application.
          Ask the user to sign in and change it immediately.
        </p>
      </div>
      {requests.length ? (
        <section className="operation-card-grid" aria-label="Pending password reset requests">
          {requests.map((request) => (
            <PasswordResetRequestCard request={request} key={request.id} />
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <div>
            <KeyRound size={36} aria-hidden="true" />
            <h2>No password reset requests</h2>
            <p>Forgot-password submissions appear here after validation.</p>
          </div>
        </section>
      )}
    </AppShell>
  );
}
