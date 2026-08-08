import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({
  searchParams
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  const recovery = intent === "recovery";
  return (
    <main className="state-page auth-state-page" id="main-content">
      <section className="state-panel" aria-labelledby="check-email-title">
        <MailCheck size={38} aria-hidden="true" />
        <p className="eyebrow">Email sent when available</p>
        <h1 id="check-email-title">Check your institutional inbox.</h1>
        <p>
          {recovery
            ? "If an account can use that address, a password reset message will arrive shortly."
            : "If that address can be registered, a confirmation message will arrive shortly."}
        </p>
        <p>Links expire for your protection. Check spam, then request a fresh link if needed.</p>
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
