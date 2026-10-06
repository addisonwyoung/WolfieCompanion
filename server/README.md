# Wolfie API

Run `npm ci` then `npm run dev` from server. Default port: 3000 (`PORT` overrides it).
Reports persist in server/data/crowd-reports.json. `CROWD_REPORTS_PATH` can select another file (use an absolute path). Missing storage starts empty; invalid storage stops startup rather than discarding reports.

Use one server process and persistent writable disk. This anonymous student prototype has no authentication or moderation; it is not intended for public production use.

- GET /api/health: health status.
- GET /api/locations: six locations with latestReport (null when unknown).
- GET /api/locations/:id: location, latestReport and ten recent reports newest first.
- POST /api/locations/:id/reports: JSON {"level":"Low","note":"many seats available"}. Levels: Empty, Low, Moderate, Busy, Full. Note optional, at most 200 trimmed characters. Returns 201 and a server-timestamped report. Errors: 400 invalid input, 404 unknown location, 500 save failure.

IDs are lowercase hyphenated names, e.g. north-reading-room. Every submission appends history; the last accepted report determines the current summary. No report means unknown, never Empty.

`npm test` runs isolated API/storage tests; `npm run build` compiles the server. Back up the JSON file before manually resetting demo data. Do not run multiple processes against the same file.

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

## Browser schedule preview (local development)

Start the API from `server`:

```sh
ENABLE_SCHEDULE_PREVIEW=1 npm run dev
```

Start the UI from `client` in a second terminal:

```sh
npm run dev -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173`, then Import schedule beside Your courses. Choose a PNG/JPEG up to 10 MiB, select its layout, and click Extract classes. Review/edit course and section rows, add/remove classes, or Clear/Close. Click Add to Your courses after reviewing to update the dashboard for this session only; reload restores sample courses. Nothing is saved to a database. Google ADC/billing/API setup is still required for real extraction; each explicit extraction uses an OCR unit.

POST `/api/schedule-preview?layout=class-list|weekly-calendar` accepts raw image bytes with matching PNG/JPEG content type, `X-Schedule-Preview: 1`, and Origin `http://localhost:5173`. The Vite proxy forwards it to the API. `SCHEDULE_PREVIEW_ORIGIN` can specify another exact HTTP localhost/127.0.0.1 origin if using a different Vite port. Opt-in binds the server to 127.0.0.1; the endpoint is disabled by default and always disabled in production. It rejects unrelated origins/headers and allows one active extraction at a time. No public deployment or authentication is provided by this local feature.

Responses contain only `{ rows: [{ code, section, warnings }], warnings, requiresReview: true }`; raw OCR text and image positions remain outside the browser response. Errors use 400 invalid input, 413 too large, 415 unsupported media, 403 local access checks, 404 disabled, 429 busy, and 502/504 provider failure/timeout. Clear/replacement discards browser results, but cannot guarantee cancellation of an already accepted Google request. No images/results are persisted or logged by this endpoint.

Calendar parsing also associates explicit section labels in separate OCR regions when they are directly below the course in the same column, within a bounded distance and without an intervening course. Associations remain heuristic and require review.
