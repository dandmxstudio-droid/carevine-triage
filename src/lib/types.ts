export type AIResult = {
  crisis: boolean;
  clinical: "yes" | "no" | "unsure";
  category: "app" | "device" | "billing" | "scheduling" | null;
  subcategory: string | null;
  priority: "urgent" | "high" | "normal" | "low";
  route:
    | "Nurse - urgent"
    | "Nurse"
    | "Member Support"
    | "Member Support - Billing lead";
  confidence: "high" | "medium" | "low";
  language: "en" | "es";
  member_mood: "calm" | "frustrated" | "upset";
  article_ids: string[];
  draft_reply: string | null;
  handoff_note: string | null;
  kb_gap: string | null;
  flagged_phrases: string[];
  reason: string;
};
export type SeedTicket = {
  ticket_id: string;
  member_first_name: string;
  program: string;
  employer_client: string;
  channel: string;
  subject: string;
  message: string;
  demo_wait_min: number;
  expected_route: string;
  expected_result: string;
};
export type Article = { id: string; title: string; body: string };
export type Ticket = SeedTicket & {
  ai: AIResult;
  queue: "Support" | "Nurse";
  status: "Draft ready" | "Needs rep" | "With nurse" | "Claimed" | "Sent";
  claimed_by: string | null;
  received_at: number;
  final_reply: string | null;
  sent_at: number | null;
  draft_rejected: boolean;
  feedback: "Yes" | "No" | null;
  gap_flagged: boolean;
  moved_at: number | null;
};
export type Decision = {
  ticket_id: string;
  at: number;
  person: string;
  role: "Support rep" | "Nurse";
  action: string;
  note?: string;
  final_reply?: string;
  from_value?: string;
  to_value?: string;
};
export type DemoState = { tickets: Ticket[]; decisions: Decision[] };
