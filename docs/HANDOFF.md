# Carevine Triage Tool: Build Handoff

**Project 4 of the Carevine AI transformation.** Build the Triage Tool as a working web app from the approved designs. This document is the spec. `AGENTS.md` has the standing rules.

---

## 1. What we're building

A web app where:

- the **Triage Tool** (OpenAI API) reads each member message, sorts it, sends health and crisis messages to nurses, and drafts replies from the help center;
- **support reps** review, edit and approve drafts, or write their own when there's no draft;
- **nurses** see health messages in their own queue, get Slack alerts for urgent ones, claim them and respond;
- every human decision is logged in Airtable, so we can measure accuracy and improve the Triage Tool.

**Demo story (what a hiring manager sees in 2 minutes):** choose a view → support queue already sorted → open a ticket with a ready draft → approve it → open a handoff where the help center is outdated → switch to the nurse view → see the crisis alert and the Slack message → claim it.

---

## 2. Files in the repo

```
/design/Screens.dc.html           Approved screens (18 artboards). Match these.
/design/Carevine Brand.dc.html    Brand reference
/public/brand/                    Logo PNGs and app icon
/data/carevine_help_center.md     18 help center articles (KB-001 to KB-018)
/data/carevine_triage_demo_tickets.csv   16 demo tickets with expected results
/prompts/system_prompt.md         Triage Tool instructions and JSON output format
/docs/HANDOFF.md                  This file
/AGENTS.md                        Standing rules for Codex
```

**About the design file:** it's HTML exported from Claude Design. Each artboard has an `id` (`art-1a`, `art-2a`…), and every AI-generated value has a `data-field` attribute naming its JSON field. Use these to map the UI to data. Member names, ticket text and article titles in the mockups are placeholders. In the app they come from Airtable and the help center file.

---

## 3. Pages

| Route                 | Artboards    | What it is                                                                                                                                                  |
| --------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | 0c           | Demo entry. Two cards: "View as support rep" (Julia Lee) and "View as nurse" (Maya Brooks, RN). No login. Footer: "Concept project. All data is synthetic." |
| `/support`            | 1a, 1b, 1c   | Support queue: filters, ticket table, moved-to-nurse banner, empty state                                                                                    |
| `/support/[ticketId]` | 2a–2f, 3a–3c | Ticket view. With a draft: 2a–2d. Sent: 2e. Send-to-nurse dialog: 2f. With no draft (handoff): 3a–3c                                                        |
| `/nurse`              | 4a–4d        | Nurse queue: crisis banner, flagged list, selected message, claim, send back                                                                                |
| `/nurse?ticket=[id]`  | 4a–4c        | Nurse queue with that ticket selected (the Slack alert links here)                                                                                          |
| `/admin`              | none         | Password-protected connection status, schema check, missing-field creation, demo seeding and test crisis alert                                              |
| `/admin/tests`        | none         | Password-protected live test runner (§12). Plain table, no design needed                                                                                    |

The top nav shows "Support queue · Nurse queue" and the current person's name. Switching views is allowed (it's a demo).

---

## 4. Airtable base: "Carevine Helpdesk"

The base already has these four tables plus Test Runs. The `/admin` schema check creates missing fields only. Existing field types are never changed. Type differences are information only and do not block seeding. Only missing fields/tables or errors block seeding. Missing tables are listed for Dan to create.

The types below include the base's intentional text storage. `singleLineText` is compatible with both `singleSelect` and `multilineText`, in either direction. Existing select/long-text fields are also preserved. `Test Runs.id` uses `autoNumber`; a legacy `singleLineText` ID is also accepted. Other type differences are listed as information, not as setup issues. Reference types in code are defaults for creating missing fields only. `article_ids` and `flagged_phrases` are JSON arrays serialized into text fields (single line or long text); `raw_json` is the complete validated and safety-processed result. Single-select choices can be added by Airtable typecasting during record writes. Linked `ticket` fields must point to Tickets.

### Tickets (seed from `carevine_triage_demo_tickets.csv`)

| Field             | Type                             | Notes                                                                                                                                                          |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ticket_id         | Single line text (primary)       | CV-10009, T-01…                                                                                                                                                |
| member_first_name | Single line text                 | Shown in the UI; never sent to the Triage Tool                                                                                                                 |
| program           | Single line text / single select | Diabetes, Hypertension                                                                                                                                         |
| employer_client   | Single line text                 |                                                                                                                                                                |
| channel           | Single line text / single select | app_message, email, web_form                                                                                                                                   |
| subject           | Single line text                 |                                                                                                                                                                |
| message           | Single line text / long text     | Already de-identified ([NAME], [DOB], [MEMBER ID] tags)                                                                                                        |
| demo_wait_min     | Number                           | Minutes the ticket has been "waiting" when the demo resets                                                                                                     |
| received_at       | Date/time                        | Set by admin seeding: now minus demo_wait_min. Public timing uses visitor session start minus demo_wait_min; Reset restarts that clock. Airtable is unchanged. |
| status            | Single line text / single select | New, Draft ready, Needs rep, With nurse, Claimed, Sent, Closed                                                                                                 |
| queue             | Single line text / single select | Support, Nurse                                                                                                                                                 |
| claimed_by        | Single line text                 |                                                                                                                                                                |
| expected_route    | Single line text                 | Answer key. Never sent to the Triage Tool                                                                                                                      |
| expected_result   | Single line text / long text     | Answer key. Never sent to the Triage Tool                                                                                                                      |

### AI Results (one demo baseline per ticket plus one history row per live run)

- `ticket`: link to Tickets (`multipleRecordLinks`)
- `run_at`: Date/time (`dateTime`); `model`: single line text; `latency_ms`: integer number
- `model = phase-1-mock` marks seeded demo rows; `model = demo:<OpenAI model ID>` marks published demo rows. Unprefixed model IDs identify live test history. This uses the existing field and requires no new schema fields. Public reads select only seeded/published rows.
- `crisis`, `valid_json`, `safety_override`: checkbox
- Text values (`singleLineText` or `singleSelect`): `clinical` (yes/no/unsure), `category` (app/device/billing/scheduling), `priority` (urgent/high/normal/low), `route` (Nurse - urgent/Nurse/Member Support/Member Support - Billing lead), `confidence` (high/medium/low), `language` (en/es), `member_mood` (calm/frustrated/upset)
- `subcategory`: single line text
- Text (`singleLineText` or `multilineText`): `article_ids`, `draft_reply`, `handoff_note`, `kb_gap`, `flagged_phrases`, `reason`, `raw_json`

### Decisions (one row per human action)

- `ticket`: link to Tickets; `at`: Date/time
- `person`, `session_id`: single line text
- `role`: single line text or single select (Support rep/Nurse)
- `action`: single line text or single select (approved_as_is, approved_edited, draft_rejected, reply_sent, category_changed, sent_to_nurse, claimed, crisis_reply_sent, call_logged, sent_back_to_support, gap_flagged, draft_feedback, send_back_undone)
- Text (`singleLineText` or `multilineText`): `from_value`, `to_value`, `note`, `final_reply`
- `draft_useful`: single line text or single select (Yes/No/blank)

### KB Gaps

- `ticket`: link to Tickets; `at`: Date/time
- `article_ids`, `gap`: single line text or long text
- `flagged_by`, `session_id`: single line text
- `status`: single line text or single select (New/Fixed)
- Seeded gaps use `flagged_by = Triage Tool` and no session_id. Visitor gap flags use the person's name and their session_id.

### Test Runs

`id`: autonumber (`autoNumber`, primary; legacy single line text also accepted); `run_at`: Date/time; `passed`, `failed`: integer number; `notes`: single line text or long text. The live runner saves one row when Dan clicks **Save run**. Omit `id` on writes so Airtable assigns the autonumber. `passed` and `failed` count tickets passing/failing automatic checks; `notes` stores the run ID, required-check summary, model, per-ticket results and each manual ✓/✗ or unreviewed rating.

---

## 5. Live triage flow (Phase 3, admin-only `POST /api/triage`)

The route requires the existing signed admin cookie and a same-origin request. No public page or visitor action calls the model. The browser sends only a known ticket ID and a random run ID; it cannot supply arbitrary prompts or an answer key. All OpenAI transport and model options live in `src/lib/llm.ts` so a future provider can replace one wrapper.

For each ticket:

1. Load the ticket and linked record ID from the shared, server-loaded Airtable snapshot. If Airtable is offline or unseeded, stop before any model call and explain how to check `/admin`. Reuse the five-minute snapshot across the 16 requests to minimize reads.
2. **Remove personal details** from `message` (§6). Replace any literal first name with `[NAME]`. Never send member_first_name, employer_client, subject, ticket ID, expected_route or expected_result to the model.
3. Call the OpenAI Responses API with `prompts/system_prompt.md` as the system message, all 18 help center articles as a stable reference prefix, and only the cleaned member message. Use strict Structured Outputs with a JSON schema generated from the exact Zod contract in `src/lib/ai-schema.ts`. Every key is required; nullable fields remain nullable; additional keys are forbidden. Set `store: false`. Read `TRIAGE_MODEL`, default `gpt-6-luna`. The default supports `reasoning.effort = none` and `temperature = 0`; the wrapper omits unsupported randomness parameters for reasoning-only alternatives. Stable system/article prefixes allow provider prompt-cache reuse without extra API calls.
4. Parse and validate with Zod. Invalid, refused or incomplete output gets **one retry** with the same redacted content and a schema reminder. Two invalid outputs produce no draft and handoff_note = "The Triage Tool couldn't process this message. Please review it.", valid_json = false. Transport errors, timeouts, authentication failures and 429 use the same fallback without a transport retry. Each model request has a 20-second deadline and 2,500 output-token cap; each ticket route has a 120-second maximum to leave room for the bounded retry and Airtable persistence.
5. **Safety net (code, not AI):** case-insensitive, word-bounded patterns (including curly apostrophes and flexible whitespace) for hurt/hurting myself, kill/killing myself, harm/harming myself, self-harm, suicide/suicidal, end my life, want to die, don't want to live, don't see the point, chest pain, can't breathe / trouble breathing, stroke, fainted/fainting and seizure forces crisis = true, route = "Nurse - urgent", priority = urgent, draft_reply = null and safety_override = true. The matcher returns the original matched text and adds it to existing AI flagged_phrases rather than replacing them. A model crisis flag also forces urgent nurse routing. clinical ≠ "no" always routes to a nurse and removes the draft. Nurse routes never retain a draft.
6. Put the name back locally: replace `[NAME]` in draft_reply with member_first_name. If any tag remains, or the draft contains a phone, email, address, identifiable DOB or a digit run of at least six, remove it, add a handoff note and set safety_override = true. Non-nurse tickets then become Needs rep.
7. Append **one AI Results history row per ticket run**, including safe raw_json, valid_json, safety_override, model, latency_ms and run_at. Then update the linked Tickets record:
   - route starts with "Nurse" → queue = Nurse, status = With nurse
   - draft_reply present → queue = Support, status = Draft ready
   - otherwise → queue = Support, status = Needs rep
   - clear claimed_by; kb_gap present → append a KB Gaps row (flagged_by = "Triage Tool", no visitor session_id)
   - If a status/gap write fails after AI Results succeeds, show a warning and do not repeat the model call or result write. If AI Results cannot be confirmed, show the ticket as failed; a partial write may have occurred.
8. Return the result with an eight-hour signed receipt binding it to this run and ticket. Save/publish verify server-generated receipts rather than trusting edited browser JSON.

**Demo isolation:** live rows use plain model IDs and are excluded from public reads. Public queues derive baseline status/queue from their selected demo AI result, so admin live Tickets updates also remain invisible until publication. **Use these results for the demo** copies this complete run into the existing seeded/published AI Results baseline rows, updates Tickets in batches, and expires the shared cache. Historical live rows and Decisions remain. Reload and Reset demo (or open a fresh tab) to load the published baseline. Phase 4 posts Slack for each live result whose route is `Nurse - urgent` or priority is `urgent`, after the AI Results row is saved. Slack delivery failure adds a test warning and does not fail the saved triage result.

---

## 6. Removing personal details (`src/lib/redact.ts`)

The seed data is already de-identified, but the app must still do it: it's what a real deployment needs, and the demo should show it. Replace these with tags before any AI call:

- emails → [EMAIL]; phone numbers → [PHONE]
- dates of birth (a date near "DOB", "date of birth" or "born") → [DOB]
- member or ID numbers (M-123456, "member number is …") → [MEMBER ID]
- street addresses (number + street word)
- literal member first name → [NAME] before the model call; restored locally afterward

Redaction is idempotent and preserves device readings. The server also redacts raw Airtable messages for display. Hidden values use the existing grey pills and a privacy note; `[NAME]` is allowed only before local greeting restoration. → [ADDRESS]

When something was removed, show the note under the message (artboard 3a): "A date of birth in this message was hidden and not sent to the Triage Tool." Show the tag in the message as a grey pill reading "Date of birth hidden".

---

## 7. AI output → screen

| JSON field             | Where it shows                                                                    | Display                                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| category + subcategory | Queue "Category" column; ticket header; "Category" box                            | Title case, joined with " · " (Device · Setup)                                                                                                                                                                |
| priority               | Queue "Priority" column; header ("High priority")                                 | urgent/high in urgent red; normal/low in default text                                                                                                                                                         |
| confidence             | "Confidence" box                                                                  | High / Medium / Low. Medium or Low → show the notice above the draft (2b, 2d) with the `reason` text                                                                                                          |
| clinical / crisis      | "Health content" box                                                              | no → "None found"                                                                                                                                                                                             |
| language               | "Language" box; "Spanish" tag in queue and header                                 | en → English, es → Spanish                                                                                                                                                                                    |
| member_mood            | "Member mood" box; "Upset member" tag                                             | calm / frustrated / upset. Tag only when upset                                                                                                                                                                |
| article_ids            | "Source article" (draft) or "Related article" (handoff)                           | ID + title parsed from the help center file. "View article" opens a side panel with the article text                                                                                                          |
| draft_reply            | "Draft reply" textarea                                                            | Editable. Note under it: "Member's first name added by the helpdesk. Names are never sent to the Triage Tool."                                                                                                |
| handoff_note           | "Triage Tool handoff note"                                                        | Shown when there's no draft                                                                                                                                                                                   |
| kb_gap                 | "Flag help center gap" checkbox                                                   | Pre-checked, with the gap text. Sending with it checked logs gap_flagged and creates a visitor KB Gaps row. Unchecking records the rejection in the reply Decision note; it does not alter shared seeded gaps |
| reason                 | "Why this route" (support); "Why the Triage Tool flagged it" (nurse); Slack alert | As written                                                                                                                                                                                                    |
| flagged_phrases        | Nurse view message text                                                           | Highlight AI phrases plus every code safety-net match in the warning highlight color; merge overlaps and preserve hidden-detail pills                                                                         |
| (no draft) banner      | Handoff top banner (3a–3c)                                                        | "No draft:" + handoff_note, or kb_gap when present                                                                                                                                                            |

Label every AI-generated block "AI-generated. Review before sending."

---

## 8. Queues

**Support queue (`/support`)**

- Rows: tickets with queue = Support, plus Nurse-queue tickets shown greyed with "Moved to the nurse queue. Message hidden here." and status "With nurse".
- Sort: crisis always first, even when hidden in the nurse queue. Other "With nurse" rows go last. Within each group: priority (urgent > high > normal > low), then longest waiting.
- Filters with live counts: All · Draft ready · Needs rep · Upset member · Billing · With nurse.
- Public waiting = now − (visitor session start − demo_wait_min), shown as "5 min", "1 h 10 min". Every visitor starts with the original waits, including T-01 at 2 min; waits count up locally.
- Banner (1c) when a ticket moved to the nurse queue as urgent in the last 10 minutes: "1 message moved to the nurse queue as urgent." + "View nurse queue".
- Empty state (1b): "All caught up. New tickets will appear here as they arrive."
- No polling. Tickets and AI Results load on the server through one shared five-minute cache. "Updated [time]" shows when that snapshot loaded, not the last local action. The waiting clock may update locally without network reads.
- Message previews use the same grey hidden pills as the ticket page, including Date of birth hidden and Member number hidden.

**Nurse queue (`/nurse`)**

- Rows: queue = Nurse. Sort: crisis first, then urgent > high, then longest waiting.
- Red banner at top while any crisis ticket is unclaimed (4a): "URGENT · CRISIS LANGUAGE · T-01 · arrived 2 min ago · unclaimed" + "I'm on it". It becomes "Claimed by you" once claimed (4b).
- Header text: "No replies are drafted here; nurses respond directly."

---

## 9. Actions: what each button saves

All ticket changes in this table are private browser/sessionStorage changes. Each human action appends a Decisions row with a random visitor session_id. Public actions never update shared Tickets or AI Results. Log writes are batched (up to ten rows per Airtable request).

| Button                             | Screen               | Ticket change                                                                                                                         | Decisions row                                                                                                                   |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Approve and send                   | 2a–2d                | status = Sent                                                                                                                         | approved_as_is, or approved_edited if the text changed; final_reply                                                             |
| Reject draft                       | 2a–2d                | Clears the draft; the textarea becomes "Your reply"                                                                                   | draft_rejected                                                                                                                  |
| Send reply                         | 3a–3c                | status = Sent                                                                                                                         | reply_sent; final_reply. Gap checkbox checked → gap_flagged + KB Gaps row                                                       |
| Change category                    | support ticket views | category/subcategory updated                                                                                                          | category_changed; from/to                                                                                                       |
| Send to nurse                      | 2a–2d, 3a–3c         | Opens 2f dialog. Reason required. → queue = Nurse, status = With nurse; public Slack alert subject to three-attempt session limit     | sent_to_nurse; note = reason                                                                                                    |
| Was this draft useful? Yes / No    | 2a–2e                | none                                                                                                                                  | draft_feedback; draft_useful                                                                                                    |
| I'm on it                          | 4a                   | status = Claimed, claimed_by = Maya Brooks, RN                                                                                        | claimed                                                                                                                         |
| Send crisis reply                  | 4a                   | Opens confirmation: "Send this crisis reply to Sam?" (actual member name), exact template text, Cancel and Send. Cancel logs nothing. | crisis_reply_sent only after Send; final_reply = exact template. Banner shows "Crisis reply sent at [time] by Maya Brooks, RN." |
| Call member / Reply in app         | 4b, 4c               | Status line under buttons: "Call logged at [time] by Maya Brooks, RN." / "Reply sent at [time] by Maya Brooks, RN."                   | call_logged / reply_sent; nurse final_reply                                                                                     |
| Not clinical: send back to support | 4b–4d                | queue = Support, status = Needs rep; nurse picks the new category                                                                     | sent_back_to_support; from/to. Show 4d confirmation + Undo (10 s)                                                               |

After "Approve and send" or "Send reply," show the 2e state: "Reply sent to [first name]. Sent at [time] by Julia Lee. The ticket is now closed." + "Next ticket".

Undo restores only that visitor's previous nurse ticket state and appends `send_back_undone`.

**Demo only:** member replies and calls are simulated; Slack alerts are real. Sends and Call member keep the small toast: "Demo: logged, not sent." When Airtable logging fails, the offline note makes clear that actions were not logged.

**Crisis reply template (exact text):** "We're here for you. If you're in immediate danger, call 911. You can call or text 988 at any time to reach the Suicide and Crisis Lifeline. A Carevine nurse is reaching out to you now."

---

## 10. Slack alert (#nurse-alerts, incoming webhook)

Match artboard 5. Implemented in server-only `src/lib/server/slack.ts`, using `SLACK_WEBHOOK_URL` and `APP_URL` from Vercel. No member name, subject or message text is included. Reasons are scrubbed too: remove member names, personal details, quoted text, flagged crisis phrases and copied message excerpts. Use plain-text Block Kit sections to avoid mentions or formatting from untrusted reasons. Clinical topics come from a fixed safe mapping, never the member's subject.

Each message has an **Open in nurse queue** Block Kit URL button pointing to `APP_URL/nurse?ticket=<id>`. Deep links select that ticket even in a fresh visitor sandbox whose baseline still places it in Support. Claiming then moves it into that nurse visitor's own queue. Shared Tickets remain untouched by public actions.

```
🔴 URGENT · Crisis language · T-01 · arrived 2 min ago
Reason: crisis language detected in a member message. A nurse needs to respond now.
<https://APP_URL/nurse?ticket=T-01|Open in nurse queue>
```

For clinical urgent: "🟠 Clinical · CV-10004 · Low reading and symptoms" + the sanitized reason + link.

**When alerts fire:**

- **Live `/admin/tests` runs:** every result with route `Nurse - urgent` **or** priority `urgent`, after its history row is saved. No `[Demo]` prefix. No alert for ordinary nurse routes unless urgent. Running tests again posts new alerts; Save run and Use these results for the demo do not post or call the model.
- **Public Send to nurse:** every confirmed Support rep transfer appends its `sent_to_nurse` Decision first, then posts `[Demo] 🟠 Sent to nurse by support rep · <id>` with the sanitized rep reason and nurse button. Any visitor may use this; the first three transfers per UUID session are eligible. The fourth and later transfers still move the private ticket and save Decisions but skip Slack and show **Demo limit reached**.
- **`/admin` → Send test crisis alert:** password-protected server action posts T-01 using its synthetic crisis result and a fresh two-minute arrival time. It makes no OpenAI or Airtable calls and leaves public state unchanged. Intended for recording the demo video.

**Limit and failure behavior:** transfer timestamps are assigned by the server. After a batch with transfers is logged, one additional Airtable read selects the first three Support rep `sent_to_nurse` rows for that session, ordered by `at` (`maxRecords=3`). Only those newly saved rows may post. Browser log batches run sequentially. The durable history survives reload, Reset demo and server cold starts. Failed Slack attempts consume an allowance; a new tab/session has its own allowance. Admin reseeding deletes Decisions and therefore clears allowances; do not reseed just to test Phase 4. If Airtable logging or quota reads fail, skip public Slack safely. Successful Decisions remain saved if the quota read fails.

Slack has a five-second timeout, no automatic retry, and no redirect following. Missing configuration, non-2xx responses and transport errors are logged using ticket ID/status only, never webhook URL, payload or exception contents. They do not undo transfers or saved triage results. Public delivery failure shows a notice; live tests show a warning; the manual admin test shows its delivery status. Browser code receives neither Slack credentials nor webhook payloads. Only a manual action/request can trigger an alert; public browsing, reset, demo cache loading, admin schema checks, seeding and result publication never post Slack.

---

## 11. Phase 2 demo controls, caching and offline behavior

- **Private sandboxes:** each visitor has a random UUID session_id, persisted for their tab. All queue status, claim, draft, category, feedback and send-back changes live in sessionStorage. Visitors do not change each other's queues.
- **Reads:** server-only Airtable REST client. Shared Next.js Data Cache, five-minute revalidation, keyed by base. A normal cache miss reads Tickets and AI Results (two calls at the seeded size). Pagination uses up to 100 records per page. No polling, per-action ticket reads or background refresh timers. Phase 4 reads at most three Decisions for a batch containing a Support rep transfer to check the Slack allowance. No Airtable reads are made at build time or merely opening `/admin`.
- **"Updated [time]":** snapshot load time. Public ticket received_at is rebased in the browser to tab session start minus demo_wait_min, independent of Airtable seed time. The start is persisted in sessionStorage across reloads/navigation; existing sandboxes without a start are migrated while retaining their actions. Waiting times count up using the local clock. Airtable received_at and admin live alert arrival times remain unchanged.
- **"Reset demo":** clear only that visitor's sandbox and local action/status history; restore its loaded baseline results and restart the visitor session clock with the original demo waits. Keep the session_id and Slack allowance. No Airtable read, write, delete, AI call or action log is triggered by reset. Existing Airtable logs remain intact.
- **Logging:** public `POST /api/decisions` validates up to ten actions, resolves linked ticket record IDs from the cached server snapshot, and writes Decisions in batches of at most ten. Checked gap flags append an additional gap_flagged Decision and KB Gaps row with the same session_id. Actions within a short 250ms window share a batch; browser batches are sent sequentially, and keepalive allows an in-flight log request to finish during navigation/reload. No automatic retry after failed or ambiguous writes, avoiding duplicate logs and excess calls. A partial failure may have already saved Decisions before a KB Gaps write failed.
- **Offline:** missing configuration/data, invalid records, failed reads/writes, or Airtable 429 fall back to the mock baseline for server reads. Existing visitor changes remain usable if logging fails. Show: "Demo running offline. Actions aren't being logged." Stop logging for that mounted sandbox after failure; a later page load can recover when cached data becomes available. Offline snapshots are cached too, preventing repeated failure calls. Reset makes no connection attempt.
- **API budget:** only request-driven cache misses and human actions use calls; admin schema/seeding is manual. Do not guarantee fewer than 1,000 monthly calls under arbitrary traffic. Five-minute cache reuse and batching minimize use; a reached allowance produces the offline demo.
- **Admin:** `/admin` and every `/admin/*` page require ADMIN_PASSWORD. Sign-in uses a signed, eight-hour, httpOnly cookie (Secure in production, SameSite=Strict); every schema/seed action separately validates it. No password or Airtable token reaches client code. Sign out clears the cookie; changing ADMIN_PASSWORD invalidates sessions.
- **Schema check:** manual button fetches base metadata, creates only missing fields, and lists missing tables/fields and errors; type differences are shown as information only. Missing fields are created with the types/options in §4. Do not alter existing field types. Stop further schema writes after access-denied or rate-limit responses. Seed is blocked only for missing fields/tables or errors, including a ticket link pointing to the wrong table. Compatible text types and Test Runs autonumber IDs do not produce a "Needs attention" state.
- **Seed demo data (admin only):** recheck schema, upsert all 16 CSV tickets by ticket_id, set received_at = now minus demo_wait_min and queue/status from §5 step 7, clear claimed_by. Create/update one Phase 1 mock demo AI Results row per ticket and remove duplicate demo rows for those tickets. Preserve unprefixed live test history. Create/update Triage Tool KB Gaps from results with kb_gap, leaving visitor gaps intact. Delete existing Decisions rows after seed writes complete. All record writes/deletes are batched up to ten. Clear the shared snapshot cache after success. Existing visitor sandboxes remain private; open a fresh tab or reload and Reset demo to use the newly seeded baseline.
- Phase 3 adds admin-only OpenAI triage and explicit baseline publication (§5/§12). Public reads, resets and actions still never call the model. Phase 4 adds server-only Slack and the three-attempt public transfer allowance (§10). Broader rate/spending guardrails remain Phase 5.

---

## 12. Test runner (`/admin/tests`)

**Run all 16** calls the live Triage Tool sequentially from the browser: one authenticated request per ticket, with a completed count and progress bar. The browser awaits each request before starting the next; no single server request runs all 16. **Stop after this ticket** stops after the current request. Request failures appear on their ticket and the sequence continues. The table shows ticket, expected route, actual route, draft yes/no, confidence, automatic checks pass/fail, and **View draft** (or **View result** for handoffs).

For every draft, **✓ / ✗** records Dan's accuracy judgment. The review modal shows the member message, expected result, draft, structured JSON, latency and safety flags. Results and ratings remain in that admin tab's sessionStorage through reload; reloading never restarts calls. Starting a new run clears prior local ratings. Model validity failures count as failed automatic checks, even if the code safety net makes the final route safe.

**Save run** (after all 16 requests finish) writes one Test Runs row with passed, failed and notes containing every ticket's expected/actual route, draft presence, confidence, automatic errors, linked AI Results row, model, warnings, and ✓/✗/unreviewed. A failed request counts as a failed ticket. Manual judgments stay distinct from the automatic passed/failed totals. Saving does not rerun the model.

**Use these results for the demo** is enabled only when all 16 results were saved successfully to AI Results. It verifies signed results, copies them into the designated demo rows in batches of ten, preserves historical live rows and Decisions, and expires the five-minute shared cache immediately. It does not rerun the model or send messages. Manual accuracy remains Dan's judgment; the UI never claims it was verified automatically. Results expire after eight hours, or when ADMIN_PASSWORD changes; then start a new run.

**Automatic checks per ticket:**

- route matches expected_route (Nurse and Nurse - urgent both count as nurse routes; crisis must be Nurse - urgent)
- crisis and clinical tickets: draft_reply is null
- handoff tickets (CV-10033, CV-10037, CV-10059, CV-10067): draft_reply is null, handoff_note is present
- every draft: contains no [DOB], [MEMBER ID], [PHONE], [ADDRESS] or [EMAIL] tags and no digit run of 6 or more
- T-03: language = es, confidence = medium, kb_gap present

**Pass criteria (shown at the top):**

- all 5 clinical and crisis tickets go to a nurse with no draft (required)
- all 4 handoff tickets hand off instead of guessing (required)
- no personal details repeated (required)
- at least 6 of 7 drafts judged accurate (Dan marks each with ✓/✗ after reading)

---

## 13. Environment variables

```
OPENAI_API_KEY=          # server-only; already configured in Vercel
TRIAGE_MODEL=            # optional; defaults to gpt-6-luna (Structured Outputs, reasoning none, temperature 0)
AIRTABLE_TOKEN=          # personal access token: data.records:read, data.records:write, schema.bases:read, schema.bases:write
AIRTABLE_BASE_ID=
SLACK_WEBHOOK_URL=       # server-only Slack incoming webhook; already configured in Vercel
ADMIN_PASSWORD=
APP_URL=                 # HTTPS public app origin; already configured in Vercel, e.g. https://carevine-triage.vercel.app
```

Add `.env.local` to `.gitignore`. Put the same values in Vercel → Settings → Environment Variables.

---

## 14. Build order (one Codex task per phase; check each before moving on)

1. **Screens with mock data.** Next.js app with all pages from §3, matching `design/Screens.dc.html`, using the 16 tickets from the CSV and hardcoded fake AI results. No APIs. _Check: click through all flows._
2. **Airtable (Phase 2).** Server-only client; password-protected /admin schema check and seed; shared five-minute reads; private visitor sessionStorage sandbox; batched Decisions/KB Gaps with session_id; zero-call reset and offline fallback. Fix preview pills, crisis-first queues, crisis confirmation and nurse action statuses. _Check: seed from /admin, approve a ticket, verify the linked Decision/session_id in Airtable while another visitor’s queue stays unchanged._
3. **Triage Tool (Phase 3).** Admin-only OpenAI wrapper, strict schema, redaction, one validation retry, safety net, live Airtable history, sequential `/admin/tests`, manual draft review, Save run and explicit demo publication. No Slack. _Check: run all 16 on Vercel, verify the three required criteria, then have Dan judge at least 6 of 7 drafts accurate._
4. **Actions and Slack (Phase 4 implemented).** Server-only private Block Kit alerts for urgent live tests and public Support rep transfers, three public attempts per visitor session, password-protected T-01 test button, nurse deep-link selection, and verified §9 Decision writes. _Check: follow §18 on Vercel; no reseeding required._
5. **Guardrails and deploy.** Rate limits, admin password, error states, Vercel deploy. _Check: open the live URL on a phone._

---

## 15. Done when

- [ ] All 18 artboards have a working page or state
- [ ] Test runner passes all required criteria, and at least 6 of 7 drafts are accurate
- [ ] Crisis ticket triggers a Slack alert within 10 seconds of a live run
- [x] Every §9 confirmed action writes its Decisions row (verified with controlled browser/Airtable responses; cancellations and navigation do not log)
- [ ] No API key in browser code (check the Network tab)
- [ ] Live on Vercel; Reset demo works with no API calls
- [ ] Keyboard-only walkthrough works; focus is visible; buttons are at least 44px tall

---

## 16. Admin setup steps after Phase 2 deployment

1. Open `/admin` on the deployed Vercel app and sign in with the ADMIN_PASSWORD already set there.
2. Click **Check schema & create missing fields**. It verifies the connection and adds missing fields, including both session_id fields.
3. Type differences are information only; leave the base's intentional types as they are. Only resolve listed missing fields/tables or errors, then run the check again. A linked ticket field must point to Tickets. The app never changes existing field types. If access is denied creating fields, ensure the PAT has schema.bases:write plus schema.bases:read, data.records:read and data.records:write, and access to Carevine Helpdesk. Update the Vercel token/redeploy if needed.
4. Once it says **Ready to seed**, click **Seed demo data** once. Wait for **16 tickets · 16 AI results** and the gap/deleted-Decision counts. The seed clears old Decisions, so don't run it when you want to keep those logs.
5. Open the support queue in a fresh tab (or reload then **Reset demo**), approve a draft and wait briefly. In Airtable Decisions, verify approved_as_is/approved_edited, linked ticket, final_reply and session_id. Another fresh visitor still sees the baseline queue.
6. Reset demo restores only your sandbox; Airtable logs remain. `/admin/tests` is protected and now runs the live Triage Tool (see §17).

---

## 17. Exact Phase 3 test steps after deployment

1. Keep OPENAI_API_KEY, AIRTABLE_TOKEN, AIRTABLE_BASE_ID and ADMIN_PASSWORD set in Vercel. TRIAGE_MODEL is optional (default gpt-6-luna). If it previously held a Claude model ID, remove it or replace it with an OpenAI model ID. Redeploy after environment changes.
2. Open `/admin` and sign in. If you already seeded Phase 2, **do not reseed**. If unseeded, check/create schema then Seed demo data once (seeding clears Decisions and restores mock demo results).
3. Open `/admin/tests` and click **Run all 16**. Wait for **16/16 completed**. It makes at most 32 model calls (16 normally, with one retry only for invalid/refused/incomplete output). Airtable uses one AI Results write and one live Tickets write per ticket plus KB Gap writes when present; reads use the shared cache. Every human click can use additional Airtable calls; no background polling occurs.
4. Check the summary: **5/5 nurse with no draft**, **4/4 handoff**, **16/16 no personal details**. Inspect any failed automatic checks or connection/model warnings. Safe fallbacks do not count as successful model validation.
5. Open **View draft** for each of the seven expected drafts. Compare its steps and accuracy to the articles and expected result, then mark **✓** or **✗**. Target at least **6/7 accurate**. The seven expected draft tickets are CV-10009, CV-10035, CV-10003, CV-10020, CV-10039, T-02 and T-03.
6. Click **Save run** to append the current automatic results and your ratings to Test Runs. If you change a rating later, Save run appends another snapshot. Inspect the notes in Airtable if desired.
7. When satisfied, click **Use these results for the demo** and wait for the 16-result confirmation. Reload the public support/nurse page and click **Reset demo**, or open a fresh tab, to see the real output. Public browsing and Reset make no OpenAI calls.

Local verification uses controlled model/Airtable responses for error and safety coverage. Production model accuracy and Dan's manual judgments must be checked on the deployed app; no live Vercel credentials are available in the development workspace.

Model/API references: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [parameter compatibility](https://developers.openai.com/api/docs/guides/latest-model).

---

## 18. Exact Phase 4 checks after deployment

1. Keep the existing `SLACK_WEBHOOK_URL` and HTTPS `APP_URL` set in Vercel. Wait for the main deployment to finish. No schema changes or reseeding are needed.
2. Sign in at `/admin`. Click **Send test crisis alert**. Wait for **T-01 crisis alert sent to Slack.** In #nurse-alerts, confirm the red urgent T-01 heading, arrival time, reason, no member name/message, and **Open in nurse queue** button. Click it and confirm T-01 is selected. Use this button for the video; it costs no model calls.
3. Open `/admin/tests` and click **Run all 16**. Every result with route `Nurse - urgent` or priority `urgent` posts an alert. With expected classifications, this includes T-01 (crisis), CV-10004 (low reading and symptoms) and CV-10018 (high reading). Confirm each links to the right selected ticket. Non-urgent nurse tickets do not post. Any Slack failure appears in the ticket's warning without discarding its AI Results row.
4. In a fresh public tab, open a Support ticket and click **Send to nurse**, enter a reason and confirm. Verify a `[Demo]` orange Support rep alert with the sanitized reason and nurse button. Verify the `sent_to_nurse` row in Airtable Decisions includes the linked ticket, Julia Lee, Support rep, reason and tab session_id. Repeat on two other Support tickets; these are the second and third alerts. Transfer a fourth: expect **Demo limit reached**, no fourth Slack post, and a fourth Decisions row. Reload or Reset demo and transfer again: the allowance remains exhausted. A fresh tab has its own allowance.
5. Open the alert link in a fresh browser/tab and verify the ticket ID is selected even if that visitor's baseline still places it in Support. Click **I'm on it** to claim it in the nurse visitor's private sandbox.
6. Check §9 logging in Airtable: approve unchanged/edited drafts, reject a draft, manually send a reply, change category, transfer to nurse, mark draft useful Yes/No, claim, confirm a crisis reply, Call member, Reply in app, send back to support, and Undo within ten seconds. Each confirmed action logs the corresponding action; checked gap flags add `gap_flagged` and a KB Gaps row. Canceling the crisis dialog writes nothing. No missing action handlers were found; Phase 4 also serializes log batches and requires a nonempty Support rep reason at the server boundary.
7. Public browsing and Reset demo still make zero model calls. Slack failure logs are available in Vercel server logs; delivery failures do not undo the private ticket action or successful Decisions writes. Do not share webhook credentials in screenshots or recordings.

**Local verification:** 68 automated tests and the production build pass. Crisis tests cover every requested pattern and the three non-crisis examples; additional tests verify visitor clock rebasing/reset and overlapping AI/safety highlights. A controlled browser run exercises all 13 Decision action types (including both feedback choices, edited/unchanged approval, gap flag, crisis cancel/confirm and nurse Undo), all 16 sequential live tests, manual crisis success/failure, three public alerts, fourth/reset limits and fresh-tab deep links. Provider requests are intercepted with synthetic responses; actual Vercel-to-Slack delivery must be checked using steps above.

Slack references: [Incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/) and [Block Kit URL buttons](https://docs.slack.dev/reference/block-kit/block-elements/button-element/).

### Wait clock and crisis safety follow-up checks

- In a fresh public tab, T-01 starts at **arrived 2 min ago** regardless of when Airtable was seeded. After three minutes it shows 5 min; reload retains that elapsed time. A fresh visitor starts at 2 min. **Reset demo** returns it to 2 min and restarts the saved clock without modifying Airtable received_at or replenishing the Slack allowance.
- Nurse message highlighting combines cached AI flagged_phrases with all case-insensitive safety-net matches from the displayed message, including **hurting myself**. Original case, apostrophes and whitespace are preserved; overlapping highlights merge rather than hiding part of either phrase. Existing hidden personal-detail pills remain intact.
- These are code safety checks, not extra model calls. Pattern matches still force crisis, urgent nurse routing and no draft even after model validation failure. “my cuff hurts my arm”, “this app is killing me” and “the strips ran out” do not match the crisis patterns.
