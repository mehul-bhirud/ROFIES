"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";

type Operation = "handover" | "return";
type OperationTarget = {
  reservationId?: string;
  loanId?: string;
  loanLineId?: string;
  quantity?: number;
};

const config = {
  handover: {
    title: "Confirm physical handover",
    action: "Confirm handover",
    note: "Verify the borrower in person before confirming."
  },
  return: {
    title: "Confirm incoming equipment",
    action: "Confirm return",
    note: "Record the actual incoming condition; repair-required stock is routed automatically."
  }
};

export function OperationForm({
  operation,
  target
}: {
  operation: Operation;
  target?: OperationTarget;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ state: "success" | "error"; message: string } | null>(
    null
  );
  const copy = config[operation];

  function submit(formData: FormData) {
    startTransition(async () => {
      setResult(null);
      const idempotencyKey = crypto.randomUUID();
      const payload =
        operation === "handover"
          ? {
              reservationId: target?.reservationId ?? "00000000-0000-0000-0000-000000000501",
              dueAt: new Date(String(formData.get("dueAt"))).toISOString(),
              remarks: formData.get("remarks"),
              idempotencyKey
            }
          : {
              loanId: target?.loanId ?? "00000000-0000-0000-0000-000000000601",
              remarks: formData.get("remarks"),
              idempotencyKey,
              lines: [
                {
                  loan_line_id: target?.loanLineId ?? "00000000-0000-0000-0000-000000000611",
                  quantity: Number(formData.get("quantity")),
                  condition: formData.get("condition")
                }
              ]
            };
      try {
        const response = await fetch(`/api/commands/${operation}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(payload)
        });
        const body = (await response.json()) as { message?: string; referenceId?: string };
        setResult(
          response.ok
            ? { state: "success", message: `${copy.action} committed and audit event recorded.` }
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
          message:
            "Network unavailable. The operation was not confirmed; retry with the same physical state."
        });
      }
    });
  }

  return (
    <form className="command-card" action={submit}>
      <header>
        <h2>{copy.title}</h2>
        <p>{copy.note}</p>
      </header>
      {operation === "return" ? (
        <div className="form-field">
          <label htmlFor="return-quantity">Quantity</label>
          <input
            id="return-quantity"
            name="quantity"
            type="number"
            min="1"
            max={target?.quantity ?? 10}
            defaultValue={Math.min(target?.quantity ?? 1, 1)}
            required
          />
        </div>
      ) : null}
      {operation === "handover" ? (
        <div className="form-field">
          <label htmlFor="dueAt">Due date and time</label>
          <input id="dueAt" name="dueAt" type="datetime-local" required />
        </div>
      ) : null}
      {operation === "return" ? (
        <div className="form-field">
          <label htmlFor="condition">Incoming condition</label>
          <select id="condition" name="condition" defaultValue="perfect">
            <option value="perfect">Perfect</option>
            <option value="minor_damage">Minor damage but usable</option>
            <option value="repair_required">Repair required</option>
            <option value="not_working">Not working / showpiece</option>
          </select>
        </div>
      ) : null}
      <div className="form-field">
        <label htmlFor={`${operation}-remarks`}>Confirmation remarks</label>
        <textarea
          id={`${operation}-remarks`}
          name="remarks"
          minLength={3}
          maxLength={1000}
          defaultValue="Identity and quantities checked in person"
          required
        />
      </div>
      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={18} aria-hidden="true" />
        )}
        {pending ? "Committing…" : copy.action}
      </button>
      {result ? (
        <div className="command-result" data-state={result.state} role="status">
          {result.message}
        </div>
      ) : null}
    </form>
  );
}
