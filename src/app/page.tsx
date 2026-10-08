import Link from "next/link";
import { Logo, Avatar, ArrowRight } from "@/components/shared";
export default function Entry() {
  return (
    <main className="entry">
      <div className="entry-card">
        <Logo large />
        <div className="entry-intro">
          <h1>Triage Tool demo</h1>
          <p>
            An AI tool that sorts member messages, sends health questions to
            nurses, and drafts replies for support reps to approve.
          </p>
        </div>
        <div className="entry-links">
          <Link href="/support" className="entry-link">
            <Avatar name="Julia Lee" size={48} />
            <span className="stack tight">
              <strong>View as support rep</strong>
              <span className="muted">Julia Lee · Support queue</span>
            </span>
            <ArrowRight size={20} />
          </Link>
          <Link href="/nurse" className="entry-link">
            <Avatar name="Maya Brooks" size={48} />
            <span className="stack tight">
              <strong>View as nurse</strong>
              <span className="muted">Maya Brooks, RN · Nurse queue</span>
            </span>
            <ArrowRight size={20} />
          </Link>
        </div>
      </div>
      <p className="entry-footer">Concept project. All data is synthetic.</p>
    </main>
  );
}
