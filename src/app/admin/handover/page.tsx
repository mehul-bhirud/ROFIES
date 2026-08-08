import { IdCard, PackageCheck, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { OperationForm } from "@/components/forms/operation-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { getHandoverQueue } from "@/lib/operations/queries";
import { requireAnyCapability } from "@/lib/auth/require-capability";

export default async function HandoverPage() {
  await requireAnyCapability(["circulation:handover", "inventory:manage"]);
  const [record] = await getHandoverQueue();
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Circulation / Handover</p>
          <h1>Put custody in the right hands</h1>
          <p>
            This phone-first screen refreshes membership, overdue state, reservation, and on-hand
            stock before commit.
          </p>
        </div>
      </div>
      {record ? (
        <>
          <div className="operation-card-grid">
            <article className="operation-card">
              <p className="eyebrow">Borrower check</p>
              <h2>{record.borrower}</h2>
              <p>
                {record.borrowerIdentifier} · {record.membershipStatus} member
              </p>
              <footer>
                <StatusBadge tone="success">Eligible</StatusBadge>
                <span>
                  <IdCard size={17} aria-hidden="true" /> Verify in person
                </span>
              </footer>
            </article>
            <article className="operation-card">
              <p className="eyebrow">Reservation</p>
              <h2>{record.reservationId.slice(0, 8).toUpperCase()} · Ready for pickup</h2>
              <p>
                {record.itemName} ×{record.quantity} · {record.purpose}
              </p>
              <footer>
                <StatusBadge tone="success">{record.quantity} reserved</StatusBadge>
                <span>
                  <PackageCheck size={17} aria-hidden="true" /> Pickup by {record.pickupDeadline}
                </span>
              </footer>
            </article>
          </div>
          <div className="notice notice-danger">
            <ShieldAlert size={19} aria-hidden="true" />
            <p>
              Do not confirm until identity and physical quantities are checked. A failed database
              transaction changes nothing and must not be represented as success.
            </p>
          </div>
          <OperationForm operation="handover" target={{ reservationId: record.reservationId }} />
        </>
      ) : (
        <section className="empty-state">
          <div>
            <PackageCheck size={36} aria-hidden="true" />
            <h2>No reservations await handover</h2>
            <p>The queue refreshes when an approved reservation becomes ready for pickup.</p>
          </div>
        </section>
      )}
    </AppShell>
  );
}
