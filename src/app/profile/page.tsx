import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgeCheck, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getOwnProfile } from "@/lib/operations/queries";

export const metadata: Metadata = { title: "My profile" };

function fieldValue(value: string | number | null) {
  return value === null || value === "" ? "Not provided" : value;
}

export default async function ProfilePage() {
  const profile = await getOwnProfile();
  if (!profile) redirect("/auth/sign-in");
  const shellMode = profile.capabilities.length ? "staff" : "member";

  return (
    <AppShell mode={shellMode}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Account / Profile</p>
          <h1>My profile</h1>
          <p>Your signed-in account details and current R.O.F.I.E.S access state.</p>
        </div>
      </div>

      <section className="profile-page-grid" aria-label="Profile details">
        <div className="profile-summary panel">
          <div className="profile-summary-mark" aria-hidden="true">
            <UserRound size={42} />
          </div>
          <div>
            <h2>{profile.displayName}</h2>
            <p>{profile.institutionalEmail}</p>
          </div>
          <span className="status-badge status-success">
            {profile.active ? "Active account" : "Inactive account"}
          </span>
        </div>

        <div className="panel profile-facts">
          <div className="panel-head">
            <div>
              <h2>Student details</h2>
              <p>Identity fields currently stored for your profile.</p>
            </div>
            <BadgeCheck size={20} aria-hidden="true" />
          </div>
          <dl>
            <div>
              <dt>Student ID</dt>
              <dd>{fieldValue(profile.studentIdentifier)}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{fieldValue(profile.department)}</dd>
            </div>
            <div>
              <dt>Study year</dt>
              <dd>{fieldValue(profile.studyYear)}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{fieldValue(profile.phone)}</dd>
            </div>
          </dl>
        </div>

        <div className="panel profile-facts">
          <div className="panel-head">
            <div>
              <h2>Access</h2>
              <p>Membership and staff capabilities assigned to this account.</p>
            </div>
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <dl>
            <div>
              <dt>Membership</dt>
              <dd>{fieldValue(profile.membershipStatus?.replaceAll("_", " ") ?? null)}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{fieldValue(profile.joinedAt)}</dd>
            </div>
            <div>
              <dt>Last sign-in</dt>
              <dd>{fieldValue(profile.lastAuthenticatedAt)}</dd>
            </div>
          </dl>
          <div className="capability-list" aria-label="Staff capabilities">
            {profile.capabilities.length ? (
              profile.capabilities.map((capability) => (
                <span className="tag" key={capability}>
                  {capability.replaceAll(":", " ")}
                </span>
              ))
            ) : (
              <span className="tag">Member access</span>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
