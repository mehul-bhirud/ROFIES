import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { CircleAlert, Clock3, LockKeyhole } from "lucide-react";
import {
  applicationDestination,
  parseMemberApplicationStatus
} from "@/lib/auth/application-access";
import { signOutAction } from "@/lib/auth/actions";
import { validateInstitutionalEmail } from "@/lib/auth/identity";
import { getServerEnvironment } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Membership status" };

async function signOutApplicant() {
  "use server";
  const result = await signOutAction(new FormData());
  redirect(result.ok ? "/auth/sign-in" : "/auth/error?code=sign_out_failed");
}

export default async function PendingPage() {
  const environment = getServerEnvironment();
  if (environment.demoMode) return <PendingSurface state="pending_review" decisionReason={null} />;
  const client = await createSupabaseServerClient();
  if (!client) redirect("/auth/error?code=application_unavailable");
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) redirect("/auth/sign-in");
  const { data, error } = await client.schema("api").rpc("member_application_status");
  const status = error ? null : parseMemberApplicationStatus(data);
  if (!status) redirect("/auth/error?code=application_access");
  const destination = applicationDestination({
    emailConfirmed:
      Boolean(authData.user.email_confirmed_at) &&
      validateInstitutionalEmail(authData.user.email ?? "", environment.allowedEmailDomains),
    active: status?.membershipStatus === "active",
    applicationState: status.state
  });
  if (destination !== "/pending") redirect(destination);
  return <PendingSurface state={status.state} decisionReason={status.decisionReason} />;
}

function PendingSurface({
  state,
  decisionReason
}: {
  state: string;
  decisionReason: string | null;
}) {
  const rejected = state === "rejected";

  return (
    <main className="onboarding-page application-status-page" id="main-content">
      <section className="application-status-card" aria-labelledby="application-status-title">
        <div className="status-brand">
          <Image src="/rofies-mark.svg" width={44} height={44} alt="" priority />
          <span>R.O.F.I.E.S member verification</span>
        </div>
        <div className={`application-state-icon ${rejected ? "rejected" : "pending"}`}>
          {rejected ? (
            <CircleAlert size={30} aria-hidden="true" />
          ) : (
            <Clock3 size={30} aria-hidden="true" />
          )}
        </div>
        <p className="eyebrow">{rejected ? "Decision recorded" : "Review in progress"}</p>
        <h1 id="application-status-title">
          {rejected
            ? "Your application was not approved."
            : "Your application is with the club team."}
        </h1>
        <p className="lede">
          {rejected
            ? "Your institution account remains available for sign-in and recovery, but equipment access is not active."
            : "Membership stays inactive while an administrator verifies your profile and college ID. You cannot access the catalog or borrowing tools yet."}
        </p>
        {decisionReason ? (
          <div className="application-feedback status-feedback" role="status">
            <strong>Administrator feedback</strong>
            <p>{decisionReason}</p>
          </div>
        ) : null}
        <div className="status-privacy-note">
          <LockKeyhole size={20} aria-hidden="true" />
          <p>
            Your processed college-ID image is private. After a final approval or rejection, it is
            scheduled for deletion in 30 days.
          </p>
        </div>
        <form action={signOutApplicant}>
          <button className="button button-secondary" type="submit">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
