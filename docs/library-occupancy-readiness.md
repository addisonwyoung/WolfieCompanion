# Study Spot Finder readiness verification

Local baseline: November 24, 2026; integrated post-merge verification, read-only hosting assessment and subsequently approved frontend cold-start refinement: November 25, 2026 (America/New_York). Scope: `replace-crowd-reports-with-library-occupancy`, branch `feature/library-occupancy` based on merge `22da145`. The hosting assessment changed no application code; the approved frontend refinement is documented below. Hosting configuration, TLS policy, dependencies and database migrations remain unchanged. Nothing was deployed.

## Hosting assessment: confirmed, reported and pending

The teammate supplied the URLs and nonsecret service settings below. The merged repository now contains `client/vercel.json`; the earlier statement that no checked-in routing configuration was available described the pre-merge checkout and is superseded by this assessment. Dashboard/export access and exact deployed revisions remain unavailable.

| Setting | Evidence and status |
| --- | --- |
| Vercel frontend | Teammate reports production https://wolfiecompanion.vercel.app, root `client`. Its `/api/health` route was independently reachable. Actual deployed commit is unknown. |
| Vercel routing/build | Confirmed in merged `client/vercel.json`: framework Vite; install `npm ci --include=dev --include=optional`; build `npm run build`; output `dist`; `/api/:path*` forwards to `https://wolfiecompanion.onrender.com/api/:path*` **before** the SPA catch-all `/index.html`. Existing health forwarding was also observed publicly. |
| Render backend | Teammate reports https://wolfiecompanion.onrender.com, root `server`, Free tier, build `npm ci --include=dev --include=optional && npm run build`, start `node dist/index.js`, Node 22. Direct health succeeded. Dashboard settings were not independently inspected. |
| Runtime/process count | Exact Node minor/patch is unconfirmed; expected instance count is one, not independently observed. The documented Free-plan single-instance limit supports that expectation but does not reveal actual process state. |
| New library routes | Both frontend-origin GET probes returned Render-origin Express 404 responses. The current hosted app does not expose these paths; this is consistent with the feature not yet being deployed, but the deployed commit was not fingerprinted. |
| Render-to-SBU HTTPS/cache | Unverified for this implementation because the new routes are unavailable. Client-to-Vercel/Render HTTPS success does not establish Render-to-SBU certificate trust. |
| Hosted photographs | Local normal production build contains five exact optimized WebP files and no JPEG originals, as verified post-merge. Their eventual deployed revision/static URLs remain a post-deployment check. |

The reported roots and build/start commands are compatible with the repository layout: Vite builds static assets in `client/dist`; Express compiles to `server/dist/index.js` and honors `PORT`. Including development and optional dependencies keeps the existing TypeScript/Prisma build tools and platform-specific optional packages available. No command was changed and no installation/deployment was triggered.

Vercel's [external-origin rewrite documentation](https://vercel.com/docs/routing/rewrites) supports this reverse-proxy arrangement. Relative browser `/api` requests stay on the frontend origin. The observed GETs do not verify authenticated upload/header forwarding, all unrelated API routes, or deployed environment values.

## Limited production GET observations

Exactly **four** requests were made, sequentially, without authentication, cookies, request bodies, retries or mutations. No legacy reports were read/submitted and OCR was not invoked. Curl used normal HTTPS certificate verification. Safe response metadata only was retained; request/session identifiers were omitted.

| UTC time, November 25 | URL path / origin | Status and evidence | Total request time |
| --- | --- | --- | ---: |
| 18:57:24 | Vercel `/api/health` | 200 JSON `{"status":"ok"}`; `server: Vercel`, `x-render-origin-server: Render`, `x-vercel-cache: MISS` | 14.640 s |
| 18:57:25 | Render `/api/health` | 200 JSON `{"status":"ok"}`; `x-render-origin-server: Render` | 0.268 s |
| 18:59:28 | Vercel `/api/libraries` | 404 `text/html`, Express `Cannot GET /api/libraries`; Render-origin header present | 0.226 s |
| 18:59:29 | Vercel `/api/libraries/1/history` | 404 `text/html`, Express `Cannot GET /api/libraries/1/history`; Render-origin header present | 0.438 s |

Both Vercel health and 404 responses had `cache-control: public, max-age=0, must-revalidate` and cache MISS. That is **not** evidence of the new library routes' `no-store` policy, because those routes were not served. The responses were real HTTP 404s from the API path, not 200 SPA HTML fallback pages. Health forwarding is confirmed; new live/history response schemas, freshness headers and provider behavior are not.

The first observed frontend-origin request exceeded the then-existing eight-second library request deadline. The fast subsequent direct request is consistent with an initial wake-up delay, but no prior idle interval, cold-start logs or controlled same-path comparison was available. The delay cannot be attributed definitively to Render rather than network/proxy/startup factors. No deliberate spin-down wait, keep-alive schedule or timeout change was introduced.

Task 5.3 remains **unchecked**. Before completing it, use a separately authorized deployment/available release containing these changes, confirm its revision and exact Node version/process configuration, then verify the new routes through Vercel, their headers/schema/timestamps, Render-to-SBU HTTPS and cached repeats. Publicly reading existing routes does not authorize deploying the feature.

## Runtime and startup review

- Local runtime: Node **v22.23.5**, Windows x64. Existing CI selects Node 22. Actual Render Node minor/patch is unknown. Installed Vite 8.3.5 requires `^20.19.0 || >=22.12.0`; Prisma 7.10.0 requires `^20.19 || ^22.12 || >=24.0`. Thus Node 22 should be **22.12.0 or newer** for these packages; a major-version report alone is insufficient. Supabase JS 2.118.0 requires >=22.0.0 and sharp 0.35.5 requires >=20.9.0. These are installed package engine declarations, not proof of the hosted version. No runtime pin was changed.
- Backend build remains `npm run build` from `server/`: existing `prisma generate && tsc`. Both commands passed. No dependency installation, database connection or migration was performed.
- `node dist/index.js` from `server/` was tested locally as a compiled production startup command and is now also the teammate-reported Render command. `server/package.json` has no `start` script, which is compatible with using this direct Node command. Its deployed configuration is teammate-reported rather than dashboard-inspected.
- Source honors `PORT`, defaults to 3000, and binds `0.0.0.0` unless local development OCR preview is explicitly enabled. A compiled production subprocess with an ephemeral `PORT` served health successfully. The original local-only OCR switch remains disabled in production. The incoming authenticated production OCR opt-in, authorization and durable daily-limit migration were preserved and tested post-merge; their live enablement/migration installation is not verified by health.
- Neither startup nor the active library service imports `ReportStore` or reads report JSON. The compiled smoke started with the obsolete report-path setting aimed at an unusable directory; health worked and old report reads/writes returned 404. The full retirement tests additionally cover corrupt/missing storage and unchanged fixture data.
- Prisma and its configuration remain intact. The active library/app startup path does not import `src/lib/prisma.ts`; the library feature introduces no Prisma model or database requirement. This is not approval to remove Prisma or change unrelated integrations.

## Actual SBU HTTPS and cache smoke

An ephemeral local Express app used the real library service and native fetch, with a counting wrapper that changed no request parameters or cache policies. Default Node trust in this isolated shell rejected the SBU chain with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` for all five attempted population requests. These correctly became unavailable readings.

A single repeat using the **invocation-only** `--use-system-ca` option succeeded without disabling certificate verification. No source, environment file, deployed setting or TLS policy was changed. The user previously verified the ordinary local development workflow without extra certificate configuration. Render's trust behavior remains unverified; this shell's failure must not be represented as a confirmed Render fault or a requirement to deploy the flag.

Successful retrieval was approximately 7:32:45 PM campus time. These are transient retrieval results, not forecasts or sensor measurement timestamps:

| ID | Population | Display occupancy | Crowd level | Estimated remaining capacity |
| --- | ---: | ---: | --- | ---: |
| 1 | 227 | 25% | Low | 673 |
| 2 | 100 | 33% | Low | 200 |
| 3 | 69 | 20% | Low | 281 |
| 4 | 3 | 3% | Low | 107 |
| 5 | 10 | 3% | Low | 290 |

Assertions checked all percentages, levels, remaining-capacity calculations, retrieval +5-minute freshness and +30-minute usability. A repeated live GET returned identical readings/timestamps with **five successful upstream population calls total**. North's history returned 24 ordered buckets, weeks `52`, reference window `2025-11-25 13:00:00` through `2025-11-26 12:00:00`, and exactly one-hour expiry. Repeating history and live requests produced no more upstream calls: **six successful provider calls total** (five population plus one histogram), in addition to the five initial TLS failures. History did not alter live readings. Other rooms' history normalization/reference selections remain covered by the full injected-provider tests; this final smoke did not request every histogram again.

Health was verified before any provider request. The successful local smoke took about 519 ms for the measured live/history sequence; this is neither a production latency estimate nor a cold-start measurement. Temporary smoke scripts/processes were removed after verification.

## Cache and cold-start constraints

Policies remain unchanged: five-minute live freshness, 30-minute maximum usability, 30-second failure cooldown, independent one-hour history cache, five-second upstream deadlines including body reading, in-flight deduplication, and `no-store` HTTP responses. Frontend live/history requests now have a 90-second deadline including response-body reading, with accessible guidance after five pending seconds and independent error-only manual retry. Local age/resume timers only update display state; no polling, successful-reading refresh button, keep-alive job or automatic retry loop is introduced.

Caches are per Node process. Restart/redeploy clears them; multiple instances or worker processes have separate caches and can each request SBU. One instance is teammate-expected, not independently confirmed; actual process state remains unverified. Shared visitor cache means within one process, not cross-instance persistence.

For the teammate-reported Free tier, Render's [free-instance documentation](https://render.com/docs/free) says it can spin down after 15 idle minutes and take about a minute to wake. That exceeded the former eight-second frontend budget. The approved 90-second frontend deadline accommodates a typical documented wake-up but cannot guarantee hosted recovery. Delayed guidance and error-only manual retry provide truthful bounded recovery. The reported tier makes cold-start timeout risk relevant. [Render also documents](https://render.com/docs/free) that Free services cannot scale beyond one instance and may restart, consistent with ephemeral per-process caches. The approved frontend resilience refinement requires no hosting changes or costs. No paid upgrade, warm-up traffic or background requests are introduced; unusually long starts and early proxy failures can still require manual retry.

## Production assets and preservation

The regular frontend build contains exactly the five expected WebP files in `dist/images/library`, byte-for-byte equal to their optimized sources. Original JPEGs are preserved locally and absent from output. The build preserves unrelated public assets. WebP files remain eligible for Git tracking; no staging, commit or push occurred.

Existing mappings, alt text, crops, photograph source links, LinkedIn label and failure placeholders remain unchanged. Reuse permissions are still not independently verified; see [image credits](library-image-credits.md) for the user's production-use authorization and the unresolved third-party rights information.

The existing `server/data/crowd-reports.json` remains present with SHA-256 `68A533EE407D421DAB5F6BB8998627D3E173358C87CCFBB27B7A709BC3D871C0`, matching the prior baseline. No report file was deleted, migrated or written. Schema/migration files and package manifests/locks were not changed.

## Verification scope and limitations

The final command results and checklist state are recorded in the Group 5 entry in [tasks.md](../openspec/changes/replace-crowd-reports-with-library-occupancy/tasks.md).

- The production-mode Study Spot Finder browser runner builds the same component with an isolated synthetic-data entry. It checks 1280/820/375px cards/details, all five photos/credits, estimates/amenities, graph placement/order/midnight, missing/zero/over-capacity readings, comparisons, keyboard/tap, back focus, photo failures and unchanged request counts. The test entry is not part of the normal app build.
- Truthful age/expiry while open, no visibility-triggered requests, history-only errors, cancellation, comparison boundaries and placeholders are additionally asserted by frontend tests; provider failures, timeout/cooldown/deduplication/expiry and independent health/history are covered by backend tests.
- The Campus Explorer native-browser fixture passed desktop/mobile resource, map/worker, filtering, keyboard/detail and editor checks. It uses intercepted map data, not a live map-provider or database connection.
- Account/sign-in, privacy, study-group and messaging behaviors are exercised through the existing mocked frontend suites; unrelated picture authorization and OCR/provider gates through backend tests. Real Google OAuth, Supabase RLS/Storage mutations, live study-group membership and billable Google Vision were not exercised. No real student account or shared data was changed.
- The optional older `group-messaging-browser.mjs` runner timed out at line 78 when trying to click Add members. Its mouse helper clicks element coordinates without opening the current Group Settings panel; the Add members control is inside a hidden settings section. This runner and the related application files are unchanged by the library work. This is an unresolved browser-runner compatibility limitation, not a passed acceptance test or evidence of a confirmed production regression. Current group-settings behavior remains covered by focused component tests. Updating that unrelated runner was not folded into this feature verification.
- One initial concurrent full frontend run passed 378/379 and timed out waiting for the lazy Campus Explorer heading while its loading status remained visible. The final isolated serial rerun (`npm --prefix client test -- --maxWorkers=1`) passed **379/379 across 34 files**, without source or test changes. Both results are retained rather than presenting the first attempt as successful.
- Existing frontend large-chunk and backend MockTimers advisories are not new runtime failures. The backend has no lint script; TypeScript build and tests are its configured checks.

Only the four public GET observations above are verified hosted behavior. New-feature deployment acceptance remains pending Task 5.3. This change is not archived or deployed.

Original pre-merge local result: backend **46/46**, frontend **379/379**, frontend lint, both production builds, regular-build photo byte checks, compiled production startup, Study Spot Finder/Campus Explorer browser checks, strict OpenSpec validation and diff checks passed. Server has no configured lint command. The older group-messaging browser-runner failure above remains a disclosed limitation, rather than a passed check. Tasks 5.1, 5.2 and 5.4 are complete within their specified local/available-fixture scope; Task 5.3 remains pending. Overall progress is **21/22**.


## Integrated baseline and next acceptance gate

The approved post-merge run at `22da145` passed **48 backend tests and 383 frontend tests**, frontend lint, both production builds, strict OpenSpec validation, Study Spot Finder and Campus Explorer browser regression checks. That run preserved the full library feature and incoming production OCR authentication/daily-limit code. No full-suite rerun was needed for this documentation-only hosting assessment; strict OpenSpec/diff checks were rerun after documenting the findings. Historical November 24 counts and the earlier optional group-browser limitation above are retained as dated evidence.

Remaining acceptance work requires the newly implemented routes to be available on a separately authorized deployment. Confirm both deployed revisions, exact compatible Node patch and runtime process count; retrieve live/history through the frontend origin; verify application `no-store`, five locations, official history selection/order, usable data or truthful unavailable states, cache/timestamp reuse and isolation. Inspect Render-to-SBU certificate errors/logs if applicable without disabling TLS verification. Confirm the five WebP static URLs and report retirement on the deployed release without mutating report endpoints. Do not assume health proves SBU access, durable OCR quota installation or all application functionality.

The approved frontend refinement does not establish hosted acceptance. Task 5.3 and progress remain **pending / 21 of 22**.

## Approved local cold-start resilience refinement

Both occupancy GET adapters now allow 90 seconds including response-body reading, below the documented 120-second external-rewrite proxy limit. This is a frontend budget, not a guarantee that the platform will keep a connection open; early HTTP/proxy failures still show an error. Five seconds of pending work triggers polite accessible guidance. Only failure exposes Try again, scoped independently to live or historical data. Repeated activation is ignored while pending, focus remains usable, and cancellation/late-response guards and timer cleanup are retained. Successful UI designs and all backend runtime policies are unchanged.

Deterministic tests use fake clocks and synthetic responses for 15/60-second success, the 90-second header/body deadline, early 502/503/HTML errors, cancellation/reopening, keyboard retry and independent recovery. Local HTTP tests inject provider data to verify disconnects preserve in-flight shared work and live/history cache reuse. No SBU or production requests are needed for these checks. This mitigates the previously observed timeout mismatch; actual hosted behavior, deployed revisions, SBU TLS and cached responses remain pending Task 5.3.

Verification: full backend **50/50**, frontend **402/402 across 36 files**, frontend lint and both production builds passed. Strict OpenSpec validation and whitespace checks passed. Production-mode library browser checks passed at 1280/820/375px, including existing graph/photo/comparison behavior and independent keyboard retry, five-second guidance, duplicate protection and focus restoration. Desktop/mobile recovery screenshots were inspected. Campus Explorer's responsive map/editor regression passed. All five optimized WebPs are present in the normal production build, with no JPEG originals; saved report data retains SHA-256 `68A533EE407D421DAB5F6BB8998627D3E173358C87CCFBB27B7A709BC3D871C0`. Existing build chunk-size and backend MockTimers advisories remain. An initial cancellation-cleanup test exposed a lingering deadline timer when a mocked fetch ignored abort; cleanup was corrected and the full suite now passes. The initial new Chrome keyboard-retry check omitted the Enter text event; matching the existing Campus Explorer event sequence resolved the harness failure without an application change. No live upstream or production request was made for this refinement.

## Release handoff and exact post-deployment checklist

The final local review compares the entire feature with freshly fetched origin/main, including uncommitted recovery/documentation changes. Incoming Vercel routing, production OCR authorization/daily limits and all unrelated source files remain preserved. No implementation defect requiring another application change was found. The final commit and ordinary feature-branch push are authorized after checks; the user will create and merge the PR. Merging main triggers the existing Vercel/Render deployments; this handoff does not itself deploy or certify production. Photograph permission limitations in library-image-credits.md remain unchanged. Do not archive or check off Task 5.3 during this handoff.

After the user merges and both deployments report ready, perform these checks in order. Record deployed revisions, UTC timestamps, statuses, response times and sanitized results; never capture credentials or student data.

1. **Release identity/runtime:** confirm Vercel and Render deploy the intended merged revision. Confirm roots client/server, existing build/start commands, exact Render Node version (at least 22.12.0 on Node 22), Free tier and actual process/instance count using deployment logs or teammate configuration evidence. Do not change settings as part of verification.
2. **Health/forwarding:** send one unauthenticated GET to `https://wolfiecompanion.vercel.app/api/health`; expect 200 JSON status ok from Render, not SPA HTML. Time the request. Use direct `https://wolfiecompanion.onrender.com/api/health` only to diagnose a forwarding failure. Health must not depend on SBU or report storage.
3. **Live contract/cache:** GET `https://wolfiecompanion.vercel.app/api/libraries`; expect 200 JSON, `Cache-Control: no-store`, and IDs 1 through 5 with capacities 900/300/350/110/300. Check numeric normalization against population/capacity, rounded/capped live percentage, Low <=50 / Moderate <=80 / Busy >80, nonnegative estimated remaining capacity and retrieval +5/+30-minute timestamps. Unavailable metrics must be null, not invented zero. Repeat once within five minutes and compare successful readings/timestamps for cache reuse. Do not loop or repeatedly hit an unavailable provider; respect the unchanged 30-second failure cooldown.
4. **History independence/cache:** open each library detail once, inspecting its existing `/api/libraries/{id}/history` request. Expect JSON/no-store, official weeks (52 for IDs 1-3; 48,49,50 for 4; 49,50,51 for 5), 24 ordered hourly buckets for available data, accurate first/last hour and midnight marker, and retrieval +1-hour expiry. Missing and genuine zero must remain distinct, above-100% text uncapped, and history unavailable must leave live/amenities intact. Reopen one detail once within an hour to confirm identical cached history metadata without another live request. This needs at most five initial histogram requests and one cached repeat, with no baseline/provider-direct probes.
5. **SBU TLS/provider acceptance:** successful normalized live/history responses establish the deployed backend's upstream HTTPS path for that run. If data is unavailable, inspect sanitized Render logs for certificate/connectivity errors; do not disable TLS validation or assume local certificate observations apply to Render. Do not mark usable-provider acceptance passed without evidence.
6. **Photos and UI:** in one authenticated desktop session and a mobile viewport, verify all five card/detail photographs load from `/images/library/{north_reading_room,central_reading_room,health_sciences,music_library,third_floor}.webp`, source links/LinkedIn label, estimates versus seats, navigation, graph inspection and fresh-only comparison. Use browser network evidence for image requests rather than extra probes. A missing-image override can be tested locally; never delete deployed assets. JPEG originals are excluded by the verified production build.
7. **Retirement and unrelated features:** unauthenticated GETs to `/api/locations` and `/api/locations/1` must return 404 (or intentional 410), not reports/SPA HTML. Do not submit a production legacy-report POST; local tests prove retired writes. Confirm deployed startup has no report-file dependency from the released source/build/logs. Check sign-in/navigation, Campus Explorer and existing study-group/OCR entry points without mutations, uploads or billable provider calls. Full live OAuth/RLS/quota acceptance is separate from this occupancy release and must not be inferred from health.
8. **Cold-start/recovery:** on the first naturally idle Free-tier visit, record elapsed time and check accessible guidance after five seconds if still pending; a successful response within the 90-second browser budget must remove guidance without extra requests. If an early proxy error or 90-second failure occurs, verify error-only Try again, one request while pending and independent history recovery. Do not induce repeated sleep/wake cycles or add warm-up requests. Deterministic local checks cover the exact 90-second body deadline/cancellation; a fast hosted response does not prove a cold start was exercised.
9. **Close Task 5.3 only on evidence:** reconcile actual hosting/revision/runtime, forwarding, new route contracts, usable provider connectivity, cache reuse and cold-start handling. Record any unexercised check as pending; do not change the checkbox solely because deployments built successfully. Keep progress **21/22** until these acceptance criteria are satisfied; no automatic archive or deployment-setting change follows.
