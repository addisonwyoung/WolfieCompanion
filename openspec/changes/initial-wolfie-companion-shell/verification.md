# Implementation verification

Verified on 2026-09-25 using the client-only Vite development server and installed
Microsoft Edge in headless mode, controlled through the browser debugging protocol.

## Results

- `npm run lint`: passed.
- `npm run build`: passed (TypeScript and Vite production build).
- `npm run dev -- --host 127.0.0.1`: served the root dashboard without a backend.
- Title, Wolfie Companion branding, fictional-data label, and replacement of the
  starter counter and framework links: confirmed in the browser and source.
- Complete keyboard journey at 1440 x 1000 and 375 x 1000: passed. Tab/Enter reached
  Edit profile, Save, Cancel, and all four course controls; arrow keys selected
  the year. Form labels and visible focus outlines were checked.
- Saving changed major, year, and interests together; major was trimmed and
  comma-separated interests were trimmed with empty entries removed.
- Cancel discarded changes to all three fields; reopening restored saved values.
- Whitespace-only major showed its associated validation message and focused the
  major field. Clearing interests saved successfully and displayed the empty text.
- Saved changes survived all four course selections; reload restored the original
  major, year, interests, and initially selected CSE 416.
- All course headings, selected button semantics, counts, and rosters matched the
  fixture expectations below. Every classmate card includes profile summaries.
- Fixture assertions confirmed valid course membership IDs, distinct rosters,
  at least two classmates per course, current-user exclusion, and deduplication
  even when the entire student fixture was supplied twice.
- A temporary empty development roster produced zero classmates, the empty-state
  message, and no stale cards. The original source was restored in a finally
  block, and the browser was reloaded to confirm the three seeded results returned.
- No horizontal page overflow in either viewport, including the editor; desktop
  and full-page mobile screenshots were visually reviewed.
- No browser application exceptions or error-level resource logs during the demo.

| Course | Expected fictional classmates | Count |
| --- | --- | --- |
| CSE 416 | Maya Chen, Jordan Ellis, Sam Rivera | 3 |
| CSE 310 | Jordan Ellis, Priya Shah, Avery Park | 3 |
| AMS 210 | Maya Chen, Leo Brooks, Avery Park | 3 |
| AMS 261 | Sam Rivera, Priya Shah, Leo Brooks | 3 |

## Limits

This is fictional, client-only demo data. Profile edits intentionally reset on
reload. Browser checks covered Edge at the two specified widths, not other browser
engines, physical mobile devices, or a screen-reader audit. No project dependencies
were added for verification. A temporary Playwright download failed certificate
validation; the installed Edge browser was used successfully instead.
