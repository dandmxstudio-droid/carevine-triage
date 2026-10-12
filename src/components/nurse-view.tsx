"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Phone,
  MessageSquare,
  CircleCheck,
  ArrowRight,
} from "lucide-react";
import { useDemo } from "./demo-provider";
import {
  Header,
  Footer,
  Message,
  CategoryForm,
  Modal,
  Updated,
} from "./shared";
import { nurseSort, nurseLabel, title, waiting } from "@/lib/demo";
import { crisisTemplate } from "@/lib/mock-results";
import type { AIResult, Ticket } from "@/lib/types";
export function NurseView() {
  const { state, now, update, toast, resetVersion } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const rows = state.tickets
    .filter((t) => t.queue === "Nurse" && t.status !== "Sent")
    .sort(nurseSort);
  const requested = params.get("ticket");
  // A Slack recipient has their own sandbox. Open the requested ticket even
  // when its transfer only exists in the sending visitor's private queue.
  const selected =
    state.tickets.find((t) => t.ticket_id === requested) || rows[0];
  const crisis = rows.find((t) => t.ai.crisis);
  const [dialog, setDialog] = useState<"return" | "crisis" | null>(null);
  const lastAction = (id: string | undefined, action: string) =>
    state.decisions
      .filter((d) => d.ticket_id === id && d.action === action)
      .at(-1);
  const crisisReply = lastAction(crisis?.ticket_id, "crisis_reply_sent");
  const call = lastAction(selected?.ticket_id, "call_logged");
  const nurseReplies = state.decisions.filter(
    (d) =>
      d.ticket_id === selected?.ticket_id &&
      d.action === "reply_sent" &&
      d.role === "Nurse",
  );
  const selectedCrisisReply = lastAction(
    selected?.ticket_id,
    "crisis_reply_sent",
  );
  const canReply = !selected?.ai.crisis || !!selectedCrisisReply;
  const time = (at: number) =>
    new Date(at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  const [editor, setEditor] = useState<{
    ticket_id: string;
    resetVersion: number;
    text: string;
  } | null>(null);
  const writingReply =
    editor?.ticket_id === selected?.ticket_id &&
    editor?.resetVersion === resetVersion &&
    canReply;
  const replyButton = useRef<HTMLButtonElement>(null);
  const [returned, setReturned] = useState<{
    ticket: Ticket;
    to: string;
    deadline: number;
  } | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  useEffect(() => {
    setEditor(null);
    setDialog(null);
  }, [selected?.ticket_id, resetVersion]);
  useEffect(() => {
    setReturned(null);
  }, [resetVersion]);
  function closeReply() {
    setEditor(null);
    replyButton.current?.focus();
  }
  useEffect(() => {
    if (!returned) return;
    setUndoAvailable(true);
    const timer = setTimeout(
      () => setUndoAvailable(false),
      Math.max(0, returned.deadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [returned]);
  function select(id: string) {
    setReturned(null);
    router.push(`/nurse?ticket=${id}`, { scroll: false });
  }
  function claim(t: Ticket) {
    if (t.claimed_by) return;
    update(
      t.ticket_id,
      { queue: "Nurse", status: "Claimed", claimed_by: "Maya Brooks, RN" },
      "claimed",
      "Nurse",
    );
    toast("Claimed by Maya Brooks, RN.");
  }
  function ensureClaim(t: Ticket) {
    if (!t.claimed_by) claim(t);
  }
  function sendBack(c: string, s: string) {
    if (!selected) return;
    const to = `${title(c)} · ${title(s)}`;
    setReturned({
      ticket: structuredClone(selected),
      to,
      deadline: Date.now() + 10000,
    });
    update(
      selected.ticket_id,
      {
        queue: "Support",
        status: "Needs rep",
        claimed_by: null,
        ai: {
          ...selected.ai,
          crisis: false,
          clinical: "no",
          category: c as AIResult["category"],
          subcategory: s,
          draft_reply: null,
          route:
            c === "billing"
              ? "Member Support - Billing lead"
              : "Member Support",
          handoff_note:
            "A nurse reviewed this message and sent it back as non-clinical. A support rep needs to write the reply.",
          reason:
            "Nurse correction: this message can be handled by Member Support.",
        },
      },
      "sent_back_to_support",
      "Nurse",
      { from_value: nurseLabel(selected), to_value: to },
    );
    setDialog(null);
    toast("Sent back to the support queue.");
  }
  const showReturned =
    returned &&
    state.tickets.find((t) => t.ticket_id === returned.ticket.ticket_id)
      ?.queue === "Support";
  const nextTicket = showReturned ? rows[0] : selected;
  return (
    <div className="app">
      <Header nurse />
      {crisis && (
        <div className="crisis-bar" role="alert">
          <strong>
            URGENT · CRISIS LANGUAGE ·{" "}
            <span className="mono">{crisis.ticket_id}</span> · arrived{" "}
            {waiting(crisis, now)} ago ·{" "}
            {crisis.claimed_by
              ? `Claimed by ${crisis.claimed_by}.`
              : "unclaimed."}
            {crisisReply && (
              <span className="nurse-action-status">
                Crisis reply sent at {time(crisisReply.at)} by{" "}
                {crisisReply.person}.
              </span>
            )}
          </strong>
          {crisis.claimed_by ? (
            <span className="button">
              <Check size={16} />
              Claimed
            </span>
          ) : (
            <button className="button" onClick={() => claim(crisis)}>
              I&apos;m on it
            </button>
          )}
        </div>
      )}
      <main id="main-content" tabIndex={-1} className="main nurse-main">
        <div className="nurse-heading">
          <h1>Nurse queue</h1>
          <p>
            Messages the Triage Tool flagged as health-related. No replies are
            drafted here; nurses respond directly.
          </p>
          <Updated />
        </div>
        <div className="nurse-layout">
          <section
            className="flagged-list"
            aria-label="Flagged messages, urgent first"
          >
            <h2 className="eyebrow">Flagged · urgent first</h2>
            {rows.map((t) => (
              <Link
                className="nurse-list-item"
                key={t.ticket_id}
                href={`/nurse?ticket=${t.ticket_id}`}
                aria-current={
                  !showReturned && selected?.ticket_id === t.ticket_id
                    ? "true"
                    : undefined
                }
                onClick={() => setReturned(null)}
              >
                <span className="nurse-row-heading">
                  <span
                    style={
                      t.ai.crisis
                        ? { color: "var(--urgent)", fontWeight: 700 }
                        : undefined
                    }
                  >
                    {nurseLabel(t)}
                  </span>
                  <span
                    className={`badge ${t.ai.priority === "urgent" ? "urgent" : "tag"}`}
                  >
                    {title(t.ai.priority)}
                  </span>
                </span>
                <span className="nurse-row-meta">
                  <span className="mono">{t.ticket_id}</span>
                  <span>· {waiting(t, now)}</span>
                  <span>{t.claimed_by ? "Claimed by you" : "Unclaimed"}</span>
                </span>
              </Link>
            ))}
            {!rows.length && <p className="muted">No flagged messages.</p>}
          </section>
          <div className="nurse-detail">
            {showReturned ? (
              <section className="card return-confirm" role="status">
                <span className="success-icon">
                  <CircleCheck size={26} />
                </span>
                <h2>Sent back to the support queue as non-clinical.</h2>
                <p className="muted" style={{ fontSize: 16 }}>
                  The Triage Tool will learn from this correction.
                </p>
                <div className="return-meta">
                  <span className="mono strong">
                    {returned.ticket.ticket_id}
                  </span>
                  <span className="muted">
                    Was: {nurseLabel(returned.ticket)} ·{" "}
                    {title(returned.ticket.ai.priority)}
                  </span>
                  <ArrowRight size={16} />
                  <strong>Support queue · {returned.to}</strong>
                </div>
                <div className="actions" style={{ paddingTop: 4 }}>
                  {nextTicket && (
                    <button
                      className="button primary"
                      onClick={() => select(nextTicket.ticket_id)}
                    >
                      Open next:{" "}
                      <span className="mono">{nextTicket.ticket_id}</span>
                    </button>
                  )}
                  <button
                    className="button"
                    disabled={!undoAvailable}
                    onClick={() => {
                      if (Date.now() > returned.deadline) return;
                      update(
                        returned.ticket.ticket_id,
                        returned.ticket,
                        "send_back_undone",
                        "Nurse",
                      );
                      select(returned.ticket.ticket_id);
                      toast("Ticket returned to the nurse queue.");
                    }}
                  >
                    Undo
                  </button>
                  {!undoAvailable && (
                    <span className="muted small">Undo expired</span>
                  )}
                </div>
              </section>
            ) : selected ? (
              <>
                <div className="selected-heading">
                  <h2>{selected.ticket_id}</h2>
                  <span
                    className={`badge ${selected.ai.priority === "urgent" ? "urgent" : ""}`}
                    data-field={selected.ai.crisis ? "crisis" : "clinical"}
                  >
                    {nurseLabel(selected)} · {title(selected.ai.priority)}
                  </span>
                  <span className="muted" style={{ fontSize: 14 }}>
                    Waiting {waiting(selected, now)}
                    {!selected.claimed_by ? " · Unclaimed" : ""}
                  </span>
                  {selected.claimed_by && (
                    <span className="claimed-text small">
                      <Check size={16} />
                      Claimed by you
                    </span>
                  )}
                </div>
                <Message ticket={selected} nurse />
                {nurseReplies.map((reply, index) => (
                  <section
                    className="card stack nurse-reply-sent"
                    role="status"
                    key={`${reply.at}-${index}`}
                  >
                    <strong>
                      Reply sent to {selected.member_first_name} at{" "}
                      {time(reply.at)} by {reply.person}
                    </strong>
                    <p className="sent-reply">{reply.final_reply}</p>
                  </section>
                ))}
                {writingReply && (
                  <section className="card" aria-label="Write a nurse reply">
                    <form
                      className="stack"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const text = editor?.text.trim();
                        if (!text || !canReply) return;
                        ensureClaim(selected);
                        update(selected.ticket_id, {}, "reply_sent", "Nurse", {
                          final_reply: text,
                        });
                        closeReply();
                        toast();
                      }}
                    >
                      <p id="nurse-reply-guidance">
                        Nurses write their own replies. The Triage Tool never
                        drafts health advice.
                      </p>
                      <div className="reply-field">
                        <label htmlFor="nurse-reply">Your reply</label>
                        <textarea
                          id="nurse-reply"
                          aria-describedby="nurse-reply-guidance"
                          rows={7}
                          maxLength={10000}
                          required
                          autoFocus
                          value={editor?.text || ""}
                          onChange={(event) =>
                            setEditor((current) =>
                              current
                                ? { ...current, text: event.target.value }
                                : null,
                            )
                          }
                          placeholder={`Write your reply to ${selected.member_first_name}…`}
                        />
                      </div>
                      <div className="actions">
                        <button
                          className="button primary"
                          type="submit"
                          disabled={!editor?.text.trim()}
                        >
                          Send reply
                        </button>
                        <button
                          className="button"
                          type="button"
                          onClick={closeReply}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </section>
                )}
                <section
                  className="card ai-card nurse-reason"
                  aria-labelledby="nurse-why"
                >
                  <div className="ai-label">
                    <span className="ai-eyebrow">Triage Tool handoff note</span>
                    <span className="small">AI-generated.</span>
                  </div>
                  <h3 id="nurse-why">Why the Triage Tool flagged it</h3>
                  <p data-field="reason">{selected.ai.reason}</p>
                </section>
                {selected.ai.crisis && (
                  <section
                    className="card crisis-template"
                    aria-labelledby="crisis-template"
                  >
                    <div className="ai-label">
                      <h3 id="crisis-template">
                        Step 1 · Crisis reply template
                      </h3>
                      <span className="badge urgent tag">
                        Sent only when you choose
                      </span>
                    </div>
                    <p>{crisisTemplate}</p>
                    <div className="actions">
                      <button
                        className="button danger"
                        disabled={!!selectedCrisisReply}
                        onClick={() => setDialog("crisis")}
                      >
                        Send crisis reply
                      </button>
                    </div>
                  </section>
                )}
                <div
                  className="actions nurse-actions"
                  role="group"
                  aria-label="Nurse ticket actions"
                >
                  {selected.claimed_by ? (
                    <span className="claimed-text">
                      <Check size={18} />
                      Claimed by you
                    </span>
                  ) : (
                    <button
                      className="button primary"
                      onClick={() => claim(selected)}
                    >
                      I&apos;m on it
                    </button>
                  )}
                  <button
                    className="button"
                    onClick={() => {
                      ensureClaim(selected);
                      update(selected.ticket_id, {}, "call_logged", "Nurse");
                      toast();
                    }}
                  >
                    <Phone size={18} />
                    Call member
                  </button>
                  <button
                    ref={replyButton}
                    className="button"
                    disabled={!canReply}
                    aria-describedby={
                      !canReply ? "crisis-reply-hint" : undefined
                    }
                    onClick={() => {
                      if (!canReply) return;
                      setEditor({
                        ticket_id: selected.ticket_id,
                        resetVersion,
                        text: "",
                      });
                    }}
                  >
                    <MessageSquare size={18} />
                    Reply in app
                  </button>
                </div>
                {!canReply && (
                  <p id="crisis-reply-hint" className="muted small">
                    Send the crisis reply first.
                  </p>
                )}
                {!selected.ai.crisis && selected.claimed_by && (
                  <div className="actions">
                    <button
                      className="text-button"
                      onClick={() => setDialog("return")}
                    >
                      Not clinical: send back to support
                    </button>
                  </div>
                )}
                {call && (
                  <div
                    className="stack tight nurse-action-status"
                    role="status"
                  >
                    <p>
                      Call logged at {time(call.at)} by {call.person}.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <section className="card empty">
                <CircleCheck size={32} />
                <h2>All caught up.</h2>
                <p>No messages are waiting in the nurse queue.</p>
              </section>
            )}
          </div>
        </div>
      </main>
      <Footer />
      {dialog === "crisis" && selected && (
        <Modal
          title={<>Send this crisis reply to {selected.member_first_name}?</>}
          onClose={() => setDialog(null)}
        >
          <div className="stack">
            <p className="sent-reply">{crisisTemplate}</p>
            <div className="actions end">
              <button className="button" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                className="button danger-solid"
                onClick={() => {
                  ensureClaim(selected);
                  update(selected.ticket_id, {}, "crisis_reply_sent", "Nurse", {
                    final_reply: crisisTemplate,
                  });
                  setDialog(null);
                  toast();
                }}
              >
                Send
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog === "return" && selected && (
        <CategoryForm
          ticket={selected}
          sendBack
          onClose={() => setDialog(null)}
          onSubmit={sendBack}
        />
      )}{" "}
    </div>
  );
}
