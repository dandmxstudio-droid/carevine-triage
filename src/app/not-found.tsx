import Link from "next/link";
export default function NotFound() {
  return (
    <main className="entry">
      <section className="entry-card">
        <h1>Ticket not found</h1>
        <p>This demo contains 16 synthetic tickets.</p>
        <Link className="button primary" href="/support">
          Back to queue
        </Link>
      </section>
    </main>
  );
}
