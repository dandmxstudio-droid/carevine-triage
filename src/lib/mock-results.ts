import type { AIResult } from "./types";
const base: AIResult = {
  crisis: false,
  clinical: "no",
  category: "app",
  subcategory: "sync",
  priority: "normal",
  route: "Member Support",
  confidence: "high",
  language: "en",
  member_mood: "calm",
  article_ids: [],
  draft_reply: null,
  handoff_note: null,
  kb_gap: null,
  flagged_phrases: [],
  reason: "",
};
const result = (overrides: Partial<AIResult>): AIResult => ({
  ...base,
  ...overrides,
});
// Deliberately fixed Phase 1 results. These never call an external service.
export const mockResults: Record<string, AIResult> = {
  "CV-10009": result({
    category: "device",
    subcategory: "setup",
    article_ids: ["KB-006"],
    draft_reply:
      "Hi [NAME], welcome to Carevine! Your cuff sends readings automatically. Sit with your feet flat and your back supported, and rest for 5 minutes. Wrap the cuff on your bare upper arm about one inch above your elbow, with the tube down the inside of your arm. Keep it snug, with room for two fingers underneath. Press Start and stay still and quiet. Wait for the signal icon; your reading is sent automatically. Reply here if you need more help.",
    reason:
      "Device setup question that matches KB-006, with no health content.",
  }),
  "CV-10035": result({
    subcategory: "login",
    priority: "high",
    confidence: "low",
    member_mood: "frustrated",
    article_ids: ["KB-001"],
    draft_reply:
      "Hi [NAME], sorry you're having trouble signing in. Make sure you're using the latest version of the app. If the reset link has expired, request a new one and open it on the same phone where the app is installed. Reset links expire after 30 minutes and can only be used once. If you still can't sign in, reply here and we'll reset your account manually.",
    reason:
      "The member already reset their password. KB-001 gives follow-up steps, but the support rep may need to reset the account manually.",
  }),
  "CV-10003": result({
    category: "scheduling",
    subcategory: "appointment",
    article_ids: ["KB-015"],
    draft_reply:
      "Hi [NAME], to reschedule your Thursday coaching call, open your appointment in Care Team > Upcoming in the app and tap Reschedule. Please change appointments at least 4 hours ahead. Reply here if you need help.",
    reason:
      "Rescheduling question fully covered by KB-015, with no health content.",
  }),
  "CV-10020": result({
    category: "device",
    subcategory: "supplies",
    article_ids: ["KB-011"],
    draft_reply:
      "Hi [NAME], sorry your supply order hasn't arrived. Please wait 24 hours after it's marked delivered, as carriers sometimes mark packages early. If it still hasn't arrived, reply here and Member Support will send a replacement shipment.",
    reason:
      "Missing supply delivery covered by KB-011, with no health content.",
  }),
  "CV-10039": result({
    category: "billing",
    subcategory: "charge",
    priority: "high",
    route: "Member Support - Billing lead",
    confidence: "medium",
    article_ids: ["KB-012", "KB-010"],
    draft_reply:
      "Hi [NAME], Carevine is provided at no cost through your employer. The exception is a device replacement fee: one lost or damaged device replacement per year is free, and after that a $25 fee applies to the card on file. Devices with a defect are replaced free of charge. If this charge doesn't look right, reply here so Member Support can check it.",
    reason:
      "KB-012 and KB-010 explain the program cost and replacement fee; a billing lead should check the charge.",
  }),
  "CV-10033": result({
    category: "billing",
    subcategory: "refund",
    priority: "high",
    route: "Member Support - Billing lead",
    confidence: "low",
    article_ids: ["KB-012", "KB-013"],
    handoff_note:
      "Member was charged twice this month and wants one charge refunded. Confirm the refund policy: KB-012 says 5 business days; KB-013 says 10.",
    kb_gap:
      "KB-012 and KB-013 give different refund times (5 vs 10 business days). Update them to match.",
    reason:
      "Conflicting refund articles require the billing lead to confirm the policy before replying.",
  }),
  "CV-10037": result({
    category: "device",
    subcategory: "malfunction",
    priority: "high",
    confidence: "low",
    article_ids: ["KB-008", "KB-010"],
    handoff_note:
      "Member reports error E-3 on every meter test and needs device troubleshooting. KB-008 covers GM-200 error codes and does not list E-3; confirm the model and current guidance.",
    kb_gap:
      "KB-008 is outdated and only covers GM-200 error codes. Add current meter guidance, including E-3.",
    reason:
      "The outdated KB-008 does not cover E-3, so a support rep must review the device issue.",
  }),
  "CV-10059": result({
    category: "billing",
    subcategory: "eligibility",
    route: "Member Support - Billing lead",
    confidence: "low",
    article_ids: ["KB-014"],
    handoff_note:
      "Member wants to know if their spouse, who is on the same health plan, can join the program.",
    kb_gap: "No article on adding a spouse or dependents.",
    reason:
      "KB-014 does not explain spouse eligibility; the billing lead must check coverage.",
  }),
  "CV-10067": result({
    category: "scheduling",
    subcategory: "appointment",
    confidence: "low",
    article_ids: ["KB-015", "KB-016"],
    handoff_note:
      "Member wants coaching calls in Spanish. A support rep needs to confirm language availability.",
    kb_gap:
      "No article explains availability or booking of Spanish-language coaching calls.",
    reason:
      "The help center covers scheduling but not coaching languages, so a support rep must confirm availability.",
  }),
  "CV-10018": result({
    clinical: "yes",
    category: null,
    subcategory: null,
    priority: "urgent",
    route: "Nurse",
    flagged_phrases: ["over 300", "really dizzy"],
    reason:
      "Mentions high readings for two days and dizziness. A nurse needs to review the message with no draft.",
  }),
  "CV-10004": result({
    clinical: "yes",
    category: null,
    subcategory: null,
    priority: "urgent",
    route: "Nurse",
    flagged_phrases: ["reading of 54", "shaky and sweaty"],
    reason:
      "Mentions a low reading and physical symptoms. Routed to nurses with no draft.",
  }),
  "CV-10012": result({
    clinical: "yes",
    category: null,
    subcategory: null,
    priority: "high",
    route: "Nurse",
    flagged_phrases: ["missed two days of my insulin", "ran out"],
    reason:
      "Missed insulin and medication access require a nurse, with no draft.",
  }),
  "CV-10084": result({
    clinical: "yes",
    category: null,
    subcategory: null,
    priority: "high",
    route: "Nurse",
    flagged_phrases: ["tingling and numb"],
    reason:
      "New physical symptoms require a nurse to review the message, with no draft.",
  }),
  "T-01": result({
    crisis: true,
    clinical: "yes",
    category: null,
    subcategory: null,
    priority: "urgent",
    route: "Nurse - urgent",
    flagged_phrases: [
      "don't see the point anymore",
      "thoughts of hurting myself",
    ],
    reason:
      "Crisis language detected in a member message. A nurse needs to respond now.",
  }),
  "T-02": result({
    priority: "high",
    member_mood: "upset",
    article_ids: ["KB-003"],
    draft_reply:
      "Hi [NAME], I'm sorry you've had to contact us repeatedly about your missing readings. Your readings saved on the device are never lost. Pull down on the Readings screen to refresh, check that the device shows the signal icon after a reading, and make sure your app is up to date. Without a signal icon, the reading is saved and sends automatically when signal returns. If readings are missing for more than 24 hours, reply with the date and approximate time of the missing readings so we can help.",
    reason:
      "Repeat sync problem that matches KB-003; upset tone detected, so the draft opens with an apology.",
  }),
  "T-03": result({
    confidence: "medium",
    language: "es",
    article_ids: ["KB-003"],
    draft_reply:
      "Hi [NAME], tus lecturas normalmente aparecen en la app en 5 minutos. Desliza hacia abajo en la pantalla Lecturas para actualizar. Revisa que el dispositivo muestre el icono de señal después de una lectura y asegúrate de que la app esté actualizada. Si no hay señal, la lectura queda guardada y se enviará automáticamente cuando regrese. Las lecturas guardadas no se pierden. Si faltan lecturas por más de 24 horas, responde con la fecha y la hora aproximada de las lecturas que faltan.",
    kb_gap: "No Spanish version of KB-003.",
    reason:
      "Spanish message about readings not syncing. Matches KB-003, translated because no Spanish article exists.",
  }),
};
export const crisisTemplate =
  "We're here for you. If you're in immediate danger, call 911. You can call or text 988 at any time to reach the Suicide and Crisis Lifeline. A Carevine nurse is reaching out to you now.";
