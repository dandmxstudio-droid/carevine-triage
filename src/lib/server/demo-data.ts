import "server-only";
import { createDemo } from "../demo";
import type { AIResult, DemoSnapshot, SeedTicket, Ticket } from "../types";
import type { AirtableClient, Fields, RecordRow } from "./airtable-core";
import { isDemoResult, demoResultsFormula } from "./demo-results";
import { redact } from "../redact";
export type ServerSnapshot = DemoSnapshot & {
  recordIds: Record<string, string>;
};
const oneOf = (value: unknown, values: unknown[]) => values.includes(value);
export function parseAI(value: unknown): AIResult {
  if (!value || typeof value !== "object")
    throw new Error("Invalid AI result.");
  const r = value as AIResult;
  if (
    typeof r.crisis !== "boolean" ||
    !oneOf(r.clinical, ["yes", "no", "unsure"]) ||
    !oneOf(r.category, [null, "app", "device", "billing", "scheduling"]) ||
    !oneOf(r.priority, ["urgent", "high", "normal", "low"]) ||
    !oneOf(r.route, [
      "Nurse",
      "Nurse - urgent",
      "Member Support",
      "Member Support - Billing lead",
    ]) ||
    !oneOf(r.confidence, ["high", "medium", "low"]) ||
    !oneOf(r.language, ["en", "es"]) ||
    !oneOf(r.member_mood, ["calm", "frustrated", "upset"]) ||
    typeof r.reason !== "string"
  )
    throw new Error("Invalid AI result.");
  for (const k of [
    "subcategory",
    "draft_reply",
    "handoff_note",
    "kb_gap",
  ] as const)
    if (r[k] !== null && typeof r[k] !== "string")
      throw new Error("Invalid AI result.");
  for (const k of ["article_ids", "flagged_phrases"] as const)
    if (!Array.isArray(r[k]) || r[k].some((v) => typeof v !== "string"))
      throw new Error("Invalid AI result.");
  const ai = structuredClone(r);
  if (ai.crisis || ai.clinical !== "no") ai.draft_reply = null;
  return ai;
}
export function mapSnapshot(
  seeds: SeedTicket[],
  records: RecordRow[],
  results: RecordRow[],
  now = Date.now(),
): ServerSnapshot {
  const recordIds: Record<string, string> = {};
  const defaults = createDemo(seeds, now);
  const tickets = defaults.tickets.map((fallback): Ticket => {
    const row = records.find((r) => r.fields.ticket_id === fallback.ticket_id);
    if (!row) throw new Error("Demo data is not seeded.");
    recordIds[fallback.ticket_id] = row.id;
    const result = results
      .filter(isDemoResult)
      .filter((r) =>
        (r.fields.ticket as string[] | undefined)?.includes(row.id),
      )
      .sort(
        (a, b) =>
          Date.parse(String(b.fields.run_at)) -
          Date.parse(String(a.fields.run_at)),
      )[0];
    if (!result) throw new Error("Demo results are not seeded.");
    const ai = parseAI(JSON.parse(String(result.fields.raw_json)));
    const received = Date.parse(String(row.fields.received_at));
    if (!Number.isFinite(received)) throw new Error("Invalid ticket date.");
    const source = { ...fallback };
    for (const key of [
      "member_first_name",
      "program",
      "employer_client",
      "channel",
      "subject",
      "message",
      "expected_route",
      "expected_result",
    ] as const) {
      if (typeof row.fields[key] !== "string")
        throw new Error("Incomplete ticket data.");
      source[key] = row.fields[key] as string;
    }
    source.message = redact(source.message).text;
    const status = row.fields.status;
    const queue = row.fields.queue;
    if (
      !oneOf(status, [
        "Draft ready",
        "Needs rep",
        "With nurse",
        "Claimed",
        "Sent",
      ]) ||
      !oneOf(queue, ["Support", "Nurse"])
    )
      throw new Error("Invalid ticket state.");
    if (typeof row.fields.demo_wait_min !== "number")
      throw new Error("Invalid wait time.");
    return {
      ...source,
      demo_wait_min: row.fields.demo_wait_min,
      ai,
      received_at: received,
      // Live admin triage may update Tickets. Public queues use published AI only.
      status: ai.route.startsWith("Nurse")
        ? "With nurse"
        : ai.draft_reply
          ? "Draft ready"
          : "Needs rep",
      queue: ai.route.startsWith("Nurse") ? "Nurse" : "Support",
      claimed_by: null,
      gap_flagged: !!ai.kb_gap,
      moved_at:
        ai.route.startsWith("Nurse") && ai.priority === "urgent"
          ? received
          : null,
    };
  });
  return { tickets, recordIds, loaded_at: now, offline: false };
}
export async function readSnapshot(
  client: AirtableClient,
  seeds: SeedTicket[],
): Promise<ServerSnapshot> {
  const formula = `OR(${seeds.map((s) => `{ticket_id}='${s.ticket_id}'`).join(",")})`;
  const records = await client.list("Tickets", { filterByFormula: formula });
  const results = await client.list("AI Results", {
    filterByFormula: demoResultsFormula,
  });
  return mapSnapshot(seeds, records, results);
}
function reconcile(
  existing: RecordRow[],
  desired: { ticket: string; fields: Fields }[],
) {
  const create: { fields: Fields }[] = [],
    update: { id: string; fields: Fields }[] = [],
    remove: string[] = [];
  for (const item of desired) {
    const matches = existing.filter((r) =>
      (r.fields.ticket as string[] | undefined)?.includes(item.ticket),
    );
    if (matches[0]) update.push({ id: matches[0].id, fields: item.fields });
    else create.push({ fields: item.fields });
    remove.push(...matches.slice(1).map((r) => r.id));
  }
  return { create, update, remove };
}
export async function seedDemo(
  client: AirtableClient,
  seeds: SeedTicket[],
  now = Date.now(),
) {
  const previousAI = (
    await client.list("AI Results", { filterByFormula: demoResultsFormula })
  ).filter(isDemoResult);
  const previousGaps = await client.list("KB Gaps");
  const decisions = await client.list("Decisions", { "fields[]": "at" });
  const demo = createDemo(seeds, now);
  const rows = await client.write(
    "Tickets",
    demo.tickets.map((t) => ({
      fields: {
        ...Object.fromEntries(
          Object.entries(t).filter(([key]) =>
            Object.keys(seeds[0]).includes(key),
          ),
        ),
        received_at: new Date(t.received_at).toISOString(),
        status: t.status,
        queue: t.queue,
        claimed_by: "",
      },
    })),
    "upsert",
  );
  const ids = Object.fromEntries(
    rows.map((r) => [String(r.fields.ticket_id), r.id]),
  );
  if (seeds.some((s) => !ids[s.ticket_id]))
    throw new Error("Airtable did not return all seeded tickets.");
  const desired = demo.tickets.map((t) => ({
    ticket: ids[t.ticket_id],
    fields: {
      ...t.ai,
      ticket: [ids[t.ticket_id]],
      article_ids: JSON.stringify(t.ai.article_ids),
      flagged_phrases: JSON.stringify(t.ai.flagged_phrases),
      run_at: new Date(now).toISOString(),
      model: "phase-1-mock",
      latency_ms: 0,
      raw_json: JSON.stringify(t.ai),
      valid_json: true,
      safety_override: false,
    },
  }));
  const ai = reconcile(previousAI, desired);
  await client.write("AI Results", ai.update, "update");
  await client.write("AI Results", ai.create);
  await client.remove("AI Results", ai.remove);
  const managedGaps = previousGaps.filter(
    (r) =>
      r.fields.flagged_by === "Triage Tool" &&
      (r.fields.ticket as string[] | undefined)?.some((id) =>
        Object.values(ids).includes(id),
      ),
  );
  const gapItems = demo.tickets
    .filter((t) => t.ai.kb_gap)
    .map((t) => ({
      ticket: ids[t.ticket_id],
      fields: {
        ticket: [ids[t.ticket_id]],
        article_ids: JSON.stringify(t.ai.article_ids),
        gap: t.ai.kb_gap,
        flagged_by: "Triage Tool",
        at: new Date(now).toISOString(),
        status: "New",
        session_id: "",
      },
    }));
  const gaps = reconcile(managedGaps, gapItems);
  const desiredGapIds = gapItems.map((g) => g.ticket);
  gaps.remove.push(
    ...managedGaps
      .filter(
        (r) =>
          !(r.fields.ticket as string[]).some((id) =>
            desiredGapIds.includes(id),
          ),
      )
      .map((r) => r.id),
  );
  await client.write("KB Gaps", gaps.update, "update");
  await client.write("KB Gaps", gaps.create);
  await client.remove("KB Gaps", gaps.remove);
  // Delete decisions only after the seed writes complete. Reset never enters this function.
  await client.remove(
    "Decisions",
    decisions.map((r) => r.id),
  );
  return {
    tickets: rows.length,
    results: desired.length,
    gaps: gapItems.length,
    decisions_deleted: decisions.length,
  };
}
