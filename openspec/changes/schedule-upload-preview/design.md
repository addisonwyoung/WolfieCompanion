# Design

## Context

See proposal.md for motivation. Originally the dashboard used fixed fixtures. The companion add-supabase-accounts-and-enrollments change replaces personal data with Supabase records; temporary import drafts remain separate from saved membership and course selection. Vite already proxies `/api` to localhost port 3000. Express has an 8-KB JSON limit and an existing injectable app factory; OCR modules expose an ADC-backed provider, parser, and local command. The account change supplies enrollment persistence; this OCR endpoint retains its independent development-only boundary.

The preceding OCR change is implemented on the current feature branch with live evaluation still open. User-supplied successful output establishes that Google can return text; its source snippets expose two parser problems: multiline section matching consumes time digits, and the broad department grammar accepts BLDG. This change reuses those modules without rewriting the other change's artifacts or claiming its remaining evaluation complete.

## Goals / Non-Goals

**Goals:** Connect the existing OCR capability to a browser preview and correct the observed course/section errors. Keep image selection, request lifecycle, and draft editing independent from enrollment data.

**Non-Goals:** Owning authentication/database installation (provided by the companion account change), official enrollment verification, catalog integration, title/term collection, camera-specific UI, PDF/HEIC support, and public production deployment of paid OCR.

## Decisions

### 1. Inline expandable import area

Mount a new ScheduleImportPreview component beside the existing Your courses controls. An Import schedule button expands a panel with a labeled file input, layout selector, image preview, and Extract classes button. The panel uses existing typography, colors, focus styling, and responsive patterns. Prefer this over a modal for a simple upload/review flow and straightforward keyboard navigation.

After extraction, display editable Course code and Section rows, a review notice, Add class, Remove row, Clear preview, and Close. An optional Add to Your courses callback explicitly confirms reviewed rows and awaits account-backed persistence. It retains the draft on failure and does not save extraction automatically. Rows can be edited freely with nonblocking validation for code grammar and section formatting; blank section is a review state. Display one row per distinct code/section pair, including lecture/lab sections when present. A code with no section gets one blank row. Stable local row IDs keep editing independent from normalized deduplication. Titles and term warnings are omitted from this focused preview.

### 2. Memory-only raw image transport

Use `POST /api/schedule-preview?layout=class-list|weekly-calendar` with the selected File as the binary request body, `Content-Type: image/png` or `image/jpeg`, and `X-Schedule-Preview: 1`. A route-specific raw body parser enforces 10 MiB; the existing 8-KB JSON middleware and crowd-report behavior remain unchanged. Validate layout/media type/signature/nonempty bytes server-side before provider access, reusing/refactoring byte validation from the CLI. Frontend checks file size/type and image decoding for early feedback; server validation remains authoritative. This avoids base64 expansion and unnecessary multipart dependencies for a single image.

Reuse extractDocument and parseSchedule via an injected provider option in createApp. Project the result to `{ rows: [{ code, section }], warnings: [...] }`, with relevant course/section review warnings and no raw OCR text or positions. Use HTTP 400 for invalid data, 413 for oversized data, 415 for unsupported media, 404 when disabled, 403 for origin/header rejection, 429 for busy, and 502/504 for safe provider errors. Existing OcrError diagnostics must map to safe response messages without leaking provider objects or credentials.

### 3. Local development endpoint boundary

Use `ENABLE_SCHEDULE_PREVIEW=1` as explicit opt-in; never enable the endpoint when `NODE_ENV=production`. When opted in, bind the API server to `127.0.0.1` rather than the current all-interface listen default. Validate socket loopback origin and browser Origin against a documented local frontend origin (default `http://localhost:5173`, configurable exact localhost/127.0.0.1 origin for alternate Vite ports). Require the custom request header; do not enable cross-origin CORS. Account for Vite proxy header behavior in tests and documentation. A single in-flight extraction guard avoids duplicate/concurrent cloud requests; release it in finally even on errors. Browser cancellation invalidates results but may not cancel work already accepted by Google.

This keeps OCR development-only even when class confirmation is integrated with a Supabase enrollment backend. Production authenticated uploads would require a separate design; an opt-in development flag is not a production authorization mechanism.

### 4. Correct parser regressions without catalog dependence

Recognize the section attached to the matched course token (`CSE 310-01`, `CSE 416-03`) and preserve leading zeros. Explicit labels remain accepted only in the associated line/block and must not consume a number followed by a colon/time suffix. Restrict multiline label association so bare Lecture followed by a time has no section. Never treat the attached two-digit section as part of the course number.

Add a case-insensitive exclusion of common location tokens such as BLDG, ROOM, and RM at the candidate stage, applied consistently across code counting, term heading selection, and extraction. Prefer this limited contextual correction over a fabricated university department catalog. Remaining syntactic false positives are possible and must stay unverified with editable results. If explicit and attached labels disagree for the same occurrence, retain warning evidence instead of silently choosing a section; distinguish different occurrences/components from ambiguous evidence within one occurrence.

Regression fixtures use synthetic snippets reproducing the supplied course codes, attached sections, meeting times, and locations, not the actual private screenshot. Maintain the original ScheduleResult schema for the CLI and separate its richer metadata from the endpoint's preview projection.

### 5. Async state and resource lifecycle

Track idle/selected/extracting/results/error states in the component. Send only on explicit action, disable duplicate submissions, and use AbortController plus a monotonically increasing request ID. File replacement, layout changes, Clear, Close, and unmount abort/invalidate requests and remove old drafts. Check request ID before applying either success or failure. Revoke object URLs when input is replaced or the component closes/unmounts; do not store files/results in localStorage or sessionStorage. Editing uses React state and never calls the server.

### 6. Verification and documentation

Add parser regression and mocked endpoint tests with no Google calls. Add focused component tests using the project's existing test tooling if present; otherwise add Vitest, jsdom, and React Testing Library as client development dependencies. Test file selection/extraction, projected rows, edits, errors/empty results, stale responses, and resource cleanup. Verify keyboard use and 375-pixel layout in a browser. Document two-terminal development startup, explicit endpoint opt-in, expected Origin, cloud credentials, and temporary extraction versus explicit account-backed confirmation. Optional live screenshot checks consume OCR units and must not run in the default test suite.

## Risks / Trade-offs

- [Other room words resemble departments] --> Regression exclusions plus human review; no claim of catalog validation.
- [Section labels are unreadable or ambiguous] --> Blank/flagged editable rows, never infer from times.
- [Developer endpoint accidentally deployed] --> Default off, production denial, loopback binding, origin/header checks, and tests.
- [Replacing input cannot stop a Google call already running] --> Discard stale responses and prohibit automatic retries/concurrent requests.
- [Memory retention of private input] --> Object URL cleanup, component resets, bounded bodies, and no persistence/logging/raw-text response.

## Migration Plan

Build on the existing OCR feature branch or a branch containing its implementation. Add parser corrections first, then disabled-by-default route, then UI and tests. This OCR change needs no migrations; account migrations belong to the companion account change. Document `ENABLE_SCHEDULE_PREVIEW=1 npm run dev` in server and `npm run dev` in client, with the exact configured local origin. Keep route disabled outside local development. Rollback removes the import component/route or disables the flag; saved account data stays intact.
