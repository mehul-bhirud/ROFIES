import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  RotateCcw,
  UserRoundCheck
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { getStaffDashboard } from "@/lib/operations/queries";

export default async function AdminDashboardPage() {
  const { summary, approvals, activity } = await getStaffDashboard();
  const metrics = [
    {
      label: "Pending approval",
      value: summary.pendingRequests,
      note: "transaction-time capacity",
      icon: Clock3
    },
    {
      label: "Member review",
      value: summary.pendingMemberApplications,
      note: "college-ID verification",
      icon: UserRoundCheck
    },
    {
      label: "Ready pickup",
      value: summary.readyPickups,
      note: "identity check required",
      icon: CheckCircle2
    },
    {
      label: "Overdue loans",
      value: summary.overdueLoans,
      note: "returnable lines",
      icon: AlertTriangle
    },
    {
      label: "Repair queue",
      value: summary.repairQueue,
      note: "excluded from availability",
      icon: RotateCcw
    }
  ];
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Operations / live queue</p>
          <h1>What needs a human today</h1>
          <p>
            Decisions, physical custody, and integrity exceptions are ordered by operational
            urgency.
          </p>
        </div>
        <div className="head-actions">
          <Link href="/admin/handover" className="button button-primary">
            Start handover <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/admin/inventory" className="button button-secondary">
            <Boxes size={18} aria-hidden="true" />
            Inventory
          </Link>
        </div>
      </div>
      <section className="metric-grid" aria-label="Operational metrics">
        {metrics.map(({ label, value, note, icon: Icon }) => (
          <article className="metric-card" key={label}>
            <div className="metric-top">
              <span>{label}</span>
              <Icon size={18} aria-hidden="true" />
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <div className="work-grid">
        <section className="panel" aria-labelledby="approval-heading">
          <div className="panel-head">
            <div>
              <h2 id="approval-heading">Approval queue</h2>
              <p>Availability will be rechecked on decision.</p>
            </div>
            <Link href="/admin/approvals" className="text-link">
              Open queue
            </Link>
          </div>
          {approvals.length ? (
            <ul className="record-list">
              {approvals.slice(0, 5).map((request) => {
                const conflict = request.lines.some(
                  (line) => line.availableQuantity < line.requestedQuantity
                );
                return (
                  <li key={request.requestId}>
                    <div>
                      <span className="data-id">{request.requestId.slice(0, 8).toUpperCase()}</span>
                      <h3>{request.purpose}</h3>
                      <p>
                        {request.borrower} · {request.period} · {request.lines.length} line
                        {request.lines.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="record-side">
                      <StatusBadge tone={conflict ? "warning" : "signal"}>
                        {conflict ? "Conflict to review" : "Awaiting decision"}
                      </StatusBadge>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">No requests await approval.</p>
          )}
        </section>
        <section className="panel" aria-labelledby="activity-heading">
          <div className="panel-head">
            <div>
              <h2 id="activity-heading">Recent physical events</h2>
              <p>Immutable business events, newest first.</p>
            </div>
          </div>
          <ol className="activity-list">
            {activity.map((event) => (
              <li key={`${event.time}-${event.action}`}>
                <time>{event.time}</time>
                <strong>{event.action}</strong>
                <p>{event.detail}</p>
                <p>by {event.actor}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
