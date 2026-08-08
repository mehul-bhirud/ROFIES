import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Check, FileCheck2, ShieldCheck } from "lucide-react";
import {
  applicationDestination,
  parseMemberApplicationStatus
} from "@/lib/auth/application-access";
import { signOutAction } from "@/lib/auth/actions";
import { validateInstitutionalEmail } from "@/lib/auth/identity";
import { getServerEnvironment } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MemberApplicationForm } from "@/components/onboarding/member-application-form";

export const metadata: Metadata = { title: "Membership onboarding" };

async function signOutApplicant() {
  "use server";
  const result = await signOutAction(new FormData());
  redirect(result.ok ? "/auth/sign-in" : "/auth/error?code=sign_out_failed");
}

function OnboardingSurface({
  mode,
  decisionReason = null
}: {
  mode: "initial" | "changes_requested";
  decisionReason?: string | null;
}) {
  return (
    <main className="onboarding-page" id="main-content">
      <section className="onboarding-shell" aria-labelledby="application-title">
        <aside className="onboarding-rail" aria-label="Membership verification steps">
          <div className="auth-brand">
            <Image src="/rofies-mark.svg" width={44} height={44} alt="" priority />
            <div>
              <strong>R.O.F.I.E.S</strong>
              <span>Member verification</span>
            </div>
          </div>
          <div className="verification-signal" aria-hidden="true">
            <ShieldCheck size={30} />
            <span>IDENTITY CHECK / READY</span>
          </div>
          <ol className="verification-steps">
            <li className="complete">
              <Check size={17} aria-hidden="true" />
              <span>
                <strong>Institution email</strong>
                <small>Ownership confirmed</small>
              </span>
            </li>
            <li className="current">
              <FileCheck2 size={17} aria-hidden="true" />
              <span>
                <strong>Profile and college ID</strong>
                <small>Complete this step</small>
              </span>
            </li>
            <li>
              <span className="step-marker" aria-hidden="true" />
              <span>
                <strong>Administrator review</strong>
                <small>Membership stays inactive</small>
              </span>
            </li>
          </ol>
          <form action={signOutApplicant}>
            <button className="button rail-sign-out" type="submit">
              Sign out
            </button>
          </form>
        </aside>
        <MemberApplicationForm mode={mode} decisionReason={decisionReason} />
      </section>
    </main>
  );
}

export default async function OnboardingPage() {
  const environment = getServerEnvironment();
  if (environment.demoMode) return <OnboardingSurface mode="initial" />;
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
  if (destination !== "/onboarding") redirect(destination);

  return (
    <OnboardingSurface
      mode={status.state === "changes_requested" ? "changes_requested" : "initial"}
      decisionReason={status.decisionReason}
    />
  );
}
