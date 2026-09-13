"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, X } from "lucide-react";
import type { ApprovalRecord } from "@/lib/operations/queries";

export function ApprovalDecisionModal({
  request,
  onClose
}: {
  request: ApprovalRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ state: "success" | "error"; message: string } | null>(
    null
  );

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (result?.state !== "success") return;
    const timeout = setTimeout(() => {
      router.refresh();
      onClose();
    }, 1200);
    return () => clearTimeout(timeout);
  }, [result, router, onClose]);

  function close() {
    if (!pending) onClose();
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(null);
      const idempotencyKey = crypto.randomUUID();
      const reason = formData.get("remarks");
      const payload = {
        requestId: request.requestId,
        reason,
        idempotencyKey,
        decisions: request.lines.map((line) => {
          const decision = String(formData.get(`decision-${line.lineId}`) ?? "approved");
          return {
            line_id: line.lineId,
            decision,
            approved_quantity:
              decision === "approved" || decision === "reduced"
                ? Number(formData.get(`quantity-${line.lineId}`))
                : 0,
            reason
          };
        })
      };
      try {
        const response = await fetch("/api/commands/decision", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(payload)
        });
        const body = (await response.json()) as { message?: string; referenceId?: string };
        setResult(
          response.ok
            ? { state: "success", message: "Decision committed and audit event recorded." }
            : {
                state: "error",
                message:
                  body.message ??
                  `Operation failed. Reference ${body.referenceId ?? "unavailable"}.`
              }
        );
      } catch {
        setResult({
          state: "error",
          message: "Network unavailable. The decision was not confirmed; retry."
        });
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="approval-dialog"
      aria-labelledby="approval-dialog-title"
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form className="command-card" action={submit}>
        <header className="approval-dialog-head">
          <div>
            <h2 id="approval-dialog-title">
              {request.requestId.slice(0, 8).toUpperCase()} · Request lines
            </h2>
            <p>
              {request.borrower} · {request.membershipStatus} member · {request.borrowerIdentifier}
            </p>
          </div>
          <button
            type="button"
            className="icon-button approval-dialog-close"
            onClick={close}
            aria-label="Close review"
            disabled={pending}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {request.lines.map((line) => (
          <fieldset className="decision-line" key={line.lineId}>
            <legend>
              {line.itemName} ×{line.requestedQuantity}
            </legend>
            <p className="helper">{line.availableQuantity} available for the requested range</p>
            <div className="form-field">
              <label htmlFor={`decision-${line.lineId}`}>Line decision</label>
              <select
                id={`decision-${line.lineId}`}
                name={`decision-${line.lineId}`}
                defaultValue="approved"
              >
                <option value="approved">Approve requested quantity</option>
                <option value="reduced">Approve reduced quantity</option>
                <option value="rejected">Reject line</option>
                <option value="changes_requested">Request changes</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor={`quantity-${line.lineId}`}>
                {request.lines.length === 1 ? "Quantity" : `Quantity for ${line.itemName}`}
              </label>
              <input
                id={`quantity-${line.lineId}`}
                name={`quantity-${line.lineId}`}
                type="number"
                min="1"
                max={line.requestedQuantity}
                defaultValue={line.requestedQuantity}
                required
              />
            </div>
          </fieldset>
        ))}

        <div className="form-field">
          <label htmlFor="approval-remarks">Decision reason</label>
          <textarea
            id="approval-remarks"
            name="remarks"
            minLength={3}
            maxLength={1000}
            defaultValue="Eligibility and requested period verified"
            required
          />
          <p className="helper">
            Required for every decision, including rejections and requested changes.
          </p>
        </div>

        <div className="approval-dialog-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={close}
            disabled={pending}
          >
            Cancel
          </button>
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending ? (
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={18} aria-hidden="true" />
            )}
            {pending ? "Committing…" : "Confirm decision"}
          </button>
        </div>
        {result ? (
          <div className="command-result" data-state={result.state} role="status">
            {result.message}
          </div>
        ) : null}
      </form>
    </dialog>
  );
}
