"use client";

import { useActionState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import {
  completeManualPasswordResetAction,
  type ManualPasswordResetActionState
} from "@/lib/auth/manual-password-reset-actions";
import type { PasswordResetRequestRecord } from "@/lib/operations/queries";

const initialState: ManualPasswordResetActionState = { ok: false, message: "" };

export function PasswordResetRequestCard({ request }: { request: PasswordResetRequestRecord }) {
  const [state, formAction, pending] = useActionState(
    completeManualPasswordResetAction,
    initialState
  );

  return (
    <article className="operation-card recovery-request-card">
      <KeyRound size={22} aria-hidden="true" />
      <p className="eyebrow">{request.status}</p>
      <h2>{request.institutionalEmail}</h2>
      <p>Requested {request.requestedAt}</p>
      <form action={formAction} className="recovery-request-form">
        <input type="hidden" name="requestId" value={request.id} />
        <label htmlFor={`reason-${request.id}`}>Verification note</label>
        <textarea
          id={`reason-${request.id}`}
          name="reason"
          minLength={3}
          maxLength={500}
          defaultValue="Identity verified manually before password reset"
          required
        />
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
          ) : (
            <KeyRound size={18} aria-hidden="true" />
          )}
          {pending ? "Generating..." : "Generate temporary password"}
        </button>
      </form>
      {state.message ? (
        <div className="command-result" data-state={state.ok ? "success" : "error"} role="status">
          <p>{state.message}</p>
          {state.temporaryPassword ? (
            <div className="temporary-password-box">
              <span>Temporary password</span>
              <code>{state.temporaryPassword}</code>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
