"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { CheckCircle2, FileImage, LoaderCircle, RotateCcw, XCircle } from "lucide-react";
import type { MemberApplicationRecord } from "@/lib/operations/queries";

type Decision = "approved" | "changes_requested" | "rejected";
type ResultState = { state: "success" | "error"; message: string } | null;

export function MemberReviewCard({ application }: { application: MemberApplicationRecord }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ResultState>(null);
  const imageUrl = `/api/member-application/id-document?applicationId=${encodeURIComponent(application.applicationId)}`;

  function decide(formData: FormData, decision: Decision) {
    startTransition(async () => {
      setResult(null);
      const idempotencyKey = crypto.randomUUID();
      try {
        const response = await fetch("/api/commands/memberDecision", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({
            applicationId: application.applicationId,
            decision,
            reason: formData.get("reason"),
            idempotencyKey
          })
        });
        const body = (await response.json()) as { message?: string; referenceId?: string };
        setResult(
          response.ok
            ? {
                state: "success",
                message: `${decision === "approved" ? "Verify and activate member" : "Decision"} committed and audit event recorded.`
              }
            : {
                state: "error",
                message:
                  body.message ?? `Decision failed. Reference ${body.referenceId ?? "unknown"}.`
              }
        );
      } catch {
        setResult({
          state: "error",
          message: "Network unavailable. No membership decision was recorded."
        });
      }
    });
  }

  return (
    <article className="member-review-card">
      <div className="member-review-document">
        <Image
          src={imageUrl}
          alt={`Processed college ID for ${application.applicantName}`}
          width={720}
          height={450}
          loading="eager"
          unoptimized
        />
      </div>
      <div className="member-review-body">
        <div className="member-review-topline">
          <span className="data-id">{application.applicationId.slice(0, 8).toUpperCase()}</span>
          <span>{application.state.replaceAll("_", " ")}</span>
        </div>
        <h2>{application.applicantName}</h2>
        <dl className="member-review-facts">
          <div>
            <dt>Student ID</dt>
            <dd>{application.studentIdentifier}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{application.department}</dd>
          </div>
          <div>
            <dt>Academic year</dt>
            <dd>{application.studyYear ? `Year ${application.studyYear}` : "Not recorded"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{application.institutionalEmail}</dd>
          </div>
        </dl>
        <p className="member-review-submitted">Submitted {application.submittedAt}</p>
        {application.decisionReason ? (
          <p className="member-review-note">Prior feedback: {application.decisionReason}</p>
        ) : null}
        <form className="member-review-form">
          <label htmlFor={`reason-${application.applicationId}`}>
            Decision reason for {application.applicantName}
          </label>
          <textarea
            id={`reason-${application.applicationId}`}
            name="reason"
            minLength={3}
            maxLength={500}
            defaultValue="Identity verified at desk"
            required
          />
          <div className="member-review-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={pending}
              formAction={(formData) => decide(formData, "approved")}
            >
              {pending ? (
                <LoaderCircle className="spin" size={18} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={18} aria-hidden="true" />
              )}
              Verify and activate {application.applicantName}
            </button>
            <button
              className="button button-secondary"
              type="submit"
              disabled={pending}
              formAction={(formData) => decide(formData, "changes_requested")}
            >
              <RotateCcw size={18} aria-hidden="true" />
              Request changes
            </button>
            <button
              className="button button-danger"
              type="submit"
              disabled={pending}
              formAction={(formData) => decide(formData, "rejected")}
            >
              <XCircle size={18} aria-hidden="true" />
              Reject
            </button>
          </div>
        </form>
        {result ? (
          <div className="command-result" data-state={result.state} role="status">
            {result.message}
          </div>
        ) : null}
        <p className="member-review-privacy">
          <FileImage size={17} aria-hidden="true" />
          The preview is delivered through the audited private document route and is not a durable
          object URL.
        </p>
      </div>
    </article>
  );
}
