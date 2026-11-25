# Study Spot Finder hosted acceptance

**Status: Task 5.3 complete; 22/22 tasks verified under the user-approved functional acceptance criteria.** Hosted verification: November 25, 2026, 19:54-20:01 UTC (14:54-15:01 America/New_York). The user reports the PR merged, all GitHub checks green, the updated interface live on Vercel, and a successful manual production UI review.

Local main was safely fast-forwarded to origin/main at `2a220d3400e917271b65c87cf28600395963c051`, whose parents include the approved feature commit `55960d439c70569f9adb34b89f23cba3b0c7871e`. Its tracked tree matches that feature commit. Final documentation is prepared on the separate local branch `docs/library-occupancy-hosted-verification`; pushing requires user approval. No application, dependency, database, TLS or hosting configuration was changed during hosted verification.

## Acceptance decision and operational evidence

On November 25 the user explicitly approved functional production verification as sufficient for Task 5.3: production routing, endpoint contracts, usable SBU data/HTTPS and cache reuse must pass. Exact deployed commit SHAs, Node patch version and instance/process count may remain transparently unverified. An induced Render cold start is neither required nor authorized; distinguish observed production responses from deterministic local recovery tests. This supersedes the earlier stricter infrastructure-evidence gate, not the application's behavior requirements.

| Item | Evidence and status |
| --- | --- |
| Local merged revision | Confirmed from freshly fetched origin/main: `2a220d3`. This is not independent proof of either hosted revision. |
| Vercel | Production https://wolfiecompanion.vercel.app; root client reported by teammate. Checked-in client/vercel.json forwards /api/:path* to Render before SPA fallback; public response headers confirm forwarding. Exact deployed SHA is unverified. |
| Render | https://wolfiecompanion.onrender.com; teammate reports root server, Node 22, Free tier, build `npm ci --include=dev --include=optional && npm run build`, start `node dist/index.js`, expected one instance. Exact deployed SHA, Node patch and actual instance/process count are unverified; no dashboard/export access is available. |
| Runtime compatibility | Existing commands, roots, PORT binding and startup match the integrated implementation. Local Node v22.23.5, tests and builds pass; CI uses Node 22 and the user reports green checks. Installed Vite/Prisma require at least 22.12.0 on Node 22. This requirement does not establish the hosted patch version. |
| Deployment metadata | One public GitHub deployments lookup returned an empty list; it supplied no hosted revision evidence. No credentials were sent. |
| Render-to-SBU | Functional HTTPS connectivity confirmed: the live request after expiry returned newly retrieved, normalized SBU data; all five historical responses were available. No direct SBU probe, certificate bypass or TLS change was made. Hosted trust-store contents were not inspected. |
| Production UI | User's successful manual production review is accepted UI evidence. Previous synthetic desktop/tablet/mobile checks cover layout, photos, graph, source attribution, comparison, failure and recovery interactions. No authenticated student session or private data was accessed by this verification. |

## Limited production GET observations

Exactly **12 unauthenticated, non-mutating application GETs** were made through the Vercel origin, without request bodies, cookies, credentials, automatic retries or polling. The separate public GitHub metadata lookup did not contact Render or SBU. Only sanitized results are retained here; temporary raw response files remain outside the repository.

| Path / check | HTTP | Seconds | Result |
| --- | ---: | ---: | --- |
| /api/health | 200 | 0.187479 | JSON status ok, Render-origin header, Vercel cache MISS. |
| /api/libraries, first | 200 | 0.156623 | Five fresh cached readings, original retrieval around 19:49:43 UTC. |
| /api/libraries, after expiry | 200 | 0.452300 | New successful retrievals around 19:59:26 UTC. |
| /api/libraries/1/history | 200 | 0.172148 | Available, 24 ordered buckets, weeks 52. |
| /api/libraries/2/history | 200 | 0.171681 | Available, 24 ordered buckets, weeks 52. |
| /api/libraries/3/history | 200 | 0.159086 | Available, 24 ordered buckets, weeks 52. |
| /api/libraries/4/history | 200 | 0.173800 | Available, 24 ordered buckets, weeks 48,49,50. |
| /api/libraries/5/history | 200 | 0.154546 | Available, 24 ordered buckets, weeks 49,50,51. |
| /api/libraries/1/history, repeat | 200 | 0.168947 | Identical cached body, retrieval and expiry timestamps. |
| /api/locations | 404 | 0.181502 | Render-origin Express Cannot GET response, no reports or SPA fallback. |
| /api/locations/1 | 404 | 0.149012 | Render-origin Express Cannot GET response, no reports or SPA fallback. |
| /api/libraries, within new freshness window | 200 | 0.195785 | Identical body/timestamps to the after-expiry response. |

All nine occupancy responses had `Cache-Control: no-store`, JSON content type, `X-Render-Origin-Server: Render` and `X-Vercel-Cache: MISS`. Identical successful values and retrieval timestamps on repeats demonstrate observable backend cache reuse rather than frontend/CDN response reuse. History requests did not renew live timestamps. Upstream request counters and process topology were not directly inspected. Health instead had public max-age=0/must-revalidate; it must not be misreported as an occupancy no-store response.

The first live repeat happened after the original five-minute freshness window, so its new timestamps were expected. One additional GET within the new window established cache reuse; this was a planned verification request, not an automatic retry or keep-alive.

### Live normalization

The after-expiry response contained the following real SBU counts. All statuses were fresh; source URLs, IDs/names/capacities and numeric fields matched the contract. Percentages equal min(100, rounded population/capacity * 100); crowd boundaries remain Low <=50, Moderate <=80, Busy >80. Remaining capacity is max(0, capacity - population), not available seats. Each freshUntil/usableUntil was exactly retrieval +300/+1800 seconds.

| Location | Capacity | Population | Percentage | Crowd | Estimated remaining capacity |
| --- | ---: | ---: | ---: | --- | ---: |
| North Reading Room | 900 | 26 | 3% | Low | 874 |
| Central Reading Room | 300 | 11 | 4% | Low | 289 |
| Health Sciences Library | 350 | 58 | 17% | Low | 292 |
| Music Library | 110 | 0 | 0% | Low | 110 |
| 3rd Floor | 300 | 11 | 4% | Low | 289 |

### Historical normalization and time windows

All five responses had 24 consecutive hourly buckets in returned order, midnight crossing, matching hour/reference strings, finite nonnegative counts, correctly calculated uncapped percentages and expiry exactly one hour after retrieval. There were no missing or above-100% buckets in this production sample; local fixtures cover both. Genuine zero counts remained zero.

| IDs | Weeks | Returned reference window (timezone-less strings, preserved) | Zero buckets |
| --- | --- | --- | --- |
| 1 | 52 | 2025-11-26 08:00 through 2025-11-27 07:00 | 15 |
| 2 | 52 | 2025-11-26 08:00 through 2025-11-27 07:00 | 17 |
| 3 | 52 | 2025-11-26 08:00 through 2025-11-27 07:00 | 0 |
| 4 | 48,49,50 | 2025-12-24 08:00 through 2025-12-25 07:00 | 13 |
| 5 | 49,50,51 | 2025-12-17 08:00 through 2025-12-18 07:00 | 10 |

Historical retrieval timestamps were approximately 19:49:54-19:50:19 UTC, before this verification, consistent with existing independent one-hour caches. The North repeat retained its original 19:49:54.448Z retrieval and 20:49:54.448Z expiry. Reference datetimes do not identify every contributing sample; no new weekday, seasonality or predictive-accuracy claim follows. America/New_York hour matching remains an accepted assumption for comparison, not a newly verified provider timezone guarantee.

## Cold-start resilience: observed versus tested

This session observed fast successful production requests (0.149-0.452 seconds), not a demonstrated sleeping-backend wake-up. No artificial idle interval, sleep request, keep-alive or background traffic was introduced. The earlier pre-release 14.640-second forwarded health request followed by 0.268-second direct health is retained as a latency observation; it did not isolate Render cold start.

The released client allows 90 seconds including body reading, announces delayed guidance after five pending seconds, and offers independent error-only Try again with duplicate protection. Local deterministic tests cover 15/60-second success, 90-second fetch/body timeout, early HTTP/HTML failures, cancellation/reopening, ignored late responses, keyboard/focus and live/history independence. Local HTTP tests confirm browser disconnects preserve shared provider work/cache results. Hosted timeout/retry failure states were not deliberately induced; user production UI approval and successful live/history behavior do not claim otherwise.

[Render Free documentation](https://render.com/docs/free) describes idle spin-down and about a minute to wake. A 90-second frontend budget mitigates this without guaranteeing platform availability. [Vercel external rewrites](https://vercel.com/docs/routing/rewrites) support the checked-in forwarding arrangement; early platform errors can still require manual recovery. Process-local caches reset on restart and are not shared across processes. Five-second provider deadlines, five-minute live freshness, 30-minute live usability, independent one-hour history cache, 30-second failure cooldown and deduplication are unchanged.

## Local verification, preservation and limitations

The final pre-merge run passed **50/50 backend tests, 402/402 frontend tests across 36 files, frontend lint, both production builds, strict OpenSpec validation and git diff checks**. Production-mode synthetic library checks passed 1280/820/375px, including existing design, photos/credits/fallback, estimates/amenities, chronological graph, midnight/missing/zero/112% handling, comparisons, keyboard/tap, delayed loading/retry, focus and request counts. Campus Explorer desktop/mobile map/worker/editor regressions passed. All five production WebPs were byte-identical to tracked assets and no original JPEG appeared in build output. User production review adds actual deployed presentation approval, not proof of third-party photograph rights.

Saved report data retains SHA-256 `68A533EE407D421DAB5F6BB8998627D3E173358C87CCFBB27B7A709BC3D871C0`; files remain untouched, ignored and unused. Production read routes return 404. Local tests verify retired POST writes and report-independent compiled startup with corrupt/inaccessible storage; no production report POST or storage mutation was attempted. Authentication, Campus Explorer, OCR authorization/daily limits, study groups, Prisma, manifests/locks and migrations remain unchanged by the final documentation work. Real OAuth/RLS/Storage mutations and billable OCR are outside this verification; their success must not be inferred from health.

Previously disclosed local limitations remain historical: the older optional group-messaging browser runner targets hidden Add members controls; its unrelated source/runner was not changed and current group settings pass component tests. An early concurrent frontend run timed out on a lazy Campus Explorer heading; the final isolated full suite passed. Existing chunk-size/MockTimers advisories are not new failures. One isolated Windows smoke needed invocation-only system certificate trust; the application's TLS settings were not changed, and current production upstream connectivity is independently successful.

[Photograph credits and original source URLs](library-image-credits.md) retain unverified third-party reuse permissions, including LinkedIn/Facebook assets and the representative 3rd Floor staircase's uncertain floor/sensor relationship. User production approval is not a license grant. Images remain replaceable through local WebP assets and metadata with existing placeholders.

## Closure

Functional production acceptance passes under the explicit adjusted criteria. Task 5.3 is checked, giving **22/22**. The [new library-occupancy main specification](../openspec/specs/library-occupancy/spec.md) is synchronized and only this completed change is [archived with its final task record](../openspec/changes/archive/2026-11-25-replace-crowd-reports-with-library-occupancy/tasks.md); superseded student-report requirements are not synchronized. Exact hosted revisions, Node patch/process count, controlled cold-start behavior, provider internal historical aggregation and photograph reuse rights remain accurately unverified limitations, not silently confirmed facts. No final documentation branch push is authorized until the user reviews this result.
