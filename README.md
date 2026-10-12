# Carevine Triage Tool

A portfolio demo of an AI triage tool for **Carevine Health**, a fictional virtual-care company. All data is synthetic. Member replies and calls are simulated.

Built by Dan Mota.

## Live demo

[https://carevine-triage.vercel.app](https://carevine-triage.vercel.app)

## How it works

- Personal details are removed from each message before the AI call.
- The Triage Tool returns structured JSON that the app validates.
- Health and crisis messages go to a nurse with no draft. Nurses write their own replies.
- Routine drafts cite a help center article, and a support rep reviews and approves every reply before sending.
- A backup crisis check in code catches crisis phrases and forces urgent nurse routing with no draft.

## Testing

The test set contains 16 synthetic tickets covering routine drafts, help center gaps, and health or crisis messages.

| Recorded run | Tickets passed |
| ------------ | -------------- |
| Run 1        | 13/16          |
| Run 2        | 16/16          |

Run 1 exposed two prompt issues: unsynced readings were treated as clinical without a value or symptoms, and matching articles were not consistently compared for conflicts. Both instructions were corrected before run 2.

The 76 unit tests cover redaction, output validation, crisis patterns, draft suppression, admin authentication, Airtable logging, Slack alerts and session limits. The recorded model runs are separate from these unit tests.

## Stack

Next.js · Vercel · OpenAI API · Airtable · Slack

Built with Codex from a written spec ([docs/HANDOFF.md](docs/HANDOFF.md)) and standing rules ([AGENTS.md](AGENTS.md)).
