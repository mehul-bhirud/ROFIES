import { Activity, Archive, Bell, Database, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAnyCapability } from "@/lib/auth/require-capability";
import { getSystemHealth } from "@/lib/operations/queries";

export default async function OperationsPage() {
  await requireAnyCapability(["system:manage", "inventory:manage"]);
  const health = await getSystemHealth();
  const checks = health
    ? [
        {
          icon: Database,
          name: "Database",
          status: "Connected",
          detail: `Health view checked ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(health.checkedAt))}`,
          tone: "success" as const
        },
        {
          icon: Bell,
          name: "In-app notifications",
          status: `${health.unreadNotifications} unread`,
          detail: `${health.archivableNotifications} read notifications eligible for archive; oldest lag ${health.archivedNotificationLagSeconds} s`,
          tone: health.archivableNotifications > 100 ? ("warning" as const) : ("signal" as const)
        },
        {
          icon: Archive,
          name: "Sensitive retention",
          status: `${health.retentionFailures} overdue`,
          detail: `${health.deletionFailures24h} deletion failures in 24 h; oldest overdue ${health.oldestOverdueIdDeletionSeconds} s`,
          tone:
            health.retentionFailures || health.deletionFailures24h
              ? ("warning" as const)
              : ("success" as const)
        },
        {
          icon: ShieldCheck,
          name: "Critical notice",
          status: health.criticalNoticeActive ? "Active" : "None",
          detail: "No provider keys or internal errors are exposed here",
          tone: health.criticalNoticeActive ? ("warning" as const) : ("success" as const)
        },
        {
          icon: Activity,
          name: "Reconciliation",
          status: `${health.unresolvedReconciliations} pending`,
          detail: `${health.overdueLines} overdue loan lines`,
          tone: health.unresolvedReconciliations ? ("warning" as const) : ("success" as const)
        }
      ]
    : [
        {
          icon: ShieldCheck,
          name: "System health",
          status: "Restricted",
          detail:
            "This account can reconcile inventory but cannot view system-wide delivery health.",
          tone: "neutral" as const
        }
      ];
  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Administration / System health</p>
          <h1>Operational truth without provider secrets</h1>
          <p>
            Health, retention, integrity, backup, and reconciliation signals are visible only to
            authorized administrators.
          </p>
        </div>
      </div>
      <div className="operation-card-grid">
        {checks.map(({ icon: Icon, ...check }) => (
          <article className="operation-card" key={check.name}>
            <Icon size={22} aria-hidden="true" />
            <h2>{check.name}</h2>
            <p>{check.detail}</p>
            <footer>
              <StatusBadge tone={check.tone}>{check.status}</StatusBadge>
              <span>Updated now</span>
            </footer>
          </article>
        ))}
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Recovery posture</h2>
            <p>Local exercise evidence; production provider setup remains external.</p>
          </div>
        </div>
        <ul className="record-list">
          <li>
            <div>
              <h3>Database restore exercise</h3>
              <p>Clean migration + seed + 26 integrity/RLS tests</p>
            </div>
            <StatusBadge tone="success">Verified locally</StatusBadge>
          </li>
          <li>
            <div>
              <h3>Object storage backup</h3>
              <p>
                Requires institution storage retention and provider configuration; last successful
                cleanup {health?.lastSuccessfulCleanupAt ?? "not yet recorded"}
              </p>
            </div>
            <StatusBadge tone="warning">External setup</StatusBadge>
          </li>
          <li>
            <div>
              <h3>Maintenance mode</h3>
              <p>Safe reads continue; protected mutations fail closed</p>
            </div>
            <StatusBadge tone="success">Inactive</StatusBadge>
          </li>
        </ul>
      </section>
    </AppShell>
  );
}
