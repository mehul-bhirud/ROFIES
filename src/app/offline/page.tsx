import Link from "next/link";
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="state-page">
      <section className="state-panel">
        <WifiOff size={38} aria-hidden="true" />
        <p className="eyebrow">Read-only degraded mode</p>
        <h1>Inventory operations need a healthy connection</h1>
        <p>
          A clearly dated cached catalog may remain readable, but approval, handover, return, and
          stock changes are disabled until the authoritative database is healthy.
        </p>
        <Link className="button button-secondary" href="/">
          Open cached catalog
        </Link>
      </section>
    </main>
  );
}
