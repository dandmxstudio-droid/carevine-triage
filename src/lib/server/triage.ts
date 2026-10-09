import "server-only";
import fs from "node:fs";
import path from "node:path";
import { aiSchema } from "../ai-schema";
import { callLLM, triageModel, type ModelCall } from "../llm";
import { redact, crisisMatches, hasPersonalDetails } from "../redact";
import type { AIResult, SeedTicket, Ticket } from "../types";
import type { AirtableClient } from "./airtable-core";

export type TriageOutcome = {
  ai: AIResult;
  valid_json: boolean;
  safety_override: boolean;
  model: string;
  latency_ms: number;
  run_at: string;
  warnings: string[];
};
const handoff =
  "The Triage Tool couldn't process this message. Please review it.";
export function fallbackResult(): AIResult {
  return {
    crisis: false,
    clinical: "no",
    category: null,
    subcategory: null,
    priority: "normal",
    route: "Member Support",
    confidence: "low",
    language: "en",
    member_mood: "calm",
    article_ids: [],
    draft_reply: null,
    handoff_note: handoff,
    kb_gap: null,
    flagged_phrases: [],
    reason: handoff,
  };
}
export function safeResult(
  value: AIResult,
  message: string,
  firstName: string,
) {
  const ai = structuredClone(value);
  let safety_override = false;
  const crisis = crisisMatches(message);
  if (crisis.length) {
    ai.crisis = true;
    ai.flagged_phrases = crisis.slice(0, 3).map((phrase) => {
      const index = message.toLowerCase().replaceAll("’", "'").indexOf(phrase);
      return message.slice(index, index + phrase.length);
    });
    safety_override = true;
  }
  if (ai.crisis) {
    if (
      ai.route !== "Nurse - urgent" ||
      ai.priority !== "urgent" ||
      ai.draft_reply
    )
      safety_override = true;
    ai.route = "Nurse - urgent";
    ai.priority = "urgent";
    ai.draft_reply = null;
    ai.reason = crisis.length
      ? "Crisis language detected. A nurse needs to respond now."
      : ai.reason;
  } else if (ai.clinical !== "no") {
    if (!ai.route.startsWith("Nurse") || ai.draft_reply) safety_override = true;
    ai.route = ai.priority === "urgent" ? "Nurse - urgent" : "Nurse";
    ai.draft_reply = null;
  } else if (ai.route.startsWith("Nurse") && ai.draft_reply) {
    ai.draft_reply = null;
    safety_override = true;
  }
  if (ai.draft_reply) {
    ai.draft_reply = ai.draft_reply.replaceAll("[NAME]", firstName);
    if (hasPersonalDetails(ai.draft_reply)) {
      ai.draft_reply = null;
      ai.handoff_note =
        "The draft contained a hidden tag or personal detail. Please write a reply.";
      safety_override = true;
    }
  }
  return { ai, safety_override };
}
export function ticketState(ai: AIResult): {
  queue: Ticket["queue"];
  status: Ticket["status"];
} {
  return ai.route.startsWith("Nurse")
    ? { queue: "Nurse", status: "With nurse" }
    : {
        queue: "Support",
        status: ai.draft_reply ? "Draft ready" : "Needs rep",
      };
}
export async function triageTicket(
  ticket: Pick<SeedTicket, "message" | "member_first_name">,
  call: ModelCall = callLLM,
): Promise<TriageOutcome> {
  const started = Date.now();
  const system = fs.readFileSync(
    path.join(process.cwd(), "prompts/system_prompt.md"),
    "utf8",
  );
  const helpCenter = fs.readFileSync(
    path.join(process.cwd(), "data/carevine_help_center.md"),
    "utf8",
  );
  const cleaned = redact(ticket.message, ticket.member_first_name);
  let ai = fallbackResult(),
    valid_json = false;
  const warnings: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let value: unknown;
    try {
      value = await call(system, helpCenter, cleaned.text, attempt === 1);
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : "The model call failed.",
      );
      break; // Transport errors/429 are not retried, avoiding duplicate charges.
    }
    const parsed = aiSchema.safeParse(value);
    if (parsed.success) {
      ai = parsed.data;
      valid_json = true;
      break;
    }
    if (attempt === 1)
      warnings.push(
        "Invalid structured output after one retry. Needs rep fallback used.",
      );
  }
  const safe = safeResult(ai, cleaned.text, ticket.member_first_name);
  return {
    ...safe,
    valid_json,
    warnings,
    model: triageModel(),
    latency_ms: Date.now() - started,
    run_at: new Date().toISOString(),
  };
}
export function resultFields(
  outcome: TriageOutcome,
  ticketRecordId: string,
  model = outcome.model,
) {
  return {
    ...outcome.ai,
    ticket: [ticketRecordId],
    article_ids: JSON.stringify(outcome.ai.article_ids),
    flagged_phrases: JSON.stringify(outcome.ai.flagged_phrases),
    run_at: outcome.run_at,
    model,
    latency_ms: outcome.latency_ms,
    valid_json: outcome.valid_json,
    safety_override: outcome.safety_override,
    raw_json: JSON.stringify(outcome.ai),
  };
}
export async function recordTriage(
  client: AirtableClient,
  outcome: TriageOutcome,
  recordId: string,
) {
  const rows = await client.write("AI Results", [
    { fields: resultFields(outcome, recordId) },
  ]);
  if (!rows[0]?.id)
    throw new Error("Airtable did not confirm the AI Results row.");
  try {
    await client.write(
      "Tickets",
      [
        {
          id: recordId,
          fields: { ...ticketState(outcome.ai), claimed_by: "" },
        },
      ],
      "update",
    );
  } catch {
    outcome.warnings.push(
      "AI Results was saved, but the live ticket status could not be updated. No retry was made.",
    );
  }
  if (outcome.ai.kb_gap) {
    try {
      await client.write("KB Gaps", [
        {
          fields: {
            ticket: [recordId],
            at: outcome.run_at,
            article_ids: JSON.stringify(outcome.ai.article_ids),
            gap: outcome.ai.kb_gap,
            flagged_by: "Triage Tool",
            status: "New",
            session_id: "",
          },
        },
      ]);
    } catch {
      outcome.warnings.push(
        "AI Results was saved, but the KB Gap could not be logged. No retry was made.",
      );
    }
  }
  return rows[0].id;
}
