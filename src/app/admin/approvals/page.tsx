import { AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ApprovalWorkbench } from "@/components/admin/approval-workbench";
import { getApprovalWorkbench } from "@/lib/operations/queries";
import { requireAnyCapability } from "@/lib/auth/require-capability";

export default async function ApprovalsPage() {
  await requireAnyCapability(["request:approve"]);
  const requests = await getApprovalWorkbench();
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Operations / Approvals</p>
          <h1>Decide with current capacity</h1>
          <p>
            Each line receives its own decision. Reductions, rejections, changes, and overrides
            require an explicit reason.
          </p>
        </div>
      </div>
      <div className="notice notice-warning">
        <AlertTriangle size={19} aria-hidden="true" />
        <p>
          Requester and approver identities are compared on the server and in PostgreSQL.
          Self-approval fails closed.
        </p>
      </div>
      <ApprovalWorkbench requests={requests} />
    </AppShell>
  );
}
