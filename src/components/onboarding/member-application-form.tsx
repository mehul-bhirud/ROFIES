"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FileImage, LoaderCircle, LockKeyhole } from "lucide-react";

type Props = {
  mode: "initial" | "changes_requested";
  decisionReason?: string | null;
};

type ApiResponse = {
  status?: string;
  message?: string;
  referenceId?: string;
};

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxCollegeIdInputBytes = 8 * 1024 * 1024;

export function MemberApplicationForm({ mode, decisionReason }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fileControl = form.elements.namedItem("collegeId");
    const collegeId =
      fileControl instanceof HTMLInputElement ? (fileControl.files?.item(0) ?? null) : null;
    const formData = new FormData(form);
    if (!collegeId || collegeId.size === 0) {
      setError("Choose a college-ID image before sending your application.");
      return;
    }
    if (
      collegeId.size > maxCollegeIdInputBytes ||
      (collegeId.type !== "" && !acceptedImageTypes.has(collegeId.type))
    ) {
      setError("Use one JPEG, PNG, or WebP image up to 8 MB.");
      return;
    }
    formData.set("collegeId", collegeId);

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/member-application", {
        method: "POST",
        body: formData
      });
      const result = (await response.json()) as ApiResponse;
      if (!response.ok || result.status !== "pending_review") {
        const reference = result.referenceId ? ` Reference: ${result.referenceId}.` : "";
        setError(`${result.message ?? "Application could not be submitted."}${reference}`);
        return;
      }
      router.replace("/pending");
      router.refresh();
    } catch {
      setError("Application service is unavailable. Keep this page open and retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="onboarding-workspace">
      <header className="onboarding-heading">
        <p className="eyebrow">
          {mode === "changes_requested" ? "Application update" : "Membership verification"}
        </p>
        <h1 id="application-title">
          {mode === "changes_requested"
            ? "Update your verification details."
            : "Complete your member profile."}
        </h1>
        <p>
          Your confirmed institution account stays separate from club membership until an
          administrator reviews these details.
        </p>
      </header>

      {mode === "changes_requested" ? (
        <div className="application-feedback" role="status">
          <strong>Administrator feedback</strong>
          <p>{decisionReason || "Review your details and upload a clearer college-ID image."}</p>
        </div>
      ) : null}

      {error ? (
        <div className="auth-error-summary" role="alert" tabIndex={-1}>
          {error}
        </div>
      ) : null}

      <form className="member-application-form" onSubmit={submit}>
        <fieldset disabled={pending}>
          <legend>Student details</legend>
          <div className="application-field-grid">
            <div className="auth-field">
              <label htmlFor="application-full-name">Full name</label>
              <input
                id="application-full-name"
                name="fullName"
                autoComplete="name"
                maxLength={120}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="application-student-id">Student ID</label>
              <input
                id="application-student-id"
                name="studentIdentifier"
                autoComplete="off"
                maxLength={80}
                required
              />
            </div>
            <div className="auth-field application-field-wide">
              <label htmlFor="application-department">Department</label>
              <input
                id="application-department"
                name="department"
                autoComplete="organization"
                maxLength={120}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="application-study-year">Academic year</label>
              <select id="application-study-year" name="studyYear" required defaultValue="">
                <option value="" disabled>
                  Select year
                </option>
                {Array.from({ length: 8 }, (_, index) => (
                  <option value={index + 1} key={index + 1}>
                    Year {index + 1}
                  </option>
                ))}
              </select>
            </div>
            <div className="auth-field">
              <label htmlFor="application-phone">Phone (optional)</label>
              <input
                id="application-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={24}
              />
            </div>
          </div>

          <div className="college-id-section">
            <div>
              <p className="application-section-label">College ID</p>
              <p id="college-id-requirements">
                Upload one clear JPEG, PNG, or WebP file up to 8 MB. Camera capture is not used.
              </p>
            </div>
            <label className="college-id-dropzone" htmlFor="application-college-id">
              <FileImage size={26} aria-hidden="true" />
              <span>
                <strong>College ID image</strong>
                <small>Choose a file from this device</small>
              </span>
              <input
                id="application-college-id"
                name="collegeId"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="College ID image"
                aria-describedby="college-id-requirements college-id-privacy"
                required
              />
            </label>
          </div>

          <div className="application-privacy" id="college-id-privacy">
            <LockKeyhole size={20} aria-hidden="true" />
            <p>
              <strong>Private verification file.</strong> The processed image is kept in protected
              storage for review and deleted 30 days after a final decision. Decision and audit
              records remain.
            </p>
          </div>

          <button className="button button-primary application-submit" type="submit">
            {pending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : null}
            {pending
              ? "Sending securely…"
              : mode === "changes_requested"
                ? "Resubmit for review"
                : "Send for review"}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
