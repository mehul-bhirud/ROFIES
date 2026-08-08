import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="state-page">
      <section className="state-panel">
        <SearchX size={38} aria-hidden="true" />
        <p className="eyebrow">Resource unavailable</p>
        <h1>That record is not available</h1>
        <p>
          It may not exist, may be archived, or may not be visible to your account. No
          inaccessible-record detail is disclosed.
        </p>
        <Link className="button button-primary" href="/">
          Return to catalog
        </Link>
      </section>
    </main>
  );
}
