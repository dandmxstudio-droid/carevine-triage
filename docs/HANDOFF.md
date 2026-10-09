# Carevine Triage Tool: Build Handoff

**Project 4 of the Carevine AI transformation.** Build the Triage Tool as a working web app from the approved designs. This document is the spec. `AGENTS.md` has the standing rules.

---

## 1. What we're building

A web app where:

- the **Triage Tool** (Claude API) reads each member message, sorts it, sends health and crisis messages to nurses, and drafts replies from the help center;
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
| `/admin`              | none         | Password-protected connection status, schema check, missing-field creation and demo seeding                                                                 |
| `/admin/tests`        | none         | Password-protected mock test runner (§12). Plain table, no design needed                                                                                    |

The top nav shows "Support queue · Nurse queue" and the current person's name. Switching views is allowed (it's a demo).

---

## 4. Airtable base: "Carevine Helpdesk"

The base already has these four tables plus Test Runs. The `/admin` schema check creates missing fields only. Existing field types are never changed; mismatches are listed and block seeding until Dan resolves them. Missing tables are listed for Dan to create.

API type names below define the Phase 2 contract. `article_ids` and `flagged_phrases` are JSON arrays serialized into long text; `raw_json` is the complete mock result. Single-select choices can be added by Airtable typecasting during record writes. Linked `ticket` fields must point to Tickets.

### Tickets (seed from `carevine_triage_demo_tickets.csv`)

| Field             | Type                       | Notes                                                                                                  |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| ticket_id         | Single line text (primary) | CV-10009, T-01…                                                                                        |
| member_first_name | Single line text           | Shown in the UI; never sent to the Triage Tool                                                         |
| program           | Single select              | Diabetes, Hypertension                                                                                 |
| employer_client   | Single line text           |                                                                                                        |
| channel           | Single select              | app_message, email, web_form                                                                           |
| subject           | Single line text           |                                                                                                        |
| message           | Long text                  | Already de-identified ([NAME], [DOB], [MEMBER ID] tags)                                                |
| demo_wait_min     | Number                     | Minutes the ticket has been "waiting" when the demo resets                                             |
| received_at       | Date/time                  | Set by admin seeding: now minus demo_wait_min. Visitor resets only adjust the private browser sandbox. |
| status            | Single select              | New, Draft ready, Needs rep, With nurse, Claimed, Sent, Closed                                         |
| queue             | Single select              | Support, Nurse                                                                                         |
| claimed_by        | Single line text           |                                                                                                        |
| expected_route    | Single line text           | Answer key. Never sent to the Triage Tool                                                              |
| expected_result   | Long text                  | Answer key. Never sent to the Triage Tool                                                              |

### AI Results (one seeded mock row per ticket; future live runs may add rows)

- `ticket`: link to Tickets (`multipleRecordLinks`)
- `run_at`: Date/time (`dateTime`); `model`: single line text; `latency_ms`: integer number
- `crisis`, `valid_json`, `safety_override`: checkbox
- Single selects: `clinical` (yes/no/unsure), `category` (app/device/billing/scheduling), `priority` (urgent/high/normal/low), `route` (Nurse - urgent/Nurse/Member Support/Member Support - Billing lead), `confidence` (high/medium/low), `language` (en/es), `member_mood` (calm/frustrated/upset)
- `subcategory`: single line text
- Long text: `article_ids`, `draft_reply`, `handoff_note`, `kb_gap`, `flagged_phrases`, `reason`, `raw_json`

### Decisions (one row per human action)

- `ticket`: link to Tickets; `at`: Date/time
- `person`, `session_id`: single line text
- `role`: single select (Support rep/Nurse)
- `action`: single select (approved_as_is, approved_edited, draft_rejected, reply_sent, category_changed, sent_to_nurse, claimed, crisis_reply_sent, call_logged, sent_back_to_support, gap_flagged, draft_feedback, send_back_undone)
- Long text: `from_value`, `to_value`, `note`, `final_reply`
- `draft_useful`: single select (Yes/No/blank)

### KB Gaps

- `ticket`: link to Tickets; `at`: Date/time
- `article_ids`, `gap`: long text
- `flagged_by`, `session_id`: single line text
- `status`: single select (New/Fixed)
- Seeded gaps use `flagged_by = Triage Tool` and no session_id. Visitor gap flags use the person's name and their session_id.

### Test Runs

`id`: single line text; `run_at`: Date/time; `passed`, `failed`: integer number; `notes`: long text. Checked by Phase 2 setup; saving test runs and live triage remain Phase 3.

---

## 5. Future live triage flow (Phase 3 server route `POST /api/triage`)

Phase 2 seeds the Phase 1 fake JSON results. No Claude API or Slack calls are enabled. Step 7 below determines the seeded ticket status and queue. Public human actions change only the visitor sandbox and append Airtable logs (§9/§11).

For each ticket:

1. Load the ticket from Airtable.
2. **Remove personal details** from `message` (§6). Never include member_first_name, employer_client or the answer key fields.
3. Call the Claude API with `prompts/system_prompt.md` as the system prompt, all 18 help center articles in the user message (cache them with prompt caching), then the cleaned message. Temperature 0.
4. Parse and validate the JSON (zod). If it's invalid, retry once. If it's still invalid: status = Needs rep, handoff_note = "The Triage Tool couldn't process this message. Please review it.", valid_json = false.
5. **Safety net (code, not AI):** if the cleaned message matches a crisis word list (hurt myself, kill myself, suicide, end my life, don't see the point, chest pain, can't breathe, trouble breathing, stroke, fainted, seizure), force crisis = true, route = "Nurse - urgent", draft_reply = null and safety_override = true. If clinical ≠ "no" or crisis = true, always set draft_reply = null.
6. Put the name back: replace `[NAME]` in draft_reply with member_first_name. If any other tag ([DOB], [MEMBER ID], [PHONE]…) is still in the draft, remove the draft and set status = Needs rep.
7. Write the AI Results row, then update the ticket:
   - route starts with "Nurse" → queue = Nurse, status = With nurse
   - draft_reply present → queue = Support, status = Draft ready
   - otherwise → queue = Support, status = Needs rep
   - kb_gap present → also create a KB Gaps row (flagged_by = "Triage Tool")
8. If route = "Nurse - urgent" or priority = "urgent", send the Slack alert (§9).

---

## 6. Removing personal details (`lib/redact.ts`)

The seed data is already de-identified, but the app must still do it: it's what a real deployment needs, and the demo should show it. Replace these with tags before any AI call:

- emails → [EMAIL]; phone numbers → [PHONE]
- dates of birth (a date near "DOB", "date of birth" or "born") → [DOB]
- member or ID numbers (M-123456, "member number is …") → [MEMBER ID]
- street addresses (number + street word) → [ADDRESS]

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
| flagged_phrases        | Nurse view message text                                                           | Highlight each phrase (case-insensitive exact match) in the warning highlight color                                                                                                                           |
| (no draft) banner      | Handoff top banner (3a–3c)                                                        | "No draft:" + handoff_note, or kb_gap when present                                                                                                                                                            |

Label every AI-generated block "AI-generated. Review before sending."

---

## 8. Queues

**Support queue (`/support`)**

- Rows: tickets with queue = Support, plus Nurse-queue tickets shown greyed with "Moved to the nurse queue. Message hidden here." and status "With nurse".
- Sort: crisis always first, even when hidden in the nurse queue. Other "With nurse" rows go last. Within each group: priority (urgent > high > normal > low), then longest waiting.
- Filters with live counts: All · Draft ready · Needs rep · Upset member · Billing · With nurse.
- Waiting = now − received_at, shown as "5 min", "1 h 10 min".
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

| Button                             | Screen           | Ticket change                                                                                                                         | Decisions row                                                                                                                   |
| ---------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Approve and send                   | 2a–2d            | status = Sent                                                                                                                         | approved_as_is, or approved_edited if the text changed; final_reply                                                             |
| Reject draft                       | 2a–2d            | Clears the draft; the textarea becomes "Your reply"                                                                                   | draft_rejected                                                                                                                  |
| Send reply                         | 3a–3c            | status = Sent                                                                                                                         | reply_sent; final_reply. Gap checkbox checked → gap_flagged + KB Gaps row                                                       |
| Change category                    | all ticket views | category/subcategory updated                                                                                                          | category_changed; from/to                                                                                                       |
| Send to nurse                      | 2a–2d, 3a–3c     | Opens 2f dialog. Reason required. → queue = Nurse, status = With nurse; Slack deferred                                                | sent_to_nurse; note = reason                                                                                                    |
| Was this draft useful? Yes / No    | 2a–2e            | none                                                                                                                                  | draft_feedback; draft_useful                                                                                                    |
| I'm on it                          | 4a               | status = Claimed, claimed_by = Maya Brooks, RN                                                                                        | claimed                                                                                                                         |
| Send crisis reply                  | 4a               | Opens confirmation: "Send this crisis reply to Sam?" (actual member name), exact template text, Cancel and Send. Cancel logs nothing. | crisis_reply_sent only after Send; final_reply = exact template. Banner shows "Crisis reply sent at [time] by Maya Brooks, RN." |
| Call member / Reply in app         | 4b, 4c           | Status line under buttons: "Call logged at [time] by Maya Brooks, RN." / "Reply sent at [time] by Maya Brooks, RN."                   | call_logged / reply_sent; nurse final_reply                                                                                     |
| Not clinical: send back to support | 4b–4d            | queue = Support, status = Needs rep; nurse picks the new category                                                                     | sent_back_to_support; from/to. Show 4d confirmation + Undo (10 s)                                                               |

After "Approve and send" or "Send reply," show the 2e state: "Reply sent to [first name]. Sent at [time] by Julia Lee. The ticket is now closed." + "Next ticket".

Undo restores only that visitor's previous nurse ticket state and appends `send_back_undone`.

**Demo only:** nothing is actually sent to anyone. Sends and Call member keep the small toast: "Demo: logged, not sent." When Airtable logging fails, the offline note makes clear that actions were not logged.

**Crisis reply template (exact text):** "We're here for you. If you're in immediate danger, call 911. You can call or text 988 at any time to reach the Suicide and Crisis Lifeline. A Carevine nurse is reaching out to you now."

---

## 10. Slack alert (#nurse-alerts, incoming webhook)

Match artboard 5. No member name, no message text.

```
🔴 URGENT · Crisis language · T-01 · arrived 2 min ago
Reason: crisis language detected in a member message. A nurse needs to respond now.
<https://APP_URL/nurse?ticket=T-01|Open in nurse queue>
```

For clinical urgent: "🟠 Clinical · CV-10004 · Low reading and symptoms" + the reason + link. Use Slack Block Kit with a button for the link.

---

## 11. Phase 2 demo controls, caching and offline behavior

- **Private sandboxes:** each visitor has a random UUID session_id, persisted for their tab. All queue status, claim, draft, category, feedback and send-back changes live in sessionStorage. Visitors do not change each other's queues.
- **Reads:** server-only Airtable REST client. Shared Next.js Data Cache, five-minute revalidation, keyed by base. A normal cache miss reads Tickets and AI Results (two calls at the seeded size). Pagination uses up to 100 records per page. No polling, per-action ticket reads or background refresh timers. No Airtable reads are made at build time or merely opening `/admin`.
- **"Updated [time]":** snapshot load time. Waiting times use received_at and a local clock.
- **"Reset demo":** clear only that visitor's sandbox and local action/status history; restore its loaded baseline results and local waiting times. Keep the session_id. No Airtable read, write, delete, AI call or action log is triggered by reset. Existing Airtable logs remain intact.
- **Logging:** public `POST /api/decisions` validates up to ten actions, resolves linked ticket record IDs from the cached server snapshot, and writes Decisions in batches of at most ten. Checked gap flags append an additional gap_flagged Decision and KB Gaps row with the same session_id. Actions within a short 250ms window share a batch; keepalive handles navigation/reload. No automatic retry after failed or ambiguous writes, avoiding duplicate logs and excess calls. A partial failure may have already saved Decisions before a KB Gaps write failed.
- **Offline:** missing configuration/data, invalid records, failed reads/writes, or Airtable 429 fall back to the mock baseline for server reads. Existing visitor changes remain usable if logging fails. Show: "Demo running offline. Actions aren't being logged." Stop logging for that mounted sandbox after failure; a later page load can recover when cached data becomes available. Offline snapshots are cached too, preventing repeated failure calls. Reset makes no connection attempt.
- **API budget:** only request-driven cache misses and human actions use calls; admin schema/seeding is manual. Do not guarantee fewer than 1,000 monthly calls under arbitrary traffic. Five-minute cache reuse and batching minimize use; a reached allowance produces the offline demo.
- **Admin:** `/admin` and every `/admin/*` page require ADMIN_PASSWORD. Sign-in uses a signed, eight-hour, httpOnly cookie (Secure in production, SameSite=Strict); every schema/seed action separately validates it. No password or Airtable token reaches client code. Sign out clears the cookie; changing ADMIN_PASSWORD invalidates sessions.
- **Schema check:** manual button fetches base metadata, creates only missing fields, and lists missing tables, type/link mismatches and permission errors. Missing fields are created with the types/options in §4. Do not alter existing field types. Stop further schema writes after access-denied or rate-limit responses. Seed is blocked until the report is ready.
- **Seed demo data (admin only):** recheck schema, upsert all 16 CSV tickets by ticket_id, set received_at = now minus demo_wait_min and queue/status from §5 step 7, clear claimed_by. Create/update one Phase 1 mock AI Results row per ticket and remove duplicates for those tickets. Create/update Triage Tool KB Gaps from results with kb_gap, leaving visitor gaps intact. Delete existing Decisions rows after seed writes complete. All record writes/deletes are batched up to ten. Clear the shared snapshot cache after success. Existing visitor sandboxes remain private; open a fresh tab or reload and Reset demo to use the newly seeded baseline.
- No live re-run, Claude call, Slack alert, or triage endpoint is added in Phase 2. Those remain later phases. The future triage rate/spending limits remain as originally planned.

---

## 12. Test runner (`/admin/tests`)

In Phase 2, "Run all 16" checks the hardcoded Phase 1 results without Airtable or Claude calls. It shows a table: ticket, expected route, actual route, expected result, draft yes/no, confidence, pass/fail, and a "View draft" button. In Phase 3, run the live Triage Tool and save each run to Test Runs (id, run_at, passed, failed, notes).

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
ANTHROPIC_API_KEY=
TRIAGE_MODEL=            # a current Claude Sonnet model ID
AIRTABLE_TOKEN=          # personal access token: data.records:read, data.records:write, schema.bases:read, schema.bases:write
AIRTABLE_BASE_ID=
SLACK_WEBHOOK_URL=
ADMIN_PASSWORD=
APP_URL=                 # e.g. https://carevine-triage.vercel.app
```

Add `.env.local` to `.gitignore`. Put the same values in Vercel → Settings → Environment Variables.

---

## 14. Build order (one Codex task per phase; check each before moving on)

1. **Screens with mock data.** Next.js app with all pages from §3, matching `design/Screens.dc.html`, using the 16 tickets from the CSV and hardcoded fake AI results. No APIs. _Check: click through all flows._
2. **Airtable (Phase 2).** Server-only client; password-protected /admin schema check and seed; shared five-minute reads; private visitor sessionStorage sandbox; batched Decisions/KB Gaps with session_id; zero-call reset and offline fallback. Fix preview pills, crisis-first queues, crisis confirmation and nurse action statuses. _Check: seed from /admin, approve a ticket, verify the linked Decision/session_id in Airtable while another visitor’s queue stays unchanged._
3. **Triage Tool.** `/api/triage`, redaction, validation, safety net, and the `/admin/tests` runner. _Check: run all 16 and fix the prompt until the required criteria pass._
4. **Actions and Slack.** Every button in §9 and the Slack alert in §10. _Check: Send to nurse posts to Slack._
5. **Guardrails and deploy.** Rate limits, admin password, error states, Vercel deploy. _Check: open the live URL on a phone._

---

## 15. Done when

- [ ] All 18 artboards have a working page or state
- [ ] Test runner passes all required criteria, and at least 6 of 7 drafts are accurate
- [ ] Crisis ticket triggers a Slack alert within 10 seconds of a live run
- [ ] Every button writes a Decisions row
- [ ] No API key in browser code (check the Network tab)
- [ ] Live on Vercel; Reset demo works with no API calls
- [ ] Keyboard-only walkthrough works; focus is visible; buttons are at least 44px tall

---

## 16. Admin setup steps after Phase 2 deployment

1. Open `/admin` on the deployed Vercel app and sign in with the ADMIN_PASSWORD already set there.
2. Click **Check schema & create missing fields**. It verifies the connection and adds missing fields, including both session_id fields.
3. If the report lists a type/link mismatch, correct that field in Airtable yourself, then run the check again. The app never changes existing field types. If access is denied creating fields, ensure the PAT has schema.bases:write plus schema.bases:read, data.records:read and data.records:write, and access to Carevine Helpdesk. Update the Vercel token/redeploy if needed.
4. Once it says **Ready to seed**, click **Seed demo data** once. Wait for **16 tickets · 16 AI results** and the gap/deleted-Decision counts. The seed clears old Decisions, so don't run it when you want to keep those logs.
5. Open the support queue in a fresh tab (or reload then **Reset demo**), approve a draft and wait briefly. In Airtable Decisions, verify approved_as_is/approved_edited, linked ticket, final_reply and session_id. Another fresh visitor still sees the baseline queue.
6. Reset demo restores only your sandbox; Airtable logs remain. `/admin/tests` is also protected and still runs the local mock checks.
