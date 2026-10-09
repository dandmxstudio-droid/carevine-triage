import { mockResults } from "./mock-results";
import type { DemoState, SeedTicket, Ticket } from "./types";
export const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
export function createDemo(seeds: SeedTicket[], now = 0): DemoState {
  return {
    tickets: seeds.map((seed) => {
      const ai = structuredClone(mockResults[seed.ticket_id]);
      if (!ai) throw new Error(`Missing mock result: ${seed.ticket_id}`);
      if (ai.crisis || ai.clinical !== "no") ai.draft_reply = null;
      const nurse = ai.route.startsWith("Nurse");
      return {
        ...seed,
        ai,
        queue: nurse ? "Nurse" : "Support",
        status: nurse
          ? "With nurse"
          : ai.draft_reply
            ? "Draft ready"
            : "Needs rep",
        claimed_by: null,
        received_at: now ? now - seed.demo_wait_min * 60000 : 0,
        final_reply: null,
        sent_at: null,
        draft_rejected: false,
        feedback: null,
        gap_flagged: !!ai.kb_gap,
        moved_at:
          nurse && ai.priority === "urgent" && now
            ? now - seed.demo_wait_min * 60000
            : null,
      };
    }),
    decisions: [],
  };
}
export function supportSort(a: Ticket, b: Ticket) {
  return (
    Number(b.ai.crisis) - Number(a.ai.crisis) ||
    Number(a.queue === "Nurse") - Number(b.queue === "Nurse") ||
    priorityOrder[a.ai.priority] - priorityOrder[b.ai.priority] ||
    a.received_at - b.received_at ||
    b.demo_wait_min - a.demo_wait_min
  );
}
export function nurseSort(a: Ticket, b: Ticket) {
  return (
    Number(b.ai.crisis) - Number(a.ai.crisis) ||
    priorityOrder[a.ai.priority] - priorityOrder[b.ai.priority] ||
    a.received_at - b.received_at ||
    b.demo_wait_min - a.demo_wait_min
  );
}
export const title = (s: string | null) =>
  s ? s[0].toUpperCase() + s.slice(1) : "";
export const category = (t: Ticket) =>
  t.ai.crisis
    ? "Crisis"
    : t.ai.category
      ? `${title(t.ai.category)}${t.ai.subcategory ? " · " + title(t.ai.subcategory) : ""}`
      : "Clinical";
export function nurseLabel(t: Ticket) {
  return t.ai.crisis
    ? "Crisis"
    : {
        "CV-10004": "Low reading",
        "CV-10018": "High reading",
        "CV-10012": "Medication",
        "CV-10084": "Symptom",
      }[t.ticket_id] || "Health concern";
}
export function waiting(t: Ticket, now: number) {
  const m =
    t.received_at && now
      ? Math.max(0, Math.floor((now - t.received_at) / 60000))
      : t.demo_wait_min;
  return m >= 60
    ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}`
    : `${m} min`;
}
export function visibleDraft(t: Ticket) {
  return (
    t.ai.draft_reply
      ?.replaceAll("[NAME]", t.member_first_name)
      .replace(/^Hi (.+),/, (m) =>
        t.ai.language === "es" ? m.replace(/^Hi /, "Hola ") : m,
      ) || ""
  );
}
export function checkResult(seed: SeedTicket) {
  const ai = mockResults[seed.ticket_id];
  const errors: string[] = [];
  if (!ai) return ["Missing result"];
  const match = seed.expected_route.startsWith("Nurse")
    ? ai.route.startsWith("Nurse")
    : ai.route === seed.expected_route;
  if (!match) errors.push("Route mismatch");
  if (
    seed.ticket_id === "T-01" &&
    (!ai.crisis || ai.route !== "Nurse - urgent")
  )
    errors.push("Crisis routing");
  if (
    (seed.expected_route.startsWith("Nurse") ||
      ai.crisis ||
      ai.clinical !== "no") &&
    ai.draft_reply
  )
    errors.push("Unsafe draft");
  if (
    ["CV-10033", "CV-10037", "CV-10059", "CV-10067"].includes(seed.ticket_id) &&
    (ai.draft_reply || !ai.handoff_note)
  )
    errors.push("Missing handoff");
  if (
    ai.draft_reply &&
    /\[(?:DOB|MEMBER ID|PHONE|ADDRESS|EMAIL|DATE_OF_BIRTH)\]|\d{6,}/.test(
      ai.draft_reply,
    )
  )
    errors.push("Personal detail repeated");
  if (
    seed.ticket_id === "T-03" &&
    (ai.language !== "es" || ai.confidence !== "medium" || !ai.kb_gap)
  )
    errors.push("Spanish handling");
  return errors;
}
