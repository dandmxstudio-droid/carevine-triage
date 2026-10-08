# AGENTS.md: Carevine Triage Tool

Read `docs/HANDOFF.md` before any task. It is the build spec.

## What this is
A portfolio demo of an AI triage tool for Carevine Health, a fictional virtual chronic-care company. All data is synthetic. No real member data, and no real messages are ever sent to members.

## Words (use exactly these in UI, code comments and copy)
- **Triage Tool**: the AI. Never "agent", "bot" or "assistant".
- **Support rep**: a person on the Member Support team.
- **Nurse**: a person on the Care Team.
- **Member**: the patient who wrote in.

## Stack
- Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel
- Airtable as the helpdesk stand-in (REST API, server-side only)
- Claude API for triage (model name from the `TRIAGE_MODEL` env var)
- Slack incoming webhook for #nurse-alerts
- Fonts: Public Sans (UI), IBM Plex Mono (IDs, timestamps), Nunito 800 (wordmark only)

## Hard rules
1. API keys stay on the server. Never expose them to the browser or commit them.
2. Remove personal details from every message before it goes to the Triage Tool (see HANDOFF §6).
3. Crisis and clinical messages never get a draft reply, even if the model returns one.
4. Nothing goes to a member without a human clicking a button. In this demo, "send" only logs to Airtable.
5. If the model call fails or returns invalid JSON, the ticket goes to "Needs rep". Never drop a ticket.
6. Match the design in `design/Screens.dc.html`. Copy, colors and layout come from there.
7. Don't add features that aren't in HANDOFF.md without asking.
