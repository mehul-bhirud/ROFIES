import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronDown, FlaskConical } from "lucide-react";
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
        <div className="workspace-label">{staff ? "Staff workspace" : "Member workspace"}</div>
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
            <form action={signOutFromShell}>
              <button className="profile-button" type="submit" aria-label="Sign out">
                <span className="avatar">{account.initials}</span>
                <span className="profile-copy">
                  <strong>{account.displayName}</strong>
                  <small>{account.roleLabel}</small>
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </form>
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
