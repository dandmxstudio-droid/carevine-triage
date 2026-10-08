"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  ThumbsUp,
  ThumbsDown,
  TriangleAlert,
  EyeOff,
} from "lucide-react";
import { useDemo } from "./demo-provider";
import {
  Header,
  Back,
  Message,
  RecentHistory,
  Articles,
  ArticlePanel,
  CategoryForm,
  Modal,
} from "./shared";
import {
  category,
  supportSort,
  title,
  visibleDraft,
  waiting,
} from "@/lib/demo";
import type { AIResult, Ticket } from "@/lib/types";
export function TicketView({ id }: { id: string }) {
  const { state, now, update, toast } = useDemo();
  const router = useRouter();
  const ticket = state.tickets.find((t) => t.ticket_id === id)!;
  const [reply, setReply] = useState(visibleDraft(ticket));
  const [article, setArticle] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"category" | "nurse" | null>(null);
  const [reason, setReason] = useState("");
  const [gap, setGap] = useState(ticket.gap_flagged);
  useEffect(() => {
    if (ticket.draft_rejected && ticket.status !== "Sent") setReply("");
  }, [ticket.draft_rejected, ticket.status]);
  const ai = ticket.ai;
  const sent = ticket.status === "Sent";
  const draft = !!ai.draft_reply && !ticket.draft_rejected;
  const next = state.tickets
    .filter(
      (t) => t.queue === "Support" && t.status !== "Sent" && t.ticket_id !== id,
    )
    .sort(supportSort)[0];
  function send() {
    if (!reply.trim()) return;
    update(
      id,
      {
        status: "Sent",
        final_reply: reply.trim(),
        sent_at: Date.now(),
        gap_flagged: gap,
      },
      draft
        ? reply === visibleDraft(ticket)
          ? "approved_as_is"
          : "approved_edited"
        : "reply_sent",
      "Support rep",
      {
        final_reply: reply.trim(),
        note: ai.kb_gap
          ? gap
            ? "Help center gap flagged."
            : "Help center gap rejected."
          : undefined,
      },
    );
    toast();
  }
  function feedback(value: "Yes" | "No") {
    update(id, { feedback: value }, "draft_feedback", "Support rep", {
      note: value,
    });
    toast("Draft feedback recorded.");
  }
  function changeCategory(c: string, s: string) {
    update(
      id,
      { ai: { ...ai, category: c as AIResult["category"], subcategory: s } },
      "category_changed",
      "Support rep",
      { from_value: category(ticket), to_value: `${title(c)} · ${title(s)}` },
    );
    setDialog(null);
    toast("Category updated.");
  }
  function sendToNurse() {
    if (!reason.trim()) return;
    update(
      id,
      {
        queue: "Nurse",
        status: "With nurse",
        ai: {
          ...ai,
          clinical: "unsure",
          draft_reply: null,
          route: "Nurse",
          priority: "high",
          handoff_note: reason.trim(),
          reason: reason.trim(),
        },
        draft_rejected: true,
        claimed_by: null,
      },
      "sent_to_nurse",
      "Support rep",
      { note: reason.trim() },
    );
    setDialog(null);
    toast("Moved to the nurse queue.");
    router.push("/support");
  }
  const actions = (
    <div className="actions">
      <button
        className="button primary"
        onClick={send}
        disabled={!reply.trim()}
      >
        {draft ? "Approve and send" : "Send reply"}
      </button>
      {draft && (
        <button
          className="button"
          onClick={() => {
            update(
              id,
              { draft_rejected: true, status: "Needs rep" },
              "draft_rejected",
            );
            setReply("");
            toast("Draft rejected. Write your reply.");
          }}
        >
          Reject draft
        </button>
      )}
      <button className="button" onClick={() => setDialog("category")}>
        Change category
      </button>
      <button className="button danger" onClick={() => setDialog("nurse")}>
        Send to nurse
      </button>
    </div>
  );
  const gapCheckbox = ai.kb_gap && (
    <label className="gap-check">
      <input
        type="checkbox"
        checked={gap}
        onChange={(e) => setGap(e.target.checked)}
      />
      <span className="stack tight">
        <strong>Flag help center gap</strong>
        <p>{ai.kb_gap}</p>
      </span>
    </label>
  );
  const feedbackControls = (
    <div className="feedback">
      {sent ? (
        <>
          <span className="stack tight">
            <strong>Was this draft useful?</strong>
            <span className="small">
              Your answer helps the Triage Tool write better drafts.
            </span>
          </span>
          <div className="actions" style={{ marginLeft: "auto" }}>
            {(["Yes", "No"] as const).map((v) => (
              <button
                key={v}
                className="button"
                aria-pressed={ticket.feedback === v}
                onClick={() => feedback(v)}
              >
                {v === "Yes" ? (
                  <ThumbsUp size={16} />
                ) : (
                  <ThumbsDown size={16} />
                )}{" "}
                {v}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <span>Was this draft useful?</span>
          <button
            className="icon-button"
            aria-label="Yes, this draft was useful"
            aria-pressed={ticket.feedback === "Yes"}
            onClick={() => feedback("Yes")}
          >
            <ThumbsUp size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="No, this draft was not useful"
            aria-pressed={ticket.feedback === "No"}
            onClick={() => feedback("No")}
          >
            <ThumbsDown size={18} />
          </button>
        </>
      )}
    </div>
  );
  return (
    <div className="app">
      <Header />
      <main className="main ticket-main">
        <div className="ticket-heading">
          <Back />
          <h1>{id}</h1>
          <div className="ticket-tags">
            <span className="badge" data-field="category">
              {category(ticket)}
            </span>
            <span
              className={`badge ${ai.priority === "urgent" ? "urgent" : ""}`}
              data-field="priority"
            >
              {ai.priority === "high" && <span className="dot" />}
              {title(ai.priority)} priority
            </span>
            {ai.member_mood === "upset" && (
              <span className="badge tag">Upset member</span>
            )}
            {ai.language === "es" && <span className="badge tag">Spanish</span>}
            <span className="muted" style={{ fontSize: 14 }}>
              Waiting {waiting(ticket, now)}
            </span>
          </div>
        </div>
        {ticket.queue === "Nurse" ? (
          <section className="card">
            <EyeOff size={24} />
            <h2>Moved to the nurse queue. Message hidden here.</h2>
            <Link className="button primary" href={`/nurse?ticket=${id}`}>
              View nurse queue
            </Link>
          </section>
        ) : (
          <>
            {sent && (
              <div className="banner" role="status">
                <CircleCheck size={22} />
                <span className="stack tight">
                  <strong>Reply sent to {ticket.member_first_name}</strong>
                  <span style={{ fontSize: 14 }}>
                    Sent at{" "}
                    {new Date(ticket.sent_at || 0).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    by Julia Lee. The ticket is now closed.
                  </span>
                </span>
                <div className="actions">
                  <Back />
                  <Link
                    className="button primary"
                    href={next ? `/support/${next.ticket_id}` : "/support"}
                  >
                    {next ? "Next ticket" : "Back to queue"}
                  </Link>
                </div>
              </div>
            )}
            {!draft && !sent && (
              <div className="banner warning">
                <TriangleAlert size={20} style={{ flexShrink: 0 }} />
                <p>
                  <strong>No draft:</strong>{" "}
                  {ticket.draft_rejected
                    ? "the draft was rejected. Write your reply below."
                    : ai.kb_gap || ai.handoff_note}
                </p>
              </div>
            )}
            <div className="ticket-grid">
              <div className="stack">
                <Message ticket={ticket} />
                <RecentHistory ticket={ticket} />
              </div>
              <div className="stack">
                {draft || sent ? (
                  <section
                    className="card ai-card"
                    aria-labelledby="suggestion-label"
                  >
                    <div className="ai-label">
                      <h2 id="suggestion-label" className="ai-eyebrow">
                        Triage Tool suggestion
                      </h2>
                      <span className="small">
                        AI-generated. Review before sending.
                      </span>
                    </div>
                    {!sent && ai.confidence !== "high" && (
                      <div className="banner warning">
                        <p>
                          <strong>{title(ai.confidence)} confidence:</strong>{" "}
                          {ai.reason}
                          {ai.language === "es"
                            ? " Check the wording before sending."
                            : ""}
                        </p>
                      </div>
                    )}
                    <dl className="details">
                      <dt>Category</dt>
                      <dd className="strong" data-field="category subcategory">
                        {category(ticket)}
                      </dd>
                      <dt>Confidence</dt>
                      <dd data-field="confidence">
                        <span className={`badge confidence ${ai.confidence}`}>
                          {title(ai.confidence)}
                        </span>
                      </dd>
                      <dt className="top">Health content</dt>
                      <dd data-field="clinical crisis">
                        None found
                        {!sent && (
                          <p className="health-note">
                            Spotted a health concern? Use Send to nurse below.
                          </p>
                        )}
                      </dd>
                      <dt>Language</dt>
                      <dd data-field="language">
                        {ai.language === "es" ? "Spanish" : "English"}
                      </dd>
                      <dt>Member mood</dt>
                      <dd data-field="member_mood">{title(ai.member_mood)}</dd>
                      <dt>Source article</dt>
                      <dd data-field="article_ids">
                        <Articles ids={ai.article_ids} onOpen={setArticle} />
                        {ai.language === "es" && (
                          <p className="health-note">
                            No Spanish article. Draft translated from KB-003.
                          </p>
                        )}
                      </dd>
                    </dl>
                    <div className="reply-field">
                      <label htmlFor="reply">
                        {sent ? "Sent reply" : "Draft reply"}
                      </label>
                      {sent ? (
                        <p className="sent-reply">{ticket.final_reply}</p>
                      ) : (
                        <>
                          <textarea
                            id="reply"
                            data-field="draft_reply"
                            rows={9}
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                          />
                          <p>
                            Member&apos;s first name added by the helpdesk.
                            Names are never sent to the Triage Tool.
                          </p>
                        </>
                      )}
                    </div>
                    {!sent && gapCheckbox}
                    <div className="route-reason">
                      <strong>Why this route</strong>
                      <p data-field="reason route">{ai.reason}</p>
                    </div>
                    {!sent && actions}
                    {draft && feedbackControls}
                  </section>
                ) : (
                  <>
                    <section
                      className="card ai-card"
                      aria-labelledby="handoff-label"
                      style={{ gap: 16 }}
                    >
                      <div className="ai-label">
                        <h2 id="handoff-label" className="ai-eyebrow">
                          Triage Tool handoff note
                        </h2>
                        <span className="small">
                          AI-generated. Review before sending.
                        </span>
                      </div>
                      <p className="handoff-note" data-field="handoff_note">
                        {ai.handoff_note ||
                          "Draft rejected. The support rep will write a reply."}
                      </p>
                      <dl className="details">
                        <dt>Category</dt>
                        <dd
                          className="strong"
                          data-field="category subcategory"
                        >
                          {category(ticket)}
                        </dd>
                        <dt>Priority</dt>
                        <dd data-field="priority">{title(ai.priority)}</dd>
                        <dt className="top">Health content</dt>
                        <dd data-field="clinical crisis">
                          None found
                          <p className="health-note">
                            Spotted a health concern? Use Send to nurse below.
                          </p>
                        </dd>
                        <dt>Related article</dt>
                        <dd data-field="article_ids">
                          <Articles ids={ai.article_ids} onOpen={setArticle} />
                        </dd>
                      </dl>
                      <div className="route-reason">
                        <strong>Why this route</strong>
                        <p data-field="reason">{ai.reason}</p>
                      </div>
                    </section>
                    <section className="card" aria-label="Your reply">
                      <div className="reply-field">
                        <label htmlFor="reply">Your reply</label>
                        <textarea
                          id="reply"
                          rows={7}
                          placeholder={`Write your reply to ${ticket.member_first_name}`}
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                        />
                      </div>
                      {gapCheckbox}
                      {actions}
                    </section>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>
      {article && (
        <ArticlePanel id={article} onClose={() => setArticle(null)} />
      )}{" "}
      {dialog === "category" && (
        <CategoryForm
          ticket={ticket}
          onClose={() => setDialog(null)}
          onSubmit={changeCategory}
        />
      )}{" "}
      {dialog === "nurse" && (
        <Modal
          title={
            <>
              Send <span className="mono">{id}</span> to the nurse queue?
            </>
          }
          onClose={() => setDialog(null)}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              sendToNurse();
            }}
          >
            <label className="reply-field strong small" htmlFor="nurse-reason">
              <span>
                What did you notice?{" "}
                <span className="muted" style={{ fontWeight: 500 }}>
                  Required
                </span>
              </span>
              <textarea
                id="nurse-reason"
                rows={4}
                required
                aria-required="true"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
              The draft will be discarded. The Triage Tool will learn from this
              correction.
            </p>
            <div className="actions end">
              <button
                className="button"
                type="button"
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button
                className="button danger-solid"
                type="submit"
                disabled={!reason.trim()}
              >
                Send to nurse
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
