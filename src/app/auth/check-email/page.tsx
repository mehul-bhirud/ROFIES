import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, MailCheck } from "lucide-react";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({
  searchParams
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  const recovery = intent === "recovery";
  const Icon = recovery ? KeyRound : MailCheck;
  return (
    <main className="state-page auth-state-page" id="main-content">
      <section className="state-panel" aria-labelledby="check-email-title">
        <Icon size={38} aria-hidden="true" />
        <p className="eyebrow">
          {recovery ? "Manual recovery requested" : "Email sent when available"}
        </p>
        <h1 id="check-email-title">
          {recovery
            ? "Your reset request is with the club team."
            : "Check your institutional inbox."}
        </h1>
        <p>
          {recovery
            ? "If an account can use that address, an administrator will verify the request and share a temporary password through an approved manual channel."
            : "If that address can be registered, a confirmation message will arrive shortly."}
        </p>
        <p>
          {recovery
            ? "For your protection, existing passwords are never visible to administrators."
            : "Links expire for your protection. Check spam, then request a fresh link if needed."}
        </p>
        <div className="state-actions">
          <Link href="/auth/sign-in" className="button button-primary">
            Return to sign in
          </Link>
          <Link
            href={recovery ? "/auth/forgot-password" : "/auth/sign-up"}
            className="button button-secondary"
          >
            Try again
          </Link>
        </div>
      </section>
    </main>
  );
}
