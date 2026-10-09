"use client";
import Link from "next/link";
import { useActionState } from "react";
import {
  setup,
  logout,
  testCrisisAlert,
  type AdminResult,
} from "@/app/admin/actions";
export function AdminSetup({
  configured,
  slackReady,
}: {
  configured: boolean;
  slackReady: boolean;
}) {
  const [alert, alertAction, alertPending] = useActionState(testCrisisAlert, {
    message: "",
  } as AdminResult);
  const [state, action, pending] = useActionState(setup, {
    message: "",
  } as AdminResult);
  return (
    <main id="main-content" tabIndex={-1} className="main admin-main">
      <div className="page-heading">
        <div>
          <h1>Demo setup</h1>
          <p>Carevine Helpdesk · Phase 5</p>
        </div>
        <form action={logout}>
          <button className="button">Sign out</button>
        </form>
      </div>
      <section className="card">
        <h2>Connection status</h2>
        <p>
          {state.report
            ? state.report.connected
              ? "Connected to Airtable"
              : "Could not connect to Airtable"
            : configured
              ? "Airtable settings configured. Run the schema check to verify the connection."
              : "Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in Vercel."}
        </p>
        <p className="muted small">
          No automatic refresh. Public reads share a five-minute cache; reset
          makes no Airtable calls.
        </p>
      </section>
      <section className="card">
        <h2>Schema check</h2>
        <p>
          Compare all five tables with the handoff and create missing fields,
          including session_id on Decisions and KB Gaps. Existing field types
          stay as they are. Type differences are information only. Only missing
          fields or errors block seeding.
        </p>
        <form action={action}>
          <button
            className="button"
            name="task"
            value="schema"
            disabled={pending || !configured}
          >
            {pending ? "Working…" : "Check schema & create missing fields"}
          </button>
        </form>
        {state.report && (
          <div className="stack" aria-live="polite">
            <p>
              Checked at {new Date(state.report.checked_at).toLocaleString()}.{" "}
              {state.report.ready ? "Ready to seed." : "Needs attention."}
            </p>
            {(
              [
                ["Created", state.report.created],
                ["Missing", state.report.missing],
                ["Type differences (info)", state.report.differences],
                ["Errors", state.report.errors],
              ] as [string, string[]][]
            ).map(([label, list]) => (
              <div key={label}>
                <strong>{label}</strong>
                {list.length ? (
                  <ul>
                    {list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">None</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="card">
        <h2>Seed demo data</h2>
        <p>
          Upsert the 16 synthetic tickets, restore one mock AI result per
          ticket, and seed the help center gaps. This deletes all existing
          Decisions rows. Visitor gap logs stay intact.
        </p>
        <form action={action}>
          <button
            className="button primary"
            name="task"
            value="seed"
            disabled={pending || !configured || !state.report?.ready}
          >
            {pending ? "Working…" : "Seed demo data"}
          </button>
        </form>
        {state.message && (
          <p role={state.error ? "alert" : "status"}>{state.message}</p>
        )}
        {state.seed && (
          <p>
            {state.seed.tickets} tickets · {state.seed.results} AI results ·{" "}
            {state.seed.gaps} seeded gaps · {state.seed.decisions_deleted}{" "}
            Decisions deleted.
          </p>
        )}
      </section>
      <section className="card">
        <h2>Slack crisis alert</h2>
        <p>Post the synthetic T-01 crisis alert for the demo recording.</p>
        {!slackReady && <p>Set SLACK_WEBHOOK_URL and APP_URL in Vercel.</p>}
        <form action={alertAction}>
          <button className="button" disabled={alertPending || !slackReady}>
            {alertPending ? "Sending…" : "Send test crisis alert"}
          </button>
        </form>
        {alert.message && (
          <p role={alert.error ? "alert" : "status"}>{alert.message}</p>
        )}
      </section>
      <div className="actions">
        <Link className="button" href="/support">
          Open support queue
        </Link>
        <Link className="button" href="/admin/tests">
          Open Triage Tool test runner
        </Link>
      </div>
    </main>
  );
}
