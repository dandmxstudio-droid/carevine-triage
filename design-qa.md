# Carevine Phase 1 design QA

This is the historical Phase 1 report. Phase 5 supersedes the mobile table layout and the keyboard/Undo/deployment verification gaps below; see [HANDOFF §19](docs/HANDOFF.md#19-phase-5-verification-and-live-walkthrough) for current checks and remaining live Slack timing verification.

**Source visual truth:** `design/Screens.dc.html`, `design/Carevine Brand.dc.html`, and supplied brand PNGs.

**Implementation evidence:** `docs/qa/app-2a-final.jpg`; source evidence: `docs/qa/source-2a-final.jpg`.

**Viewport:** 1363 × 936 CSS pixels; devicePixelRatio 1. Both final browser captures are 1348 × 926 pixels. They have identical dimensions; no resizing was applied. The original 1280 × 820 artboard's outer frame was extended to the browser viewport, retaining source inner styles and the 1280px content maximum. The export's textarea defaultValue attribute was converted to native textarea text for reference capture only. Original design files remain unchanged.

**State:** 2a / CV-10009 / high confidence / before sending / 12 minutes waiting. CSV member Daniel replaces placeholder Maria, and the fixed draft uses KB-006.

**Full comparison:** `docs/qa/comparison-2a-final.jpg`, source left and app right, opened and inspected together. **Focused comparison:** `docs/qa/comparison-2a-detail.jpg`, including the heading, definition list, article row, and reply field. Dense typography warranted a close inspection. **Mobile evidence:** `docs/qa/mobile-qa.jpg`, support queue inside a 393 × 852 CSS-pixel iframe.

## Findings

No actionable P0/P1/P2 issue remains in the matched comparison or tested primary flows.

- Fonts/typography: bundled Public Sans 400/500/600/700 and IBM Plex Mono 500/600 match the source sizes, weights, hierarchy, and line heights. Supplied PNG carries the wordmark. Source content-box buttons differ by about two vertical pixels from the consistent border-box controls (P3).
- Spacing/layout: 64px header, 1280px content maximum, 32px margins, 24px column gap, 12px card radii, 20px card padding, 132px definition-list labels, and nine-row draft field match. Mobile wraps navigation and scrolls the table horizontally.
- Colors/tokens: source OKLCH action, neutral, AI, warning, and urgent palettes are reused and visually match the final captures.
- Asset fidelity: original brand PNGs are unmodified. Staff initials implement the requested avatar exclusion. Icons use matching Lucide icons; no brand asset was redrawn.
- Copy/content: fixed UI labels follow the source. IDs, names, messages, expected routes, and all 18 article titles come from the data. Mock drafts use the prompt's JSON shape. Every AI block includes the required review label. Unsupported member-since dates were omitted.

## Browser interaction checks

Verified in the cloud browser:

- Entry and view switching; support filter counts and nurse-message hiding.
- All eleven support editors and all five selected nurse deep links loaded.
- Article side panel, editing, approval as-is and edited, sent confirmation, next ticket, feedback, rejection, manual replies, category changes, required escalation reason, transfer, and reset.
- Spanish review and gap checkbox; hidden DOB/member-number handoffs.
- Crisis reply, crisis claim, clinical claim, call logging, nurse reply, send-back confirmation, and active Undo.
- All seven drafts approved; Draft ready 0 showed the designed empty state.
- Mock test runner displayed 16/16 automatic checks passed; JSON viewing works and human accuracy review remains pending.
- Native modal focus trapping/restoration and Escape dismissal; visible focus styles and 44px buttons.
- Approval followed by immediate reload retained Sent after the persistence fix.

Console logs were inspected. The browser extension reported metadata errors and injected cursor attributes on html, producing an extension-caused hydration warning. No application exception was observed in the completed flows. A final follow-up browser action was rejected by the browser URL policy; no workaround was attempted. This report relies on the already captured matched images and completed interactions.

## Comparison and fix history

1. Inherited Tailwind line height was replaced with the source's normal line height. Reference frame overflow was removed. Early captures had different dimensions and were excluded from final comparison.
2. Article viewing was changed to the specified side panel, the close control enlarged to 44px, and mobile staff initials kept visible.
3. Click-through testing caught a persistence race on fast reload. Actions now persist the next browser state before it appears, and the screen is inert until tab-state restoration finishes. Approval → immediate reload was rerun successfully. Restored rejected drafts are cleared from manual reply fields.
4. Final matched captures were combined and inspected at full view and in a focused crop. No P0/P1/P2 finding remained. Production build, strict TypeScript, and five data/safety/reset tests pass.

## Implementation checklist

- [x] Requested source and brand files imported.
- [x] All §3 routes and app artboard states implemented.
- [x] 16 mock results and 18 parsed articles.
- [x] Build, typecheck, and five meaningful tests pass.
- [x] Primary browser flows and matched visual comparison completed.

## Follow-up polish and test gaps

- P3: about two pixels of source content-box/button variation.
- Ten-second Undo expiry has a timeout and click-time deadline guard. Active Undo was browser-tested; the expired disabled state was not recaptured because the last follow-up was blocked.
- Mobile support was captured. Tablet and a full keyboard-only traversal of every route were not separately recorded.
- Slack artboard 5, live APIs, admin password, server guardrails, and Vercel deployment are later phases. No deployment was requested or performed.

**final result: passed**
