import "server-only";
import type { Decision } from "../types";
import type { AirtableClient, Fields } from "./airtable-core";
import { crisisTemplate } from "../mock-results";
import { decisionActions } from "./schema";
export type LogBatch = { session_id: string; events: Decision[] };
export function parseBatch(value: unknown, ids: string[]): LogBatch {
  if (!value || typeof value !== "object") throw new Error("Invalid batch.");
  const batch = value as LogBatch;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      batch.session_id || "",
    ) ||
    !Array.isArray(batch.events) ||
    !batch.events.length ||
    batch.events.length > 10
  )
    throw new Error("Invalid batch.");
  const events = batch.events.map((e): Decision => {
    if (
      !e ||
      !ids.includes(e.ticket_id) ||
      !decisionActions.some((a) => a === e.action) ||
      !Number.isFinite(e.at) ||
      !Number.isFinite(new Date(e.at).getTime()) ||
      !["Support rep", "Nurse"].includes(e.role)
    )
      throw new Error("Invalid decision.");
    const nurseActions = [
      "claimed",
      "crisis_reply_sent",
      "call_logged",
      "sent_back_to_support",
      "send_back_undone",
    ];
    if (nurseActions.includes(e.action) && e.role !== "Nurse")
      throw new Error("Invalid role.");
    const event: Decision = {
      ticket_id: e.ticket_id,
      at: e.at,
      action: e.action,
      role: e.role,
      person: e.role === "Nurse" ? "Maya Brooks, RN" : "Julia Lee",
    };
    for (const key of [
      "note",
      "from_value",
      "to_value",
      "final_reply",
    ] as const) {
      if (e[key] !== undefined) {
        if (typeof e[key] !== "string" || e[key].length > 10000)
          throw new Error("Invalid detail.");
        event[key] = e[key];
      }
    }
    if (
      e.action === "sent_to_nurse" &&
      (e.role !== "Support rep" || !event.note?.trim())
    )
      throw new Error("A Support rep reason is required.");
    if (e.action === "sent_to_nurse" && e.ticket_received_at !== undefined) {
      if (
        !Number.isFinite(e.ticket_received_at) ||
        e.ticket_received_at < 0 ||
        !Number.isFinite(new Date(e.ticket_received_at).getTime())
      )
        throw new Error("Invalid ticket arrival time.");
      event.ticket_received_at = e.ticket_received_at;
    }
    if (e.action === "crisis_reply_sent") event.final_reply = crisisTemplate;
    if (e.draft_useful !== undefined) {
      if (!["Yes", "No"].includes(e.draft_useful))
        throw new Error("Invalid feedback.");
      event.draft_useful = e.draft_useful;
    }
    if (e.gap) {
      if (
        e.action !== "gap_flagged" ||
        typeof e.gap.text !== "string" ||
        !e.gap.text.trim() ||
        e.gap.text.length > 10000 ||
        !Array.isArray(e.gap.article_ids) ||
        e.gap.article_ids.length > 18 ||
        e.gap.article_ids.some((id) => !/^KB-\d{3}$/.test(id))
      )
        throw new Error("Invalid gap.");
      event.gap = e.gap;
    }
    return event;
  });
  return { session_id: batch.session_id, events };
}
export async function logDecisions(
  client: AirtableClient,
  batch: LogBatch,
  recordIds: Record<string, string>,
) {
  const serverTime = Date.now();
  const records = batch.events.map((e, index) => {
    const ticket = recordIds[e.ticket_id];
    if (!ticket) throw new Error("Unknown ticket.");
    const fields: Fields = {
      ticket: [ticket],
      at: new Date(
        e.action === "sent_to_nurse" ? serverTime + index : e.at,
      ).toISOString(),
      person: e.person,
      role: e.role,
      action: e.action,
      session_id: batch.session_id,
    };
    for (const key of [
      "note",
      "from_value",
      "to_value",
      "final_reply",
      "draft_useful",
    ] as const)
      if (e[key] !== undefined) fields[key] = e[key];
    return { fields };
  });
  const saved = await client.write("Decisions", records);
  const gaps = batch.events
    .filter((e) => e.action === "gap_flagged" && e.gap)
    .map((e) => ({
      fields: {
        ticket: [recordIds[e.ticket_id]],
        article_ids: JSON.stringify(e.gap!.article_ids),
        gap: e.gap!.text,
        flagged_by: e.person,
        at: new Date(e.at).toISOString(),
        status: "New",
        session_id: batch.session_id,
      },
    }));
  await client.write("KB Gaps", gaps);
  return saved;
}
