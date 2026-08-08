import { PackageOpen, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { OperationForm } from "@/components/forms/operation-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { getReturnQueue } from "@/lib/operations/queries";
import { requireAnyCapability } from "@/lib/auth/require-capability";

export default async function ReturnsPage() {
  await requireAnyCapability(["circulation:return", "inventory:manage"]);
  const [record] = await getReturnQueue();
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Circulation / Return</p>
          <h1>Record what actually came back</h1>
          <p>
            Partial quantities and mixed incoming condition keep the remaining obligation explicit.
          </p>
        </div>
      </div>
      {record ? (
        <>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>{record.loanId.slice(0, 8).toUpperCase()} · Active</h2>
                <p>
                  {record.borrower} · due {record.dueAt}
                </p>
              </div>
              <StatusBadge tone="warning">{record.unresolvedQuantity} unresolved</StatusBadge>
            </div>
            <ul className="record-list">
              <li>
                <div>
                  <h3>
                    {record.itemName} ×{record.unresolvedQuantity}
                  </h3>
                  <p>
                    Outgoing condition: {record.outgoingCondition} · {record.trackingMode}
                  </p>
                </div>
                <div className="record-side">
                  <PackageOpen size={20} aria-hidden="true" />
                  <small>Partial return allowed</small>
                </div>
              </li>
            </ul>
          </section>
          <div className="notice notice-warning">
            <Wrench size={19} aria-hidden="true" />
            <p>
              Repair-required and non-working quantities remain searchable but are excluded from
              availability immediately.
            </p>
          </div>
          <OperationForm
            operation="return"
            target={{
              loanId: record.loanId,
              loanLineId: record.loanLineId,
              quantity: record.unresolvedQuantity
            }}
          />
        </>
      ) : (
        <section className="empty-state">
          <div>
            <PackageOpen size={36} aria-hidden="true" />
            <h2>No equipment awaits return</h2>
            <p>Active returnable loans appear here with their unresolved quantities.</p>
          </div>
        </section>
      )}
    </AppShell>
  );
}
