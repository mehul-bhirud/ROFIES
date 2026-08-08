import { Bell } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMyNotifications } from "@/lib/operations/queries";

export default async function NotificationsPage() {
  const notifications = await getMyNotifications();
  return (
    <AppShell mode="member">
      <div className="page-head">
        <div>
          <p className="eyebrow">Notification center</p>
          <h1>Updates that change your next step</h1>
          <p>
            R.O.F.I.E.S keeps application-event notifications inside the app; this list is the
            authoritative notification view.
          </p>
        </div>
      </div>
      <section className="panel">
        {notifications.length ? (
          <ul className="record-list">
            {notifications.map((item) => (
              <li key={item.id}>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                </div>
                <div className="record-side">
                  <StatusBadge tone={item.unread ? "signal" : "neutral"}>
                    {item.unread ? "Unread" : "Read"}
                  </StatusBadge>
                  <small>{item.createdAt}</small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <div>
              <Bell size={36} aria-hidden="true" />
              <h2>No notifications</h2>
              <p>Request, reservation, return, and system updates will appear here.</p>
            </div>
          </div>
        )}
      </section>
      <div className="notice">
        <Bell size={19} aria-hidden="true" />
        <p>
          Supabase Auth may still send confirmation and recovery email, but request, reservation,
          loan, return, and application updates are in-app only.
        </p>
      </div>
    </AppShell>
  );
}
