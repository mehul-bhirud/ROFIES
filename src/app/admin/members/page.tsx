import type { Metadata } from "next";
import { ShieldCheck, UserRoundCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { MemberReviewCard } from "@/components/admin/member-review-card";
import { requireAnyCapability } from "@/lib/auth/require-capability";
import { getMemberApplicationQueue } from "@/lib/operations/queries";

export const metadata: Metadata = { title: "Member review" };

export default async function MemberReviewPage() {
  await requireAnyCapability(["membership:manage"]);
  const applications = await getMemberApplicationQueue();

  return (
    <AppShell mode="staff">
      <div className="page-head">
        <div>
          <p className="eyebrow">Administration / Member verification</p>
          <h1>Verify member applications</h1>
          <p>
            Review confirmed institutional accounts and processed college-ID images. Approval
            activates club membership in the same committed transaction.
          </p>
        </div>
      </div>
      <div className="notice notice-signal">
        <ShieldCheck size={19} aria-hidden="true" />
        <p>
          Every document preview and decision is audited. Requesting changes or rejecting an
          application requires a reason that the applicant can act on.
        </p>
      </div>
      {applications.length ? (
        <section className="member-review-list" aria-label="Pending member applications">
          {applications.map((application) => (
            <MemberReviewCard application={application} key={application.applicationId} />
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <div>
            <UserRoundCheck size={36} aria-hidden="true" />
            <h2>No member applications await review</h2>
            <p>Submitted college-ID verification requests appear here in received order.</p>
          </div>
        </section>
      )}
    </AppShell>
  );
}
