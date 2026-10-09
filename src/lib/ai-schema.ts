import { z } from "zod";

// Keep this contract identical to prompts/system_prompt.md, including nulls.
export const aiSchema = z
  .object({
    crisis: z.boolean(),
    clinical: z.enum(["yes", "no", "unsure"]),
    category: z.enum(["app", "device", "billing", "scheduling"]).nullable(),
    subcategory: z.string().nullable(),
    priority: z.enum(["urgent", "high", "normal", "low"]),
    route: z.enum([
      "Nurse - urgent",
      "Nurse",
      "Member Support",
      "Member Support - Billing lead",
    ]),
    confidence: z.enum(["high", "medium", "low"]),
    language: z.enum(["en", "es"]),
    member_mood: z.enum(["calm", "frustrated", "upset"]),
    article_ids: z.array(z.string()),
    draft_reply: z.string().nullable(),
    handoff_note: z.string().nullable(),
    kb_gap: z.string().nullable(),
    flagged_phrases: z.array(z.string()),
    reason: z.string(),
  })
  .strict();

export const aiJSONSchema = z.toJSONSchema(aiSchema);
