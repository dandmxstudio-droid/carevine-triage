# Carevine Triage Tool

Phase 1: a Next.js App Router demo matching the approved screens, with 16 synthetic tickets, 18 help center articles, and hardcoded Triage Tool results. Read [AGENTS.md](AGENTS.md) and [docs/HANDOFF.md](docs/HANDOFF.md) before making changes.

## Run and verify

Node.js 20.9+ is required; verification used Node.js 24.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

Development: `http://localhost:3000`. Production: `npm run build` followed by `npm start`. On Vercel, use the **Next.js** framework preset and the repository root. Phase 1 needs no environment variables.

## Scope

The server parses the CSV and Markdown files; the browser uses fixed JSON results from `src/lib/mock-results.ts`. All actions operate in the browser only. Tab-local `sessionStorage` preserves decisions and ticket state across reloads. Reset restores all 16 tickets. Fonts are self-hosted. Supplied logos and app icon are retained; avatars, uploads, and thumbnails are excluded, with initials used for staff.

Airtable, Claude, Slack, API endpoints, live runs, passwords, rate limiting, and deployment are later phases. `/admin/tests` is an unprotected mock runner in Phase 1.

Dynamic data supersedes the design placeholders: names, ticket text, IDs, article titles, queue counts, and priorities follow the CSV and prompt rules. The CSV login case uses a conservative low-confidence mock to expose the designed review state without inventing another member question. No source-only member-since dates are invented.

## Every route

Use these paths on the running app or your Vercel URL. The five nurse tickets also have valid support URLs; these hide message content and link to the nurse queue.

| Route                    | Flow                                                |
| ------------------------ | --------------------------------------------------- |
| `/`                      | Choose support rep or nurse                         |
| `/support`               | Filters, recent urgent banner, empty state, reset   |
| `/support/CV-10009`      | Cuff setup; high-confidence draft                   |
| `/support/CV-10035`      | Login; low-confidence review                        |
| `/support/CV-10003`      | Reschedule a coaching call                          |
| `/support/CV-10020`      | Missing supply delivery                             |
| `/support/CV-10039`      | Billing; two articles, medium confidence            |
| `/support/T-02`          | Upset member; repeat sync problem                   |
| `/support/T-03`          | Spanish draft and help center gap                   |
| `/support/CV-10037`      | Outdated meter article; hidden DOB                  |
| `/support/CV-10059`      | Spouse eligibility; missing article                 |
| `/support/CV-10033`      | Conflicting refund articles                         |
| `/support/CV-10067`      | Spanish coaching availability; hidden member number |
| `/support/CV-10018`      | Nurse-only content hidden from support              |
| `/support/CV-10004`      | Nurse-only content hidden from support              |
| `/support/CV-10012`      | Nurse-only content hidden from support              |
| `/support/CV-10084`      | Nurse-only content hidden from support              |
| `/support/T-01`          | Crisis content hidden from support                  |
| `/nurse`                 | Crisis selected by default                          |
| `/nurse?ticket=T-01`     | Crisis alert, claim, exact reply template           |
| `/nurse?ticket=CV-10004` | Low reading and symptoms                            |
| `/nurse?ticket=CV-10018` | High reading and symptoms                           |
| `/nurse?ticket=CV-10012` | Medication issue                                    |
| `/nurse?ticket=CV-10084` | Symptom issue; send-back flow                       |
| `/admin/tests`           | Run all 16 mocks, inspect JSON, mark draft accuracy |

## Click-through guide

1. Enter as support rep → CV-10009 → View article → edit or approve → sent confirmation → Next ticket.
2. CV-10035 demonstrates low confidence. Try Reject draft, Change category, and Send to nurse (reason required). T-02 and T-03 show upset-member and Spanish states.
3. CV-10037, CV-10059, CV-10033, and CV-10067 are the four handoffs. Write a reply, toggle the gap checkbox, and send.
4. Switch to Nurse queue → claim the crisis → explicitly send the crisis template or log a call. Select a clinical ticket → I'm on it → Reply in app.
5. Claim CV-10084 → Not clinical: send back to support → choose category → send → confirmation → Undo within ten seconds.
6. Approve all seven drafts and choose Draft ready 0 to see the empty state. Reset demo restarts all flows.
7. /admin/tests → Run all 16 → inspect results and mark draft accuracy. Automatic checks pass 16/16. Human accuracy review is left for Dan.

See [design-qa.md](design-qa.md) for evidence and verification limits.
