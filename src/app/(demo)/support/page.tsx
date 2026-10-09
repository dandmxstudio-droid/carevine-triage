"use client";
import Link from "next/link";
import { useState } from "react";
import { EyeOff, Inbox, TriangleAlert } from "lucide-react";
import { useDemo } from "@/components/demo-provider";
import { Header, Footer, MessageText, Updated } from "@/components/shared";
import { supportSort, title, waiting } from "@/lib/demo";
import type { Ticket } from "@/lib/types";
const filters = [
  "All",
  "Draft ready",
  "Needs rep",
  "Upset member",
  "Billing",
  "With nurse",
];
function matches(t: Ticket, f: string) {
  return (
    f === "All" ||
    (f === "With nurse" && t.queue === "Nurse") ||
    (t.queue === "Support" &&
      (f === t.status ||
        (f === "Upset member" && t.ai.member_mood === "upset") ||
        (f === "Billing" && t.ai.category === "billing")))
  );
}
export default function Support() {
  const { state, now } = useDemo();
  const [filter, setFilter] = useState("All");
  const active = state.tickets
    .filter((t) => t.status !== "Sent")
    .sort(supportSort);
  const rows = active.filter((t) => matches(t, filter));
  const recent = active.filter(
    (t) => t.queue === "Nurse" && t.moved_at && now - t.moved_at < 600000,
  ).length;
  return (
    <div className="app">
      <Header />
      <main id="main-content" tabIndex={-1} className="main">
        <div className="page-heading">
          <div>
            <h1>Support queue</h1>
            <p>
              Sorted by the Triage Tool. Health and crisis messages go straight
              to the nurse queue.
            </p>
          </div>
          <Updated />
        </div>
        {recent > 0 && (
          <div className="banner moved">
            <TriangleAlert size={20} />
            <strong>
              {recent} {recent === 1 ? "message moved" : "messages moved"} to
              the nurse queue as urgent.
            </strong>
            <Link href="/nurse">View nurse queue</Link>
          </div>
        )}
        <div role="group" aria-label="Filter tickets" className="filters">
          {filters.map((f) => (
            <button
              key={f}
              className="filter"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
              <span>{active.filter((t) => matches(t, f)).length}</span>
            </button>
          ))}
        </div>
        <div className="ticket-table">
          <div
            className="table-scroll"
            role="table"
            aria-label="Support tickets"
          >
            <div className="table-row table-head" role="row">
              {[
                "Ticket ID",
                "Message preview",
                "Category",
                "Priority",
                "Waiting",
                "Status",
              ].map((v) => (
                <span key={v} role="columnheader">
                  {v}
                </span>
              ))}
            </div>
            {rows.map((t) => {
              const nurse = t.queue === "Nurse";
              const content = (
                <>
                  <span className="ticket-id" role="cell">
                    {nurse ? (
                      t.ticket_id
                    ) : (
                      <Link
                        className="ticket-open"
                        href={`/support/${t.ticket_id}`}
                        aria-label={`Open ticket ${t.ticket_id}`}
                      >
                        {t.ticket_id}
                      </Link>
                    )}
                  </span>
                  <span className="preview" role="cell">
                    {nurse ? (
                      <>
                        <EyeOff size={16} />
                        <i>Moved to the nurse queue. Message hidden here.</i>
                      </>
                    ) : (
                      <>
                        <span className="truncate">
                          <MessageText
                            text={t.message
                              .replace(/^Hi, this is \[NAME\]\. /, "")
                              .replaceAll("[NAME]", t.member_first_name)}
                          />
                        </span>
                        {t.ai.member_mood === "upset" && (
                          <span className="badge tag">Upset member</span>
                        )}
                        {t.ai.language === "es" && (
                          <span className="badge tag">Spanish</span>
                        )}
                      </>
                    )}
                  </span>
                  <span
                    className="table-category"
                    role="cell"
                    data-label="Category"
                  >
                    {t.ai.crisis
                      ? "Crisis"
                      : nurse
                        ? "Clinical"
                        : title(t.ai.category)}
                    {!nurse && <span>{title(t.ai.subcategory)}</span>}
                  </span>
                  <span
                    className={`priority ${t.ai.priority}`}
                    role="cell"
                    data-label="Priority"
                  >
                    {["urgent", "high"].includes(t.ai.priority) && (
                      <span className="dot" />
                    )}
                    {title(t.ai.priority)}
                  </span>
                  <span
                    role="cell"
                    data-label="Waiting"
                    style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}
                  >
                    {waiting(t, now)}
                  </span>
                  <span role="cell" data-label="Status">
                    <span
                      className={`badge status ${nurse ? "with-nurse" : t.status.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      {nurse ? "With nurse" : t.status}
                    </span>
                  </span>
                </>
              );
              return (
                <div
                  role="row"
                  key={t.ticket_id}
                  className={`table-row ${nurse ? "nurse-row" : ""}`}
                >
                  {content}
                </div>
              );
            })}
          </div>
          {!rows.length && (
            <section className="empty" role="status">
              <Inbox size={32} />
              <h2>All caught up.</h2>
              <p>New tickets will appear here as they arrive.</p>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
