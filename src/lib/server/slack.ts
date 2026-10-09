import "server-only";
import type { AIResult, Ticket } from "../types";
import { redact } from "../redact";
import type { AirtableClient, RecordRow } from "./airtable-core";
import type { LogBatch } from "./decisions";

export type AlertStatus = "sent" | "failed" | "unconfigured";
type Alert = {
  ticket: Ticket;
  receivedAt: number;
  result?: AIResult;
  repReason?: string;
  demo?: boolean;
};
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Reasons are free text too. Strip personal details, quotes and verbatim message
// excerpts before Slack, including excerpts copied into a Support rep's reason.
export function privateReason(reason: string, ticket: Ticket) {
  let text = ticket.message.trim()
    ? reason.replace(
        new RegExp(escape(ticket.message.trim()), "gi"),
        "[message excerpt removed]",
      )
    : reason;
  text = text.replace(/[“"][^”"\n]+[”"]/g, "[message excerpt removed]");
  const words = ticket.message.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) || [];
  for (let i = 0; i + 2 < words.length; i++) {
    const pattern = words
      .slice(i, i + 3)
      .map(escape)
      .join("[^\\p{L}\\p{N}]+");
    text = text.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu"),
      "[message excerpt removed]",
    );
  }
  // Strip flagged crisis phrases even when shorter than three words.
  for (const phrase of ticket.ai.flagged_phrases)
    if (phrase.trim())
      text = text.replace(
        new RegExp(escape(phrase), "gi"),
        "[message excerpt removed]",
      );
  if (ticket.member_first_name)
    text = text.replace(
      new RegExp(
        `(?<![\\p{L}\\p{N}])${escape(ticket.member_first_name)}(?![\\p{L}\\p{N}])`,
        "giu",
      ),
      "[NAME]",
    );
  text = redact(text).text.replace(/\d{6,}/g, "[hidden]");
  return text.trim().slice(0, 1500) || "A nurse needs to review this ticket.";
}
function settings() {
  const webhook = new URL(process.env.SLACK_WEBHOOK_URL || "");
  const app = new URL(process.env.APP_URL || "");
  if (
    webhook.protocol !== "https:" ||
    !["hooks.slack.com", "hooks.slack-gov.com"].includes(webhook.hostname) ||
    webhook.username ||
    webhook.password
  )
    throw new Error("Invalid Slack configuration.");
  if (app.protocol !== "https:" || app.username || app.password)
    throw new Error("Invalid app URL.");
  return { webhook, app };
}
export function slackConfigured() {
  try {
    settings();
    return true;
  } catch {
    return false;
  }
}
export function urgentAlert(result: AIResult) {
  return result.route === "Nurse - urgent" || result.priority === "urgent";
}
export function alertPayload(alert: Alert, app: URL, now = Date.now()) {
  const { ticket, repReason, demo } = alert;
  const result = alert.result || ticket.ai;
  const topic =
    (
      {
        "CV-10004": "Low reading and symptoms",
        "CV-10018": "High reading",
        "CV-10012": "Medication",
        "CV-10084": "Symptoms",
      } as Record<string, string>
    )[ticket.ticket_id] || "Health concern";
  const seconds = Math.max(0, Math.floor((now - alert.receivedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const age = demo
    ? minutes > 0
      ? `${minutes} min ago`
      : "just now"
    : seconds > 0
      ? `${seconds} sec ago`
      : "just now";
  const heading = `${demo ? "[Demo] " : ""}${
    repReason !== undefined
      ? `🟠 Sent to nurse by support rep · ${ticket.ticket_id}`
      : result.crisis
        ? `🔴 URGENT · Crisis language · ${ticket.ticket_id}`
        : `🟠 Clinical · ${ticket.ticket_id} · ${topic}`
  } · arrived ${age}`;
  const reason = privateReason(repReason ?? result.reason, {
    ...ticket,
    ai: result,
  });
  const link = new URL("/nurse", app);
  link.searchParams.set("ticket", ticket.ticket_id);
  return {
    text: heading,
    unfurl_links: false,
    unfurl_media: false,
    blocks: [
      { type: "section", text: { type: "plain_text", text: heading } },
      {
        type: "section",
        text: { type: "plain_text", text: `Reason: ${reason}` },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: "open_nurse_queue",
            text: { type: "plain_text", text: "Open in nurse queue" },
            url: link.toString(),
          },
        ],
      },
    ],
  };
}
export async function sendSlackAlert(
  alert: Alert,
  fetcher: typeof fetch = fetch,
): Promise<AlertStatus> {
  if (!slackConfigured()) {
    console.error("Slack alert skipped: configuration unavailable", {
      ticket_id: alert.ticket.ticket_id,
    });
    return "unconfigured";
  }
  try {
    const { webhook, app } = settings();
    const response = await fetcher(webhook.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alertPayload(alert, app)),
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Slack alert failed", {
        ticket_id: alert.ticket.ticket_id,
        status: response.status,
      });
      return "failed";
    }
    return "sent";
  } catch {
    // Never log the exception, webhook URL, payload or Slack response body.
    console.error("Slack alert failed", { ticket_id: alert.ticket.ticket_id });
    return "failed";
  }
}
export async function sendVisitorAlerts(
  client: AirtableClient,
  batch: LogBatch,
  saved: RecordRow[],
  tickets: Ticket[],
  send: typeof sendSlackAlert = sendSlackAlert,
): Promise<"none" | "sent" | "failed" | "limit"> {
  const transfers = batch.events
    .map((event, index) => ({ event, row: saved[index] }))
    .filter(
      ({ event }) =>
        event.action === "sent_to_nurse" && event.role === "Support rep",
    );
  if (!transfers.length) return "none";
  try {
    // Use durable Decisions, not process memory. Reset/reload/cold starts don't
    // replenish the quota. Attempts (including failed Slack posts) count.
    const firstThree = await client.list("Decisions", {
      filterByFormula: `AND({session_id}='${batch.session_id}',{action}='sent_to_nurse',{role}='Support rep')`,
      "sort[0][field]": "at",
      "sort[0][direction]": "asc",
      maxRecords: "3",
    });
    let limited = false,
      failed = false;
    for (const { event, row } of transfers) {
      if (!row || !firstThree.some((r) => r.id === row.id)) {
        limited = true;
        continue;
      }
      const ticket = tickets.find((t) => t.ticket_id === event.ticket_id)!;
      const status = await send({
        ticket,
        // Older open demo tabs may omit the clock; use the original demo wait,
        // never the shared Airtable seed timestamp, in that case.
        receivedAt:
          event.ticket_received_at ?? Date.now() - ticket.demo_wait_min * 60000,
        repReason: event.note || "A Support rep requested nurse review.",
        demo: true,
      });
      if (status !== "sent") failed = true;
    }
    return limited ? "limit" : failed ? "failed" : "sent";
  } catch {
    // Keep successful Decisions writes and fail closed if quota cannot be read.
    console.error("Slack visitor alert skipped: quota check failed");
    return "failed";
  }
}
