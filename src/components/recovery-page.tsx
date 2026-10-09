"use client";
import Link from "next/link";
import { Logo } from "./shared";
export function RecoveryPage({
  missing = false,
  retry,
}: {
  missing?: boolean;
  retry?: () => void;
}) {
  return (
    <main id="main-content" tabIndex={-1} className="entry">
      <section className="entry-card">
        <Logo large />
        <div className="entry-intro">
          <h1>
            {missing ? "We couldn't find that page." : "Something went wrong."}
          </h1>
          <p>
            {missing
              ? "The link may have changed. Head back to the demo to choose a queue."
              : "The demo couldn't load this page. Try again, or return to a queue."}
          </p>
        </div>
        <div className="actions">
          {retry && (
            <button className="button primary" onClick={retry}>
              Try again
            </button>
          )}
          <Link className="button" href="/support">
            Open support queue
          </Link>
          <Link className="button" href="/">
            Back to demo
          </Link>
        </div>
        <p className="muted small">Concept project. All data is synthetic.</p>
      </section>
    </main>
  );
}
