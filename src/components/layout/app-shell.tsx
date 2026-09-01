import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronDown, FlaskConical, LogOut, UserRound } from "lucide-react";
import type { PropsWithChildren } from "react";
import { Navigation } from "@/components/layout/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { getAccountContext } from "@/lib/operations/queries";

async function signOutFromShell() {
  "use server";
  const result = await signOutAction(new FormData());
  redirect(result.ok ? "/auth/sign-in" : "/auth/error?code=sign_out_failed");
}

export async function AppShell({
  mode,
  children
}: PropsWithChildren<{ mode: "member" | "staff" }>) {
  const staff = mode === "staff";
  const account = await getAccountContext(mode);
  const canSwitchWorkspace = [
    "System administrator",
    "Inventory manager",
    "Request approver",
    "Staff operator"
  ].includes(account.roleLabel);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <Link href={staff ? "/admin" : "/"} className="brand" aria-label="R.O.F.I.E.S home">
          <span className="brand-mark">
            <FlaskConical aria-hidden="true" size={22} />
          </span>
          <span>
            <strong>R.O.F.I.E.S</strong>
            <small>Equipment manager</small>
          </span>
        </Link>
        <div className="workspace-label">
          {staff ? "Staff workspace" : "Member workspace"}
          {canSwitchWorkspace ? (
            <Link href={staff ? "/" : "/admin"} className="workspace-switcher">
              Switch to {staff ? "Member" : "Staff"} workspace &rarr;
            </Link>
          ) : null}
        </div>
        <Navigation mode={mode} />
        <div className="sidebar-foot">
          <span className="system-pulse" aria-hidden="true" />
          <span>
            <strong>Local system healthy</strong>
            <small>Last checked just now</small>
          </span>
        </div>
      </aside>
      <div className="app-column">
        <header className="topbar">
          <Link
            href={staff ? "/admin" : "/"}
            className="mobile-brand"
            aria-label="R.O.F.I.E.S home"
          >
            ROF<span>/</span>IES
          </Link>
          <div className="environment-chip">{account.environmentLabel}</div>
          <div className="topbar-actions">
            <Link
              className="icon-button"
              href="/notifications"
              aria-label={`Notifications, ${account.unreadNotifications} unread`}
            >
              <Bell size={20} aria-hidden="true" />
              {account.unreadNotifications ? <span className="notification-dot" /> : null}
            </Link>
            <details className="profile-menu">
              <summary
                className="profile-button"
                role="button"
                aria-label={`Account menu for ${account.displayName}`}
              >
                <span className="avatar">{account.initials}</span>
                <span className="profile-copy">
                  <strong>{account.displayName}</strong>
                  <small>{account.roleLabel}</small>
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="profile-menu-panel">
                <Link
                  className="profile-menu-item"
                  href="/profile"
                  aria-label={`View profile for ${account.displayName}`}
                >
                  <UserRound size={17} aria-hidden="true" />
                  <span>View profile</span>
                </Link>
                <form action={signOutFromShell}>
                  <button className="profile-menu-item profile-menu-danger" type="submit">
                    <LogOut size={17} aria-hidden="true" />
                    <span>Sign out</span>
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <div className="mobile-navigation">
        <Navigation mode={mode} />
      </div>
    </div>
  );
}
