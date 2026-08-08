import { AlertTriangle, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { OperationForm } from "@/components/forms/operation-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApprovalWorkbench } from "@/lib/operations/queries";
import { requireAnyCapability } from "@/lib/auth/require-capability";

export default async function ApprovalsPage() {
  await requireAnyCapability(["request:approve"]);
  const requests = await getApprovalWorkbench();
  const selected = requests.find((request) => request.lines.length > 0);
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
      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Borrower</th>
                <th>Purpose</th>
                <th>Period</th>
                <th>Capacity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const conflict = request.lines.some(
                  (line) => line.availableQuantity < line.requestedQuantity
                );
                return (
                  <tr key={request.requestId}>
                    <td data-label="Request">
                      <span className="data-id">{request.requestId.slice(0, 8).toUpperCase()}</span>
                    </td>
                    <td data-label="Borrower">{request.borrower}</td>
                    <td data-label="Purpose">{request.purpose}</td>
                    <td data-label="Period">{request.period}</td>
                    <td data-label="Capacity">
                      <StatusBadge tone={conflict ? "warning" : "success"}>
                        {conflict ? "Conflict" : "Available"}
                      </StatusBadge>
                    </td>
                    <td data-label="Action">
                      <a
                        className="button button-secondary compact-button"
                        href="#decision-workbench"
                      >
                        <ShieldCheck size={16} aria-hidden="true" />
                        Review
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {selected ? (
        <div className="detail-grid" id="decision-workbench">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>{selected.requestId.slice(0, 8).toUpperCase()} · Request lines</h2>
                <p>
                  {selected.borrower} · {selected.membershipStatus} member ·{" "}
                  {selected.borrowerIdentifier}
                </p>
              </div>
            </div>
            <ul className="record-list">
              {selected.lines.map((line) => (
                <li key={line.lineId}>
                  <div>
                    <h3>
                      {line.itemName} ×{line.requestedQuantity}
                    </h3>
                    <p>{line.availableQuantity} available for the requested range</p>
                  </div>
                  <StatusBadge
                    tone={line.availableQuantity >= line.requestedQuantity ? "success" : "warning"}
                  >
                    {line.availableQuantity >= line.requestedQuantity
                      ? `Can approve ${line.requestedQuantity}`
                      : "Review conflict"}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </div>
          <OperationForm
            operation="decision"
            target={{
              requestId: selected.requestId,
              decisionLines: selected.lines.map((line) => ({
                lineId: line.lineId,
                itemName: line.itemName,
                quantity: line.requestedQuantity
              }))
            }}
          />
        </div>
      ) : (
        <section className="empty-state">
          <div>
            <ShieldCheck size={36} aria-hidden="true" />
            <h2>No requests await approval</h2>
            <p>Submitted requests will appear here in first-submitted order.</p>
          </div>
        </section>
      )}
    </AppShell>
  );
}
