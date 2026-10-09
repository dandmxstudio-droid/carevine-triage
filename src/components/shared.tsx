"use client";
import Link from "next/link";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  EyeOff,
  Lock,
  X,
  ExternalLink,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDemo } from "./demo-provider";
import { highlightParts } from "@/lib/message-highlights";
import { crisisMatches } from "@/lib/redact";
import { waiting } from "@/lib/demo";
import type { Ticket } from "@/lib/types";
export function Logo({ large = false }: { large?: boolean }) {
  return (
    <span className={`logo ${large ? "large" : ""}`}>
      <img src="/brand/carevine-logo-transparent.png" alt="Carevine" />
    </span>
  );
}
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      {name
        .split(" ")
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
    </span>
  );
}
export function Header({ nurse = false }: { nurse?: boolean }) {
  const name = nurse ? "Maya Brooks, RN" : "Julia Lee";
  return (
    <header className="app-header">
      <Link
        href="/support"
        className="brand-link"
        aria-label="Carevine Triage Tool, go to support queue"
      >
        <Logo />
        <span className="divider" />
        <span className="tool-name">Triage Tool</span>
      </Link>
      <nav aria-label="Main">
        <Link href="/support" aria-current={!nurse ? "page" : undefined}>
          Support queue
        </Link>
        <Link href="/nurse" aria-current={nurse ? "page" : undefined}>
          Nurse queue
        </Link>
      </nav>
      <div className="person">
        <span>{name}</span>
        <Avatar name={name} />
      </div>
    </header>
  );
}
export function Footer() {
  const { reset } = useDemo();
  return (
    <footer className="footer">
      <span>Concept project. All data is synthetic.</span>
      <button className="text-button" onClick={reset}>
        Reset demo
      </button>
    </footer>
  );
}
export function Back() {
  return (
    <Link className="button back" href="/support">
      <ArrowLeft size={18} />
      Back to queue
    </Link>
  );
}
const hiddenNames: Record<string, string> = {
  DOB: "Date of birth hidden",
  DATE_OF_BIRTH: "Date of birth hidden",
  "MEMBER ID": "Member number hidden",
  PHONE: "Phone hidden",
  EMAIL: "Email hidden",
  ADDRESS: "Address hidden",
};
export function Updated() {
  const { loadedAt, now } = useDemo();
  return (
    <span className="muted small">
      Updated{" "}
      {now
        ? new Date(loadedAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })
        : "—"}
    </span>
  );
}
export function MessageText({
  text,
  phrases = [],
}: {
  text: string;
  phrases?: string[];
}) {
  const parts = text.split(
    /(\[(?:DOB|DATE_OF_BIRTH|MEMBER ID|PHONE|EMAIL|ADDRESS)\])/gi,
  );
  return (
    <>
      {parts.map((part, i) =>
        hiddenNames[part.slice(1, -1).toUpperCase()] ? (
          <span className="hidden-tag" key={i}>
            <EyeOff size={14} />
            {hiddenNames[part.slice(1, -1).toUpperCase()]}
          </span>
        ) : (
          <Fragment key={i}>
            {highlightParts(part, phrases).map((segment, j) =>
              segment.highlighted ? (
                <mark key={j}>{segment.text}</mark>
              ) : (
                segment.text
              ),
            )}
          </Fragment>
        ),
      )}
    </>
  );
}
export function Message({
  ticket,
  nurse = false,
}: {
  ticket: Ticket;
  nurse?: boolean;
}) {
  const { now } = useDemo();
  const text = ticket.message.replaceAll("[NAME]", ticket.member_first_name);
  const phrases = nurse
    ? [...new Set([...ticket.ai.flagged_phrases, ...crisisMatches(text)])]
    : [];
  const dob = /\[(DOB|DATE_OF_BIRTH)\]/.test(text);
  const id = text.includes("[MEMBER ID]");
  const otherPersonalDetails = /\[(PHONE|EMAIL|ADDRESS)\]/.test(text);
  return (
    <section className="card message" aria-label="Member message">
      <div className="message-person">
        <span className="member-avatar">{ticket.member_first_name[0]}</span>
        <div className="stack tight">
          <strong>{ticket.member_first_name}</strong>
          <span className="muted small">
            {ticket.program} program{nurse ? " · Phone on file" : ""}
          </span>
        </div>
        <span className="muted small received">
          Received {waiting(ticket, now)} ago
        </span>
      </div>
      <p className="message-text">
        <MessageText text={text} phrases={phrases} />
      </p>
      {(dob || id || otherPersonalDetails) && (
        <p className="privacy-note">
          <Lock size={14} />
          {dob
            ? "A date of birth in this message was hidden and not sent to the Triage Tool."
            : id
              ? "A member number in this message was hidden and not sent to the Triage Tool."
              : "Personal details in this message were hidden and not sent to the Triage Tool."}
        </p>
      )}
    </section>
  );
}
export function RecentHistory({ ticket }: { ticket: Ticket }) {
  const histories: Record<string, string[][]> = {
    "CV-10009": [
      ["CV-09950", "Sep 30", "Welcome kit delivery date", "Resolved"],
    ],
    "CV-10035": [
      ["CV-09871", "Sep 12", "Password reset email not arriving", "Resolved"],
    ],
    "T-02": [
      ["CV-10002", "Oct 6", "Readings still not in the app", "Closed"],
      ["CV-09988", "Oct 3", "Readings not syncing", "Closed"],
    ],
    "CV-10037": [["CV-09902", "Sep 18", "Meter shipped", "Resolved"]],
    "CV-10033": [
      ["CV-09940", "Sep 28", "Updating my card on file", "Resolved"],
    ],
  };
  return (
    <section className="card history" aria-label="Recent history">
      <h2 className="eyebrow">Recent history</h2>
      {(histories[ticket.ticket_id] || []).map((r) => (
        <div className="history-row" key={r[0]}>
          <span className="mono">{r[0]}</span>
          <span className="muted">{r[1]}</span>
          <span className="truncate">{r[2]}</span>
          <span className="muted small">{r[3]}</span>
        </div>
      ))}
      {!histories[ticket.ticket_id] && (
        <p className="muted small">No previous tickets.</p>
      )}
    </section>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  side = false,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  side?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""} ${side ? "side-panel" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button close-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Articles({
  ids,
  onOpen,
}: {
  ids: string[];
  onOpen: (id: string) => void;
}) {
  const { articles } = useDemo();
  return (
    <div className="article-list">
      {ids.length ? (
        ids.map((id) => (
          <div className="article-link" key={id}>
            <span className="mono small strong">{id}</span>
            <span>
              {articles.find((a) => a.id === id)?.title ||
                "Article unavailable"}
            </span>
            <button className="link-button" onClick={() => onOpen(id)}>
              View article
              <ExternalLink size={14} />
            </button>
          </div>
        ))
      ) : (
        <span>None found</span>
      )}
    </div>
  );
}
export function ArticlePanel({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { articles } = useDemo();
  const article = articles.find((a) => a.id === id);
  return (
    <Modal
      title={
        <>
          <span className="mono">{id}</span> ·{" "}
          {article?.title || "Article unavailable"}
        </>
      }
      onClose={onClose}
      wide
      side
    >
      <article className="article-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {article?.body || "This article is unavailable."}
        </ReactMarkdown>
      </article>
    </Modal>
  );
}
export function CategoryForm({
  ticket,
  onSubmit,
  onClose,
  sendBack = false,
}: {
  ticket: Ticket;
  onSubmit: (category: string, subcategory: string) => void;
  onClose: () => void;
  sendBack?: boolean;
}) {
  return (
    <Modal
      title={sendBack ? "Send back to the support queue?" : "Change category"}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          onSubmit(
            String(data.get("category")),
            String(data.get("subcategory")),
          );
        }}
      >
        <label className="stack tight strong small">
          Category
          <select name="category" defaultValue={ticket.ai.category || "device"}>
            <option value="app">App</option>
            <option value="device">Device</option>
            <option value="billing">Billing</option>
            <option value="scheduling">Scheduling</option>
          </select>
        </label>
        <label className="stack tight strong small">
          Subcategory
          <select
            name="subcategory"
            defaultValue={ticket.ai.subcategory || "fit"}
          >
            {[
              "login",
              "sync",
              "bug",
              "setup",
              "malfunction",
              "supplies",
              "charge",
              "refund",
              "eligibility",
              "appointment",
              "fit",
            ].map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        {sendBack && (
          <p className="muted small">
            The ticket will move to the support queue with no draft. The support
            rep will review it.
          </p>
        )}
        <div className="actions end">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            {sendBack ? "Send back to support" : "Save category"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export { ArrowRight };
