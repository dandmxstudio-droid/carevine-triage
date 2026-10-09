# Phase 3 verification

- `npm test`: 28 tests passed, including the existing Phase 1/2 tests.
- `npm run build`: passed, including TypeScript and production route generation.
- Vercel file tracing includes the system prompt and all help center articles in the triage function.
- Production browser checks passed with controlled OpenAI/Airtable responses and dummy credentials: the real password form and httpOnly cookie, signed-out and cross-origin rejection, 16 sequential requests with maximum model concurrency of one, draft viewing, ✓/✗ ratings, persisted review after reload, Save run, and explicit demo publication.
- Save run stored all 16 ticket results and the chosen manual ratings. Publication kept the 16 live history rows and copied the selected run into 16 demo baseline rows. Public browsing/reset/save/publication caused no further model calls. Writes stayed within ten records per request. No browser console errors occurred.
- Failure tests cover one validation retry, invalid/refused output, transport errors/429, crisis overrides, clinical/unsure drafts, personal-detail removal, receipt tampering/expiry and incomplete publication.

The controlled browser run verifies the application workflow, not production model accuracy. No live OpenAI or Airtable credentials were available locally. On Vercel, Dan must run all 16, inspect the three required checks and judge at least six of seven drafts accurate. Follow HANDOFF §17; do not reseed an already seeded base to run tests.
