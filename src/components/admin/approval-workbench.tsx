"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApprovalDecisionModal } from "@/components/admin/approval-decision-modal";
import type { ApprovalRecord } from "@/lib/operations/queries";

export function ApprovalWorkbench({ requests }: { requests: ApprovalRecord[] }) {
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const openRequest = requests.find((request) => request.requestId === openRequestId) ?? null;

  if (requests.length === 0) {
    return (
      <section className="empty-state">
        <div>
          <ShieldCheck size={36} aria-hidden="true" />
          <h2>No requests await approval</h2>
          <p>Submitted requests will appear here in first-submitted order.</p>
        </div>
      </section>
    );
  }

  return (
    <>
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
                      <button
                        type="button"
                        className="button button-secondary compact-button"
                        onClick={() => setOpenRequestId(request.requestId)}
                      >
                        <ShieldCheck size={16} aria-hidden="true" />
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {openRequest ? (
        <ApprovalDecisionModal request={openRequest} onClose={() => setOpenRequestId(null)} />
      ) : null}
    </>
  );
}
