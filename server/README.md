# Wolfie API

## Library occupancy

`GET /api/libraries` is an anonymous, read-only aggregate endpoint used by the
library UI; legacy report backend routes and storage initialization are retired. Requests go
only to SBU's fixed population proxy for IDs 1–5; caller cookies, authorization,
query parameters and arbitrary URLs are not forwarded. No API key, new dependency,
database migration or additional environment setting is needed.

The response is `{ "libraries": [...] }`, always with five catalog entries. Example
entry for a successful reading of 450 people (illustrative, not a live fixture):

```json
{
  "id": 1,
  "name": "North Reading Room",
  "capacity": 900,
  "population": 450,
  "percentage": 50,
  "crowdLevel": "Low",
  "estimatedRemainingCapacity": 450,
  "status": "fresh",
  "retrievedAt": "2026-11-24T12:00:00.000Z",
  "freshUntil": "2026-11-24T12:05:00.000Z",
  "usableUntil": "2026-11-24T12:30:00.000Z",
  "sourceUrl": "https://library.stonybrook.edu/how-busy-are-the-libraries/"
}
```

Catalog capacities are North Reading Room 900, Central Reading Room 300, Health
Sciences Library 350, Music Library 110, and 3rd Floor 300, verified from SBU's
widget configuration. They are occupancy denominators, not available-seat counts.
Remaining capacity is `max(0, capacity - population)`, not a promise of empty seats.
Percentages are rounded and capped at 100; Low is through 50%, Moderate through
80%, Busy above 80%. Valid over-capacity counts remain visible in `population`.

Fresh readings are reused for five minutes from retrieval. Concurrent misses share
one in-flight request per library. Five requests run concurrently; one library's
failure does not discard the other results. Each upstream request has a five-second
timeout covering headers/body. Failed requests enter a 30-second retry cooldown.
The last good value can be returned as `stale` through 30 minutes from its original
retrieval; failures do not renew its timestamp. After that it becomes `unavailable`:
population, percentage, level, estimated remaining capacity and all three time
fields are null. No fabricated zeros are used. Valid measured zero remains 0%/Low.
Malformed JSON, HTTP failures, missing/non-numeric/negative/non-finite counts and
counts strictly above 1.5 times capacity are failures. The anomaly boundary is
confirmed in SBU's [widget fetchPopulation implementation](https://library.stonybrook.edu/wp-content/plugins/sbu-occupancy/assets/js/occupancy.js):
`raw > cap * 1.5`. Wolfie uses stale/unavailable instead of SBU's zero fallback.

`retrievedAt` is our successful fetch completion time, not a sensor timestamp.
The frontend uses `freshUntil` and `usableUntil` to advance freshness
locally: stale at five minutes, unavailable with no usable current metrics after
30 minutes even if the view stays open. That display-only expiry must not make
requests. The backend supplies those timestamps without renewing cached retrieval times.

There are no background jobs, polling, or automatic retries. Expiry alone sends no
requests; a subsequent endpoint call checks freshness. Responses use
`Cache-Control: no-store` so browser/CDN caches do not extend backend freshness.
The default service is shared within one Express process, including concurrent
visitors. Restarts clear it; separate instances have separate caches and may each
contact SBU. No report storage or persistent disk is needed for library occupancy or API startup.
`/api/health` does not call SBU. `GET /api/libraries/:id/history` now provides an
independent one-hour-cached histogram for IDs 1–5, using fixed dayOffset 0, 60-minute
24-bucket windows and SBU's official reference weeks (IDs 1–3: 52; ID 4: 48,49,50;
ID 5: 49,50,51). History success/in-flight/failure keys include room and week
selection; provider metadata must match. See the [history contract and verified findings](../docs/library-occupancy.md)
for returned order/reference timestamps, missing/zero/over-capacity handling,
history-only failure states, and request/caching tests. No live cache behavior changes.

Focused verification: from `server/`, run
`node --import tsx --test test/libraryOccupancy.test.ts`; `npm test` includes these
tests alongside existing backend checks. Tests inject fetch/time and do not call
SBU. `npm run build` performs the existing Prisma generation and TypeScript build.

## Existing service setup

For current M5 installation, environment loading, service requirements and limitations, start with the [root setup guide](../README.md). The API includes authenticated avatar, peer-picture and review routes plus anonymous university library occupancy reads. Historical OCR examples use a team project ID; use your own authorized project instead. Current enrollment persistence is described in the client/root guides; the older browser-preview section's session-only behavior is historical.

Preserve an existing `server/.env`; for a fresh clone, copy `server/.env.example` to `server/.env` and configure it as described in the root guide. Run `npm ci` then `npm run dev` from `server/`. The entry point imports `dotenv/config`, loading `.env` from that working directory; exported shell values take precedence. Vite separately loads `client/.env.local`. Restart the server after environment edits. Default port: 3000 (`PORT` overrides it).
Student-submitted crowd reporting is retired. Existing report files remain untouched and unused. Startup does not read or write report JSON, require a writable report directory, or consume the former report-path setting.

Prisma tooling separately loads `PRISMA_ENV_FILE` or `.env` by default. Only `PRISMA_ENV_FILE=.env.supabase` selects `DIRECT_URL`; otherwise it uses `DATABASE_URL`. Set the selector in the invoking shell before running Prisma from `server/`, not only inside the file it is intended to select. Preserve any existing `.env.supabase`; Express does not load it or use this selector. No database command or connection is needed for normal API startup. Shell values take precedence over both dotenv loaders.

- GET /api/health: provider-independent health status.
- GET /api/libraries: five university-provided live readings.
- GET /api/libraries/:id/history: independent historical hourly occupancy.

The former GET /api/locations, GET /api/locations/:id and POST /api/locations/:id/reports routes are removed and return 404 for ordinary requests. They expose no legacy data and accept no reports. Supabase campus_locations and its study_spot category belong to Campus Explorer and are unchanged.

`npm test` runs isolated API, occupancy, report-retirement and OCR tests; `npm run build` generates Prisma Client before compiling the server. The `prisma-client` generator writes to `src/generated/prisma` (relative to `prisma/schema.prisma`), matching the import in `src/lib/prisma.ts`. Generated files stay gitignored. The current checked-in schema is a scaffold without models; the installed Prisma 7 CLI supports generating that client without adding database models. Generation does not connect to a database and works without local env files or database credentials; runtime Prisma access still requires its configured connection URL. CI uses the same build command after `npm ci`. Existing saved report files are historical data; leave them in place.

## Schedule OCR experiment: cloud setup

This developer-only experiment uses Google Vision document OCR, independently of Firebase/Supabase. Link project billing and enable Vision. Local client libraries use Application Default Credentials (ADC); `gcloud init`/CLI login alone does not configure ADC.

```sh
gcloud init
gcloud services enable vision.googleapis.com --project=wolfie-companion
gcloud auth application-default login
gcloud auth application-default set-quota-project wolfie-companion
```

Use your own project ID if different. The caller needs API use permissions (Service Usage Consumer when required). Leave `GOOGLE_APPLICATION_CREDENTIALS` unset when using local user ADC, since it overrides credential discovery. Never commit credentials. Each valid invocation sends image bytes directly to Google with one document-OCR request, a 30-second provider deadline, and no automatic retries. No storage bucket is needed.

Official references: [setup](https://docs.cloud.google.com/vision/docs/setup), [authentication](https://docs.cloud.google.com/vision/docs/authentication), [document OCR](https://docs.cloud.google.com/vision/docs/ocr).

### Parsing boundaries

Select `class-list` for SOLAR rows or `weekly-calendar` for calendar blocks. Codes use 2–4 department letters and a three-digit number: `cse416`, `CSE-416`, and `CSE 416` normalize to `CSE 416`. Longer identifiers and number suffixes are not silently truncated; ambiguous `CSE 4I6` requires review. This is syntactic extraction, not catalog matching or proof of enrollment.

Positioned words are grouped by lines and blocks, with large horizontal gaps separating columns. Explicit term headings can apply across a screenshot; local terms take priority. Missing or conflicting terms remain null. Sections require explicit labels such as `LEC 01`, `LAB L02`, or `Section 01`. Calendar block labels can span lines; uncertain associations are omitted. Titles require an explicit `Title:` label in this baseline. Without geometry, only same-line codes are extracted and metadata is omitted. Repeated meetings merge by code and term, retaining evidence and lecture/lab sections. Different explicit terms remain separate.

Output always has `schemaVersion: 1`, `requiresReview: true`, and unverified class candidates with evidence and warnings. Raw text is preserved. No-text and no-course warnings distinguish successful empty extraction from cloud failures. Review/correction is required before any future enrollment use.

### Run the experiment

From `server` (install dependencies with `npm ci`):

```sh
npm run ocr:schedule -- --image /absolute/path/solar.png --layout class-list
npm run ocr:schedule -- --image /absolute/path/calendar.jpg --layout weekly-calendar
```

For clean JSON stdout without npm's script banner:

```sh
node --import tsx src/ocr/cli.ts --image /absolute/path/solar.png --layout class-list
```

Only local PNG/JPEG files up to 10 MiB are supported; signatures are checked before cloud access. A corrupt file with a valid signature can still be rejected by Google. Missing/bad flags and unreadable files fail before any OCR request. The command exits nonzero on failures, prints actionable errors to stderr, and never turns a provider failure into a successful empty result.

It prints raw OCR text plus draft classes/evidence to your terminal. Screenshots may contain personal data: crop/anonymize them and keep raw output out of commits. Images and results are not automatically persisted, but shell redirection intentionally saves output. No HTTP endpoint, dashboard edits, or enrollment changes are included.

If authentication fails, repeat ADC login; check an overriding `GOOGLE_APPLICATION_CREDENTIALS` path. For access denied, verify billing, API enablement, permissions, and quota project. For quota/timeouts, retry manually later. Default `npm test` uses synthetic fixtures and injected providers, requiring no credentials or paid API calls.

### Evaluation

Six synthetic PNG screenshots, expected codes/metadata, and the live-evaluation checklist are in `test/fixtures/schedule-ocr/`. See [EVALUATION.md](test/fixtures/schedule-ocr/EVALUATION.md) for per-layout precision/recall, duplicate and correction reporting. Current live verification is blocked by Google project billing; offline tests do not establish real-world OCR accuracy.

Attached section labels such as `CSE 310-01` now yield section `01`, preserving leading zeros. A bare Lecture line followed by `8:00 AM` is not a section. Conflicting attached/explicit labels are flagged for review. Common location tokens BLDG/ROOM/RM are excluded as departments; other syntactic false positives can remain, so this is still unverified extraction rather than catalog matching.

## Production schedule import (Render + Vercel)

This reuses the existing Google Vision project and `/api/schedule-preview` route.
The hosted mode verifies the Supabase bearer token and student eligibility before
reading uploads. The frontend attaches its current signed-in session automatically.

1. Review and apply `supabase/migrations/202611230001_authenticated_schedule_ocr.sql`
   in the existing Supabase project's SQL Editor. It adds only a usage-counter table
   and a service-role-only reservation function; it does not change courses or accounts.
   Do not run the test bootstrap on the hosted project.
2. In the same Google project used for local OCR, open IAM & Admin → Service Accounts.
   Use a dedicated service account with API-use permissions (Service Usage Consumer
   when required). If a JSON credential is needed, Keys → Add key → Create new key → JSON.
   Personal `gcloud auth application-default login` credentials remain local; do not
   upload those. No Storage bucket or broad Owner/Editor role is needed for inline images.
3. In Render → backend service → Environment → Secret Files, add
   `google-vision.json` and paste the service-account JSON file contents.
   Never commit the downloaded file or put it in Vercel.
4. Add these Render environment variables:

   ```dotenv
   GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/google-vision.json
   ENABLE_AUTHENTICATED_SCHEDULE_PREVIEW=1
   SCHEDULE_PREVIEW_ORIGIN=https://wolfiecompanion.vercel.app
   ENABLE_SCHEDULE_PREVIEW=0
   NODE_ENV=production
   ```

   Keep the existing `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` values. The service key is used only on the backend
   to reserve quota. No new frontend environment variables are needed.
5. Commit/push the application changes and deploy both Render and Vercel. The
   existing Vercel `/api` rewrite forwards the upload and Authorization header.
6. Sign into the production site with an eligible student account. In Your courses,
   choose Import schedule, select a PNG/JPEG and layout, and Extract classes. Review
   the detected rows and choose professors before saving. Extraction alone does not
   save courses. A health check does not verify Vision access.

Limits: 5 attempts per student and 100 total per UTC day. Reservations are atomic
in Supabase and persist across restarts/replicas. A reserved attempt is consumed even
if Google fails or the browser cancels; no automatic paid retries occur. One request
runs at a time per backend process. Invalid authentication or failed file-size/type/signature validation does not reserve quota. A corrupt image that passes these checks may still consume an attempt.
Only date, quota scope (student ID or global), and attempt counts are stored; this
endpoint does not store images or OCR text. Google receives each extracted image.
These app limits do not cap usage by other applications sharing the Google project.

401: sign in again. 403: check eligible account and exact frontend origin. 429: wait
for an active request or the next UTC day, depending on the message. 503 about usage:
check the migration and backend Supabase service key. 502/504: check Google credentials,
Vision enablement, billing/permissions, or provider timeout. Turning
`ENABLE_AUTHENTICATED_SCHEDULE_PREVIEW=0` disables hosted extraction; manual course entry
remains available. The local development mode below is separate.

References: [Render secret files](https://render.com/docs/configure-environment-variables#secret-files),
[Vision authentication](https://docs.cloud.google.com/vision/docs/authentication).

## Browser schedule preview (local development)

Start the API from `server`:

```sh
npm run dev
```

Start the UI from `client` in a second terminal:

```sh
npm run dev -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173`, then Import schedule beside Your courses. Choose a PNG/JPEG up to 10 MiB, select its layout, and click Extract classes. Review/edit course and section rows, add/remove classes, or Clear/Close. Click Add to Your courses after reviewing to update the dashboard for this session only; reload restores sample courses. Nothing is saved to a database. Google ADC/billing/API setup is still required for real extraction; each explicit extraction uses an OCR unit.

POST `/api/schedule-preview?layout=class-list|weekly-calendar` accepts raw image bytes with matching PNG/JPEG content type, `X-Schedule-Preview: 1`, and Origin `http://localhost:5173`. The Vite proxy forwards it to the API. `SCHEDULE_PREVIEW_ORIGIN` can specify another exact HTTP localhost/127.0.0.1 origin if using a different Vite port. Local opt-in binds the server to 127.0.0.1 and is always disabled in production. It rejects unrelated origins/headers and allows one active extraction at a time. Hosted access requires the separate authenticated opt-in described above.

Responses contain only `{ rows: [{ code, section, warnings }], warnings, requiresReview: true }`; raw OCR text and image positions remain outside the browser response. Errors use 400 invalid input, 413 too large, 415 unsupported media, 403 local access checks, 404 disabled, 429 busy, and 502/504 provider failure/timeout. Clear/replacement discards browser results, but cannot guarantee cancellation of an already accepted Google request. No images/results are persisted or logged by this endpoint.

Calendar parsing also associates explicit section labels in separate OCR regions when they are directly below the course in the same column, within a bounded distance and without an intervening course. Associations remain heuristic and require review.

## Account pictures

`POST /api/avatar` accepts an authenticated raw PNG/JPEG up to 5 MiB, verifies the student's Supabase token/eligibility, decodes and bounds the image, and uploads a re-encoded private image with the caller's own Storage permissions. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; no service-role key is needed. See [account setup and policy tests](../docs/supabase-accounts.md) for startup, Google configuration, migrations, avatar cleanup, and rollback. Unlike schedule OCR, this route supports configured production use and does not call Google Vision.
