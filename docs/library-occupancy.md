# Library occupancy integration

## Approved cold-start recovery (November 25, 2026)

Live and historical browser GET requests each allow 90 seconds, including body reading. After five pending seconds an accessible status explains that loading is taking longer and the student can keep waiting or return later. Failure offers an error-only **Try again** for that request; successful readings have no refresh control. Pending retries ignore repeated activation, retain keyboard focus, and move focus to the corresponding heading after success. Leaving cancels browser work and clears timers; late responses cannot update the view. Reopening still requests on entry.

Live and historical recovery are independent. No automatic retry, polling, keep-alive traffic or additional dependency is introduced. Browser cancellation does not cancel process-shared upstream work: remaining callers can join it and successful results still populate the existing cache. Five-second backend provider deadlines, five-minute live freshness, 30-minute usability, one-hour history caching and 30-second failure cooldown remain unchanged. A manual retry during cooldown may truthfully return unavailable without contacting SBU again. Hosted cold-start behavior still requires deployment verification; see the readiness document and pending Task 5.3.

## Historical API findings (November 24, 2026)

### Approved room-specific reference weeks

The [official meter page](https://library.stonybrook.edu/how-busy-are-the-libraries/)
embeds the configuration below; its JavaScript passes `room.weeks` to the histogram
request and includes it in its own cache key. Focused comparison returned 24 numeric
buckets with no missing entries for every selection. All sequences ran from 08:00
through 07:00 next day, in returned order.

| Library IDs | Selected weeks | Returned reference dates |
| --- | --- | --- |
| 1–3 / North, Central, Health Sciences | `52` | Nov 25–26, 2025 |
| 4 / Music | `48,49,50` | Dec 23–24, 2025 |
| 5 / 3rd Floor | `49,50,51` | Dec 16–17, 2025 |

Example current request:

`https://library.stonybrook.edu/api/proxy.php?endpoint=histogram&id=1&dayOffset=0&bucketMinutes=60&bucketCount=24&weeks=52`

At the same 16:00 bucket, counts changed from the original baseline to the official
selection as follows: North 483 → 330, Central 164 → 127, Health Sciences 241 → 44,
Music 62 → 19, and 3rd Floor 69 → 73. The reference hour sequences matched while
reference dates and values differed. These differences do not establish that one
selection predicts occupancy better. Academic seasonality is a possible rationale,
not an explanation confirmed by SBU; the widget source supplies no rationale.
No academic calendar logic or duplicate ongoing baseline requests are added.

### Initial baseline investigation (superseded selection)

For context, the initial fixed request below also returned usable data for every
monitored library. This is investigation history, not the active configuration:

`https://library.stonybrook.edu/api/proxy.php?endpoint=histogram&id=1&dayOffset=0&bucketMinutes=60&bucketCount=24&weeks=1,2,3,4`

| ID / library | Numeric hourly buckets | Returned count range | Returned reference window |
| --- | --- | --- | --- |
| 1 / North Reading Room | 24/24 | 0–483 | Nov 17, 08:00 → Nov 18, 07:00 |
| 2 / Central Reading Room | 24/24 | 20–169 | Nov 17, 08:00 → Nov 18, 07:00 |
| 3 / Health Sciences Library | 24/24 | 17–241 | Nov 17, 08:00 → Nov 18, 07:00 |
| 4 / Music Library | 24/24 | 0–66 | Nov 17, 08:00 → Nov 18, 07:00 |
| 5 / 3rd Floor | 24/24 | 0–75 | Nov 17, 08:00 → Nov 18, 07:00 |

All responses echoed `weeks: "1,2,3,4"`, `day_offset: 0`, matching `room_id`,
`bucket_minutes: 60` and `bucket_count: 24`. Ordered hour numbers were
`8,9,...,23,0,1,...,7`. A separate ID 1 `dayOffset=1` request moved its reference
window to Nov 18 08:00 → Nov 19 07:00. This observation does **not** define a fixed
weekday mapping. Earlier investigation returned 16:00 → 15:00, so the start hour
must come from each response rather than be hardcoded.

Representative raw ID 1 entries:

```json
{"count":17,"datetime":"2026-11-17 08:00:00","hour":"8 AM","hour_num":8}
{"count":2,"datetime":"2026-11-18 07:00:00","hour":"7 AM","hour_num":7}
```

The SBU widget starts/resets `dayOffset` to zero, requests 24 hourly buckets, and
preserves returned order. The approved refinement follows its room-specific
selections listed above rather than continuing the initial baseline.
Previous individual-week comparisons supported averaging: a combined bucket was
479 for individual values 493/452/481/490, while another returned 463 for an
arithmetic 463.5. Exact rounding, internal hourly sampling, timezone and per-week
sample coverage are not exposed by the response. Successful four-week responses
do not prove that every underlying week contributes to every bucket. These
limitations are disclosed, not treated as grounds to omit a representable graph.

Sources: [SBU meter](https://library.stonybrook.edu/how-busy-are-the-libraries/),
[widget JavaScript](https://library.stonybrook.edu/wp-content/plugins/sbu-occupancy/assets/js/occupancy.js),
and the population/histogram proxy endpoints. No custom averaging or forecasting
is performed by Wolfie Companion.

## Backend history contract

`GET /api/libraries/:id/history` accepts IDs 1–5 only. The backend controls all
provider parameters, ignores query overrides, forwards no user credentials, and
rejects unsupported IDs before making provider requests. Browser requests remain
relative `/api` calls. No deployment/TLS configuration changes are required.

Available response:

```text
id, capacity, status: "available", weeks: "52" | "48,49,50" | "49,50,51", bucketMinutes: 60,
buckets: [{hour, referenceDateTime, count, percentage}, ...],
retrievedAt, expiresAt, sourceUrl
```

The backend selects weeks from static `historyWeeks` configuration (IDs 1–3: 52;
4: 48,49,50; 5: 49,50,51). Both backend echoed-metadata validation and frontend
adapter validation check the selection against the requested room, including
unavailable-result metadata. Client query parameters cannot override it.

There are 24 ordered buckets. `referenceDateTime` preserves the upstream
timezone-less string; it is not parsed as a UTC or browser-local instant.
Percentages are `count / configured capacity * 100`, without additional
aggregation or rounding before display. Missing/invalid counts produce null
count/percentage gaps. Genuine zero remains zero. Above-capacity percentages
remain intact; the chart clips visual height at 100% and reveals the actual
rounded percentage in inspection text. Invalid identity/window metadata,
nonsequential/reversed hours or all-missing values make history unavailable
rather than sort, guess a window or fabricate values.

Unavailable response retains ID/capacity/source/request metadata, has
`status: "unavailable"`, empty buckets, and null retrieval/expiry timestamps.
Provider failures are contained within history. Unsupported IDs return 404.

Successful history has a separate process-local one-hour cache; cache,
in-flight deduplication and failure cooldown keys include room ID and reference-week
selection so different profiles cannot share entries. Requests have a five-second timeout including body
reading. A separate 30-second history failure cooldown avoids repeated failures;
expired history is not silently returned as a newly retrieved result. Responses
use `Cache-Control: no-store`. Live cache timing, 30-minute usability and its
failure cooldown are unchanged. There are no scheduled network requests or
automatic retries. All cache/state resets on process restart; multiple instances
have independent caches.

## Frontend behavior

Each detail entry mounts an independently fetched historical card immediately
below amenities in the desktop right-hand column. Smaller viewports stack the
cards. History loading/failure, cancellation and late-response protection do not
change current occupancy or amenities. Back/reselect can call the history route
again, subject to the backend cache; no live refetch occurs. Leaving the detail
aborts its browser request without cancelling shared backend work.

The CSS bar chart uses a constant 0–100% vertical scale, sparse hour labels,
rounded muted pink/burgundy bars and a dashed midnight transition. Window text
identifies the first/last **hourly readings**, not a midnight calendar day. A collapsed-by-default "About this data" contains concise reference-week/campus-hour context, the hourly window, midnight and missing/zero/interaction guidance. Technical selections, raw reference timestamps and sampling/timezone limitations stay in this developer document and API metadata. Visible wording is "Historical reference data, not a forecast." Source attribution remains outside the disclosure. No Today, weekday selector,
previous-four-week claim, average claim for single-week selections or live overlay is added.
Hover/tap selects a reading. The chart has one tab stop; Left/Right, Home and End
inspect all 24 hours with visible focus and readable hour/percentage descriptions.
Missing readings use ×, zero uses a baseline mark, and selected values have an
accessible live description. History retrieval time is separate from live time.

### Detail comparison

The historical card also compares fresh live data with exactly one valid matching
historical hour. SBU's historical labels are **assumed** to represent campus time
(America/New_York), as explicitly accepted by the user, rather than claimed verified.
Intl extracts the campus hour from the live retrieval timestamp, not the current
clock or browser timezone. Live population/capacity * 100 and the historical
uncapped percentage determine the difference: <= -10 points is Less busy than usual,
>= +10 is Busier than usual, and otherwise About as busy as usual. Only negligible
floating-point arithmetic noise is tolerated at exact boundaries; display rounding
does not affect classification. Display percentages use at most one decimal.

The compact green/blue/amber subheading, without a supporting percentage sentence, appears only in details,
directly beneath Historical hourly occupancy. Missing/invalid/duplicate-hour data
or non-fresh live readings suppress it. Existing display-clock updates hide it on
freshness expiry without refetching. Existing graph bars/order/interactions remain
unchanged; there is no overlay, new endpoint, polling, cache change or dependency.
About this data explains the selected SBU reference weeks and accepted hour assumption.

Final presentation polish preserves graph dimensions, bars and all data behavior. PLAN YOUR VISIT is the eyebrow and Source: SBU Libraries. is the attribution. Initial selection uses the unique valid live retrieval-hour bucket or falls back to the first bucket; explicit inspection persists through rerenders. Live meters use #397B58 / #BD8B32 / #AD414D without heavy older-reading fading. Relative timestamps use Retrieved / Last retrieved; unavailable locations say Current occupancy unavailable. Grid-footer fine print replaces the global age warning. Details show two side-by-side number-first metrics and "Estimated capacity, not guaranteed available seats." Configured capacity remains internal. Placeholders remain unchanged.

ID 5 stays 3rd Floor. Its amenities card separately identifies Main Stacks: 56 small-table seats, 199 study-carrel seats, 4 lounge chairs and 276+ outlets, verified against [SBU Places to Study](https://library.stonybrook.edu/services/access-services/places-to-study/). Sensor coverage may differ; these facilities do not establish an exclusive sensor footprint.

The user's ordinary local `npm run dev`
workflow was manually verified without extra certificate configuration; the
earlier isolated agent certificate-trust issue is not a deployment requirement.

## Verification

Final Groups 1-3 presentation refinement verification (November 24, 2026): 55/55 focused frontend tests and 376/376 full frontend tests passed (full suite rerun with --maxWorkers=2 after unrelated planner/calendar interaction timeouts during concurrent browser verification). Frontend lint/build, strict OpenSpec validation and diff checks passed; build retains its existing large-chunk advisory. Chrome/CDP passed 1280/820/375px card/detail layouts and all three comparison states, two-column detail metrics even on mobile, collapsed disclosure, graph interactions and exactly one live plus one history request per fixture visit. Main cards, details, graph and all comparison states were visually inspected in desktop/mobile screenshots. Comparison text contrast exceeds 4.5:1 for all three palettes. Main Stacks amenities were verified against SBU Places to Study and are separately scoped beneath the unchanged 3rd Floor identity. Backend, API/cache/freshness/expiry, request behavior and placeholders are unchanged. Technical historical limitations remain documented; UI now uses concise relative age, grid fine print, two number-first metrics, text-only comparisons and compact About this data. Progress remains 14/22; Groups 4/5 remain unchecked. No commit, push, deployment or dependency changes.


Reference-week refinement results: backend 46/46, frontend 350/350 and focused
frontend history/live tests 29/29 passed. Both builds, frontend lint, strict
OpenSpec validation and 1280/820/375px Chrome checks passed. Browser assertions
also verify About this data starts collapsed and no previous-four-week UI text
remains. Screenshots were visually inspected. OpenSpec progress remains 14/22;
no Group 4/5 work or dependency/TLS/deployment changes were made.

Initial Group 3 results: 44/44 backend tests and 344/344 frontend tests passed; the focused
history/live frontend suites passed 23/23. Both builds, frontend lint, strict
OpenSpec validation and responsive Chrome checks passed. Group 3 is delivered;
Groups 4 and 5 remain unchecked for separate authorization/review.

- Backend history tests cover order, midnight, zero/gaps/over-capacity, identity and
  response validation, cache expiry/deduplication, timeout, errors/recovery and live
  cache independence.
- Frontend tests cover detail-only requests, history-only failure, abort/late
  responses, percentage clipping, missing/zero distinctions, window labels and
  keyboard/pointer inspection, plus existing live expiry/navigation regressions.
- `node client/test/library-occupancy-browser.mjs` checks 1280/820/375px, graph
  placement, no overflow, compact card spacing, keyboard/hover/tap interactions and
  one live plus one history request per fixture detail visit. External requests are
  blocked in this synthetic preview; screenshots are saved in its printed temp
  directory.
- Run normal frontend tests/lint/build, backend tests/build, strict OpenSpec
  validation and `git diff --check`. No dependency installation, database change,
  legacy backend retirement, deployment or commit is part of this group.

## Production photographs

The user has approved the five selected photographs for production inclusion. The optimized local WebP files are eligible for Git tracking and included in build output; preserved original JPEGs remain ignored and excluded. See [image credits](library-image-credits.md) for original URLs, source/attribution, transforms and unverified third-party permissions. Missing or failed images retain placeholders. This changes presentation/asset delivery only; occupancy requests and data behavior are unchanged.

## Legacy reporting retirement (Group 4)

The former anonymous report GET/POST routes are removed; ordinary requests return 404. No report fallback remains. ReportStore, its JSON persistence module and startup load are removed; createApp accepts preview options and optional library providers directly. Saved report files remain untouched and unused, and are still ignored by Git. Startup does not need report storage or consume its former configuration. Library endpoints, cache/freshness/expiry, historical comparisons, photos and frontend behavior are unchanged.

Active setup documentation no longer instructs users to provision report storage or submit reports. Negative route/startup regression tests retain the old URLs/configuration name intentionally. Historical OpenSpec change artifacts are preserved without syncing obsolete requirements. CrowdMeter's component name stays for existing navigation; Supabase campus_locations and study_spot belong to independent Campus Explorer functionality and are unchanged.

Verification: backend 46/46, frontend 379/379, both builds, frontend lint, strict OpenSpec and diff checks passed. Responsive production-mode synthetic browser checks passed at 1280/820/375px. The existing saved report file's SHA-256 and path are unchanged. No backend lint command is configured. No new dependency, database change, hosting change or Group 5 acceptance work is included; remaining hosted/real-account verification stays in that separately authorized group.

## Group 5 readiness status

Local integration and post-merge regression verification are complete. Hosting URLs/settings are now teammate-provided and client/vercel.json is present. Read-only November 25 checks confirmed health forwarding but both new library routes returned Render-origin 404s; Task 5.3 remains pending deployment acceptance, exact Node patch/process confirmation and Render-to-SBU/cache verification. See [readiness evidence and limitations](library-occupancy-readiness.md) for final test/build/browser results, real SBU smoke, local certificate-trust findings, per-process cache and cold-start considerations, unrelated-feature fixture limits, the older group-browser runner issue, and the precise hosted checks that remain unverified. Progress is 21/22; no deployment or configuration changes were made.
