import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default async function AuthErrorPage({
  searchParams
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const profileUnavailable = code === "profile_unavailable";
  const serviceUnavailable = code === "service_unavailable";
  const title = profileUnavailable
    ? "Account setup needs another attempt"
    : serviceUnavailable
      ? "Account service is temporarily unavailable"
      : "This link could not be used";
  const message = profileUnavailable
    ? "Some account setup may already be saved. Sign in again to safely retry and finish setup."
    : serviceUnavailable
      ? "The account service did not start this request. Wait a moment, then try again."
      : "The link may be incomplete, expired, or already used. Request a fresh link to continue.";
  return (
    <main className="state-page auth-state-page" id="main-content">
      <section className="state-panel" aria-labelledby="auth-error-title">
        <ShieldAlert size={38} aria-hidden="true" />
        <p className="eyebrow">Account access</p>
        <h1 id="auth-error-title">{title}</h1>
        <p>{message}</p>
        <Link href="/auth/sign-in" className="button button-primary">
          Return to sign in
        </Link>
        {!serviceUnavailable && !profileUnavailable ? (
          <Link href="/auth/forgot-password" className="button button-secondary">
            Request a reset link
          </Link>
        ) : null}
      </section>
    </main>
  );
}
