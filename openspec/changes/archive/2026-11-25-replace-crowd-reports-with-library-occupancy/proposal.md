# Proposal

## Why

Study Spot Finder currently depends on student participation and starts empty without reports. Replace this with university sensor occupancy so students can compare library spaces immediately, using the existing application and deployment architecture.

## What Changes

- Replace six reported locations with the five verified SBU monitored spaces, current occupancy percentages, SBU-derived crowd levels, retrieval timestamps, and source attribution.
- Keep existing Study Spot Finder navigation and responsive styling; provide clickable cards and individual details with the five user-approved local production photographs, consistent fallback placeholders, scoped numerical amenities, and estimated remaining occupancy capacity rather than promised seats. Third-party photograph reuse permissions remain unverified and documented.
- Fetch live data through Express on feature entry, with a shared five-minute process-local cache, concurrent-request deduplication, timeout, validation, and isolated stale/unavailable results. No successful-reading refresh button, polling, foreground refresh, or background jobs. Approved cold-start refinement: live and historical browser requests allow 90 seconds including response-body reading, announce delayed loading after five seconds, and offer an independent error-only Try again action without automatic retries.
- Request historical data only on detail entry, using SBU's official room-specific reference weeks (IDs 1–3: 52; ID 4: 48,49,50; ID 5: 49,50,51) and a one-hour backend cache keyed by room and selection. Render accurate returned windows as rounded hourly percentage bars on a fixed 0–100% scale, with hover, tap, and keyboard inspection. Keep explanations concise with brief student guidance collapsed under About this data and technical details in developer documentation; no seasonality or predictive-accuracy claim is made.
- In library details only, compare a fresh live reading with its uniquely matching historical hour using the retrieval timestamp in America/New_York (an explicitly accepted assumption for SBU hour labels). Show a concise less/about/busier-than-usual subheading using inclusive ten-percentage-point thresholds and actual uncapped percentages. Reuse existing data and local freshness updates; no requests, backend changes or bar overlay are added.
- The historical graph is a desired deliverable and must be genuinely attempted. Unknown internal aggregation details alone do not justify omission when returned values and their window can be presented transparently. Only an actual inability to represent the data accurately permits a documented history-only fallback. Photographs are optional enhancements; current user-authorized production assets and unresolved rights are documented below.
- **BREAKING**: Remove student submission, report history, legacy `/api/locations` read endpoints and report POST endpoint, and report-file startup/storage dependency. Existing report files remain untouched and unused.
- Preserve authentication, privacy controls, Campus Explorer and its Supabase records, and unrelated Express features. No database migrations or new runtime dependencies.

Final Groups 1–3 presentation polish retains behavior: richer live meter colors, concise relative retrieval wording and list fine print, two number-first detail metrics, text-only comparison with blue about-as-busy styling, retrieval-hour initial graph selection that respects user inspection, and separately scoped verified Main Stacks amenities under the unchanged 3rd Floor location title. The five user-approved optimized photographs appear in development and production, with placeholders retained for missing or failed images. User approval does not establish third-party reuse permission; the documented permission limitations remain unchanged.

## Capabilities

### New Capabilities

- `library-occupancy`: University-only live library occupancy, resilient on-demand caching, accessible library details, static amenities, and independently available historical bars.

### Modified Capabilities

None in the current main-spec inventory. The old `campus-crowd-meter` exists only as an unarchived completed change, not under `openspec/specs/`. This change explicitly supersedes its report-based contract; its historical artifacts are not edited or treated as an existing main spec. Do not subsequently sync its obsolete report requirements over this replacement.

## Impact

- Implementation: `server/src/libraryOccupancy.ts`, `app.ts`, `index.ts`; existing `client/src/CrowdMeter.tsx` and CSS; small API adapter and historical bar component; focused tests and setup documentation.
- Retire `server/src/crowd.ts`, report tests/configuration, and the OCR test fixture's `ReportStore` dependency without altering OCR behavior.
- Keep relative `/api` requests and existing Vercel-to-Render routing. The merged client/vercel.json supplies API-first forwarding to the reported Render origin. Hosted checks now confirm health, both occupancy contracts, real SBU data/HTTPS, cache reuse and retired GETs. Under the user-approved functional acceptance adjustment, exact hosted SHAs, Node patch and process count remain unverified operational details without blocking Task 5.3 closure. See docs/library-occupancy-readiness.md for reported Free-tier settings and timeout observations.
- Implementation, local verification and functional hosted acceptance are complete (22/22). The user merged the PR, reports green checks and approved the production UI. New-spec synchronization and archival are authorized; a separate final documentation/OpenSpec commit remains local pending push approval. No application, hosting, dependency or migration change is part of closure.

Production photograph refinement: the user has manually approved all five selected photographs and authorized production inclusion. Use optimized local WebP files in development and production, retain descriptive alt text, detail source credits, cover positions and failure placeholders. Allow WebP Git tracking/build output; preserve original JPEGs locally but exclude them from both. Third-party reuse permissions remain unverified and documented in docs/library-image-credits.md; user authorization is not a license verification. The original photograph-only pass did not include Groups 4/5; reporting retirement and local integration verification have since been completed, with hosted acceptance still pending.
