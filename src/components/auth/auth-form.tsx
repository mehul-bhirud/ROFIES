"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
  type AuthActionState
} from "@/lib/auth/actions";
import { PASSWORD_REQUIREMENTS } from "@/lib/auth/schemas";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "update-password";
type AuthAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;

const initialState: AuthActionState = { ok: false, message: "" };

const copy = {
  "sign-in": {
    eyebrow: "Account access",
    title: "Return to the equipment bench.",
    description: "Use your institutional email and password.",
    submit: "Sign in"
  },
  "sign-up": {
    eyebrow: "Student registration",
    title: "Start with your institution identity.",
    description: "We’ll email a confirmation link before profile and college-ID review.",
    submit: "Create account"
  },
  "forgot-password": {
    eyebrow: "Account recovery",
    title: "Request admin password reset.",
    description: "Enter your institutional email. A club administrator will review the request.",
    submit: "Request password reset"
  },
  "update-password": {
    eyebrow: "Choose a new password",
    title: "Set a fresh account password.",
    description: "Use a password you do not reuse on another service.",
    submit: "Update password"
  }
} as const;

function actionFor(mode: AuthMode): AuthAction {
  if (mode === "sign-up") return signUpAction as AuthAction;
  if (mode === "forgot-password") return requestPasswordResetAction as AuthAction;
  if (mode === "update-password") return updatePasswordAction as AuthAction;
  return signInAction as AuthAction;
}

function destinationFor(mode: AuthMode) {
  if (mode === "sign-up") return "/auth/check-email?intent=signup";
  if (mode === "forgot-password") return "/auth/check-email?intent=recovery";
  if (mode === "update-password") return "/auth/sign-in?password=updated";
  return "/";
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary auth-submit" type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : null}
      {pending ? "Working…" : label}
    </button>
  );
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  error,
  describedBy
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  error?: string[] | undefined;
  describedBy?: string | undefined;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          maxLength={128}
          aria-invalid={Boolean(error?.length)}
          aria-describedby={[describedBy, error?.length ? errorId : undefined]
            .filter(Boolean)
            .join(" ")}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
        </button>
      </div>
      {error?.length ? (
        <p className="auth-field-error" id={errorId}>
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const content = copy[mode];
  const [state, formAction] = useActionState(actionFor(mode), initialState);
  const fieldErrors = state.fieldErrors ?? {};
  const needsEmail = mode !== "update-password";
  const needsPassword = mode !== "forgot-password";
  const usesNewPassword = mode === "sign-up" || mode === "update-password";

  useEffect(() => {
    if (!state.ok) return;
    router.replace(destinationFor(mode));
    router.refresh();
  }, [mode, router, state.ok]);

  return (
    <main className="auth-page" id="main-content">
      <section className="auth-shell" aria-labelledby="auth-title">
        <aside className="auth-identity" aria-label="R.O.F.I.E.S equipment access">
          <div className="auth-brand">
            <Image src="/rofies-mark.svg" width={44} height={44} alt="" priority />
            <div>
              <strong>R.O.F.I.E.S</strong>
              <span>Equipment manager</span>
            </div>
          </div>
          <div className="auth-instrument" aria-hidden="true">
            <span>IDENTITY / ACCESS</span>
            <i />
            <small>Institution account required</small>
          </div>
          <p>
            Confirmed students complete profile and college-ID review before equipment access is
            activated.
          </p>
        </aside>

        <div className="auth-workspace">
          <header className="auth-heading">
            <p className="eyebrow">{content.eyebrow}</p>
            <h1 id="auth-title">{content.title}</h1>
            <p>{content.description}</p>
          </header>

          {!state.ok && state.message ? (
            <div className="auth-error-summary" role="alert" tabIndex={-1}>
              <strong>{state.message}</strong>
              {Object.keys(fieldErrors).length ? (
                <ul>
                  {Object.entries(fieldErrors).map(([field, errors]) => (
                    <li key={field}>
                      <a href={`#auth-${field}`}>{errors[0]}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {state.ok ? (
            <p className="auth-success" role="status">
              {state.message}
            </p>
          ) : null}

          <form action={formAction} className="auth-form" noValidate>
            {needsEmail ? (
              <div className="auth-field">
                <label htmlFor="auth-email">Institutional email</label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  autoFocus
                  aria-invalid={Boolean(fieldErrors.email?.length)}
                  aria-describedby={fieldErrors.email?.length ? "auth-email-error" : undefined}
                />
                {fieldErrors.email?.length ? (
                  <p className="auth-field-error" id="auth-email-error">
                    {fieldErrors.email[0]}
                  </p>
                ) : null}
              </div>
            ) : null}

            {needsPassword ? (
              <PasswordField
                id="auth-password"
                name="password"
                label={
                  usesNewPassword
                    ? mode === "sign-up"
                      ? "Create password"
                      : "New password"
                    : "Password"
                }
                autoComplete={usesNewPassword ? "new-password" : "current-password"}
                error={fieldErrors.password}
                describedBy={usesNewPassword ? "password-requirements" : undefined}
              />
            ) : null}

            {usesNewPassword ? (
              <p className="auth-helper" id="password-requirements">
                {PASSWORD_REQUIREMENTS}
              </p>
            ) : null}

            {mode === "update-password" ? (
              <PasswordField
                id="auth-confirmPassword"
                name="confirmPassword"
                label="Confirm new password"
                autoComplete="new-password"
                error={fieldErrors.confirmPassword}
              />
            ) : null}

            {mode === "sign-in" ? (
              <div className="auth-inline-link">
                <Link href="/auth/forgot-password">Forgot password?</Link>
              </div>
            ) : null}
            <SubmitButton label={content.submit} />
          </form>

          <footer className="auth-footer">
            {mode === "sign-in" ? (
              <p>
                New to R.O.F.I.E.S? <Link href="/auth/sign-up">Create an account</Link>
              </p>
            ) : null}
            {mode === "sign-up" || mode === "forgot-password" ? (
              <p>
                Already have an account? <Link href="/auth/sign-in">Sign in instead</Link>
              </p>
            ) : null}
            {mode === "update-password" ? (
              <p>
                Link expired? <Link href="/auth/forgot-password">Request another reset</Link>
              </p>
            ) : null}
          </footer>
        </div>
      </section>
    </main>
  );
}
