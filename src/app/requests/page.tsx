import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMyActivity } from "@/lib/operations/queries";

function tone(status: string): "signal" | "success" | "warning" | "neutral" {
  const normalized = status.toLowerCase();
  if (normalized.includes("ready") || normalized.includes("approved")) return "success";
  if (normalized.includes("return") || normalized.includes("overdue")) return "warning";
  if (normalized.includes("review") || normalized.includes("submit")) return "signal";
  return "neutral";
}

export default async function RequestsPage() {
  const records = await getMyActivity();
  return (
    <AppShell mode="member">
      <div className="page-head">
        <div>
          <p className="eyebrow">My activity</p>
          <h1>Requests, reservations, and loans</h1>
          <p>
            Only your own borrowing records appear here. Expected availability never reveals another
            borrower.
          </p>
        </div>
        <Link href="/" className="button button-primary">
          <Plus size={18} aria-hidden="true" />
          New request
        </Link>
      </div>
      <section className="panel" aria-labelledby="active-heading">
        <div className="panel-head">
          <div>
            <h2 id="active-heading">Active work</h2>
            <p>
              {records.length} record{records.length === 1 ? "" : "s"} need awareness or action.
            </p>
          </div>
        </div>
        {records.length ? (
          <ul className="record-list">
            {records.map((record) => (
              <li key={record.id}>
                <div>
                  <span className="data-id">{record.id}</span>
                  <h3>{record.title}</h3>
                  <p>{record.detail}</p>
                </div>
                <div className="record-side">
                  <StatusBadge tone={tone(record.status)}>{record.status}</StatusBadge>
                  <small>{record.updated}</small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <div>
              <h2>No borrowing activity yet</h2>
              <p>Browse the catalog to start an accountable equipment request.</p>
            </div>
          </div>
        )}
      </section>
      <div className="notice notice-warning">
        <CalendarClock size={19} aria-hidden="true" />
        <p>
          An approved reservation becomes issued only after an inventory manager confirms the
          in-person handover.
        </p>
      </div>
    </AppShell>
  );
}
