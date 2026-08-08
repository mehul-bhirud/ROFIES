"use client";

import { useEffect } from "react";
import { RefreshCcw, TriangleAlert } from "lucide-react";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({ event: "ui.error_boundary", referenceId: error.digest ?? "local-boundary" })
    );
  }, [error.digest]);
  return (
    <main className="state-page">
      <section className="state-panel">
        <TriangleAlert size={38} aria-hidden="true" />
        <p className="eyebrow">Unexpected error</p>
        <h1>This view did not load</h1>
        <p>
          No inventory change is assumed. Retry the safe read, or share the reference with app
          support.
        </p>
        <p>
          <span className="code-reference">Reference {error.digest ?? "local-boundary"}</span>
        </p>
        <button className="button button-primary" type="button" onClick={reset}>
          <RefreshCcw size={18} aria-hidden="true" />
          Try again
        </button>
      </section>
    </main>
  );
}
