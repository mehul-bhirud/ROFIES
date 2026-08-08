"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Send } from "lucide-react";

export function RequestForm({
  catalogItemId,
  available
}: {
  catalogItemId: string;
  available: number;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ state: "success" | "error"; message: string } | null>(
    null
  );

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(null);
      const start = new Date(String(formData.get("start")));
      const end = new Date(String(formData.get("end")));
      try {
        const response = await fetch("/api/commands/request", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            purpose: formData.get("purpose"),
            projectName: formData.get("projectName") || undefined,
            teamMembers: String(formData.get("teamMembers") ?? "")
              .split(/[\n,]/)
              .map((name) => name.trim())
              .filter(Boolean),
            requestedStart: start.toISOString(),
            requestedEnd: end.toISOString(),
            lines: [{ catalogItemId, quantity: Number(formData.get("quantity")) }]
          })
        });
        const body = (await response.json()) as { message?: string; referenceId?: string };
        setResult(
          response.ok
            ? { state: "success", message: "Request submitted for review." }
            : {
                state: "error",
                message:
                  body.message ?? `Request failed. Reference ${body.referenceId ?? "unavailable"}.`
              }
        );
      } catch {
        setResult({
          state: "error",
          message: "Network unavailable. Nothing was submitted; retry when connected."
        });
      }
    });
  }

  return (
    <form className="request-panel" action={submit}>
      <h2>Request this item</h2>
      <p>
        {available} available now. Availability is rechecked when staff approve and hand over
        equipment.
      </p>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="1"
            max={Math.max(1, Math.min(available, 50))}
            defaultValue="1"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="projectName">Project or event</label>
          <input
            id="projectName"
            name="projectName"
            maxLength={160}
            placeholder="e.g. Autonomy Sprint"
          />
        </div>
        <div className="form-field">
          <label htmlFor="start">Start</label>
          <input id="start" name="start" type="datetime-local" required />
        </div>
        <div className="form-field">
          <label htmlFor="end">End</label>
          <input id="end" name="end" type="datetime-local" required />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="teamMembers">
          Team members <span className="optional">optional</span>
        </label>
        <input
          id="teamMembers"
          name="teamMembers"
          maxLength={1000}
          placeholder="Names separated by commas"
        />
        <span className="helper">Team context does not transfer borrower responsibility.</span>
      </div>
      <div className="form-field">
        <label htmlFor="purpose">Purpose</label>
        <textarea
          id="purpose"
          name="purpose"
          minLength={3}
          maxLength={1000}
          placeholder="What are you building, testing, or repairing?"
          required
        />
        <span className="helper">One approved member remains the borrower of record.</span>
      </div>
      <button className="button button-primary" disabled={pending || available < 1} type="submit">
        {pending ? (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        ) : (
          <Send size={18} aria-hidden="true" />
        )}
        {pending ? "Submitting…" : "Submit request"}
      </button>
      {result ? (
        <div className="command-result" data-state={result.state} role="status">
          {result.message}
        </div>
      ) : null}
    </form>
  );
}
