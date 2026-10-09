import "server-only";
import {
  AirtableError,
  type AirtableClient,
  type Field,
  type Table,
} from "./airtable-core";
const text = (name: string): Field => ({ name, type: "singleLineText" });
const long = (name: string): Field => ({ name, type: "multilineText" });
const select = (name: string, names: string[]): Field => ({
  name,
  type: "singleSelect",
  options: { choices: names.map((name) => ({ name })) },
});
const number = (name: string): Field => ({
  name,
  type: "number",
  options: { precision: 0 },
});
const date = (name: string): Field => ({
  name,
  type: "dateTime",
  options: {
    dateFormat: { name: "iso" },
    timeFormat: { name: "24hour" },
    timeZone: "utc",
  },
});
const check = (name: string): Field => ({
  name,
  type: "checkbox",
  options: { icon: "check", color: "greenBright" },
});
export const decisionActions = [
  "approved_as_is",
  "approved_edited",
  "draft_rejected",
  "reply_sent",
  "category_changed",
  "sent_to_nurse",
  "claimed",
  "crisis_reply_sent",
  "call_logged",
  "sent_back_to_support",
  "gap_flagged",
  "draft_feedback",
  "send_back_undone",
] as const;
export function expectedSchema(ticketTableId: string): Record<string, Field[]> {
  const link = (): Field => ({
    name: "ticket",
    type: "multipleRecordLinks",
    options: { linkedTableId: ticketTableId },
  });
  return {
    Tickets: [
      text("ticket_id"),
      text("member_first_name"),
      select("program", ["Diabetes", "Hypertension"]),
      text("employer_client"),
      select("channel", ["app_message", "email", "web_form"]),
      text("subject"),
      long("message"),
      number("demo_wait_min"),
      date("received_at"),
      select("status", [
        "New",
        "Draft ready",
        "Needs rep",
        "With nurse",
        "Claimed",
        "Sent",
        "Closed",
      ]),
      select("queue", ["Support", "Nurse"]),
      text("claimed_by"),
      text("expected_route"),
      long("expected_result"),
    ],
    "AI Results": [
      link(),
      date("run_at"),
      text("model"),
      number("latency_ms"),
      check("crisis"),
      select("clinical", ["yes", "no", "unsure"]),
      select("category", ["app", "device", "billing", "scheduling"]),
      text("subcategory"),
      select("priority", ["urgent", "high", "normal", "low"]),
      select("route", [
        "Nurse - urgent",
        "Nurse",
        "Member Support",
        "Member Support - Billing lead",
      ]),
      select("confidence", ["high", "medium", "low"]),
      select("language", ["en", "es"]),
      select("member_mood", ["calm", "frustrated", "upset"]),
      long("article_ids"),
      long("draft_reply"),
      long("handoff_note"),
      long("kb_gap"),
      long("flagged_phrases"),
      long("reason"),
      long("raw_json"),
      check("valid_json"),
      check("safety_override"),
    ],
    Decisions: [
      link(),
      date("at"),
      text("person"),
      select("role", ["Support rep", "Nurse"]),
      select("action", [...decisionActions]),
      long("from_value"),
      long("to_value"),
      long("note"),
      long("final_reply"),
      select("draft_useful", ["Yes", "No"]),
      text("session_id"),
    ],
    "KB Gaps": [
      link(),
      long("article_ids"),
      long("gap"),
      text("flagged_by"),
      date("at"),
      select("status", ["New", "Fixed"]),
      text("session_id"),
    ],
    "Test Runs": [
      { name: "id", type: "autoNumber" },
      date("run_at"),
      number("passed"),
      number("failed"),
      long("notes"),
    ],
  };
}
export type SchemaReport = {
  connected: boolean;
  created: string[];
  missing: string[];
  differences: string[];
  errors: string[];
  ready: boolean;
  checked_at: number;
};
export function compatibleType(
  table: string,
  name: string,
  expected: string,
  actual: string,
) {
  if (expected === actual) return true;
  if (table === "Test Runs" && name === "id")
    return (
      ["singleLineText", "autoNumber"].includes(expected) &&
      ["singleLineText", "autoNumber"].includes(actual)
    );
  return (
    (expected === "singleLineText" &&
      ["singleSelect", "multilineText"].includes(actual)) ||
    (actual === "singleLineText" &&
      ["singleSelect", "multilineText"].includes(expected))
  );
}
export async function ensureSchema(
  client: AirtableClient,
): Promise<SchemaReport> {
  const report: SchemaReport = {
    connected: false,
    created: [],
    missing: [],
    differences: [],
    errors: [],
    ready: false,
    checked_at: Date.now(),
  };
  let tables: Table[];
  try {
    tables = await client.schema();
    report.connected = true;
  } catch (error) {
    report.errors.push(
      error instanceof Error ? error.message : "Schema check failed.",
    );
    return report;
  }
  const tickets = tables.find((t) => t.name === "Tickets");
  const expected = expectedSchema(tickets?.id || "");
  let writeBlocked = false;
  for (const [name, fields] of Object.entries(expected)) {
    const table = tables.find((t) => t.name === name);
    if (!table) {
      report.missing.push(`Table: ${name}`);
      continue;
    }
    for (const field of fields) {
      const existing = table.fields.find((f) => f.name === field.name);
      if (existing) {
        if (existing.type !== field.type)
          report.differences.push(
            `${name}.${field.name}: ${existing.type} (reference: ${field.type}; ${compatibleType(name, field.name, field.type, existing.type) ? "compatible" : "information only"})`,
          );
        else if (
          field.type === "multipleRecordLinks" &&
          existing.options?.linkedTableId !== tickets?.id
        )
          report.errors.push(`${name}.${field.name}: must link to Tickets`);
        continue;
      }
      if (field.type === "multipleRecordLinks" && !tickets) {
        report.missing.push(`${name}.${field.name}`);
        continue;
      }
      if (writeBlocked) {
        report.missing.push(`${name}.${field.name}`);
        continue;
      }
      try {
        await client.createField(table.id, field);
        report.created.push(`${name}.${field.name}`);
      } catch (error) {
        if (
          error instanceof AirtableError &&
          [401, 403, 429].includes(error.status)
        )
          writeBlocked = true;
        report.missing.push(`${name}.${field.name}`);
        report.errors.push(
          `${name}.${field.name}: ${error instanceof Error ? error.message : "Could not create field."}`,
        );
      }
    }
  }
  report.ready = !report.missing.length && !report.errors.length;
  return report;
}
