# Study Spot Finder readiness verification

Verification date: November 24, 2026 (America/New_York). Scope: Group 5 of `replace-crowd-reports-with-library-occupancy`. This is local acceptance and deployment-readiness evidence, not a deployment or certification of the hosted application. No hosting configuration, Prisma setup, dependency, migration or application behavior was changed.

## Hosting evidence still required

The user cannot currently access the hosting dashboards and will request the URLs and nonsecret settings from the teammate who configured them. No Vercel/Render connector, linked project directory, checked-in Vercel rewrite, Render blueprint or production service URL was available in this checkout. Existing documentation describing Vercel-to-Render forwarding is an architectural expectation, not evidence of the deployed rule.

Task 5.3 remains **unchecked** until the following can be inspected read-only:

| Check | Current evidence / remaining work |
| --- | --- |
| Frontend origin and deployed revision | Pending Vercel URL and deployed revision. Local output is not proof that this uncommitted change is hosted. |
| API forwarding | Source uses relative `/api/libraries` and `/api/libraries/:id/history`. Vite's development proxy targets port 3000; it does not configure production. Inspect the actual Vercel rule and confirm `/api/*` reaches the intended Render `/api/*` routes before any SPA fallback. |
| Hosted route smoke | Pending frontend/backend URLs. GET health through both origins, then check live JSON and one history response through the frontend origin, including content type, status, `Cache-Control: no-store`, expected schema and timestamps. A 200 HTML SPA fallback is not a successful API response. Do not POST legacy reports against production merely to test removal. |
| Render runtime / startup | Actual Node version, build/start commands, root directory, service tier and instance/process count are pending. Source/CI checks below are local evidence only. |
| Render HTTPS and cache reuse | Pending a real request from the Render process to SBU, and cache/timestamp observations there. Local HTTPS success does not establish hosted connectivity or shared state across processes. |
| Hosted cold start | Pending tier and observed behavior. No sleep-inducing or repeated keep-alive requests were made. |
| Hosted photographs | All five local production assets pass. Their eventual Vercel static URLs and deployed revision still require hosted inspection. |

Vercel documents [external-origin rewrites](https://vercel.com/docs/routing/rewrites) for proxying APIs. This supports the architecture; it does not verify this project's deployed configuration. No rewrite or hosting setting was added or changed.

## Runtime and startup review

- Local runtime: Node **v22.23.5**, Windows x64. Existing CI selects Node 22. Actual Render Node patch version is unknown.
- Backend build remains `npm run build` from `server/`: existing `prisma generate && tsc`. Both commands passed. No dependency installation, database connection or migration was performed.
- `node dist/index.js` from `server/` was tested as a compiled production startup command, not asserted to be the configured Render command. `server/package.json` has no `start` script; the teammate must confirm their actual command. Do not change it automatically.
- Source honors `PORT`, defaults to 3000, and binds `0.0.0.0` unless local development OCR preview is explicitly enabled. A compiled production subprocess with an ephemeral `PORT` served health successfully. Even with `ENABLE_SCHEDULE_PREVIEW=1`, `NODE_ENV=production` kept the OCR preview route disabled.
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

Policies remain unchanged: five-minute live freshness, 30-minute maximum usability, 30-second failure cooldown, independent one-hour history cache, five-second upstream deadlines including body reading, in-flight deduplication, and `no-store` HTTP responses. Frontend requests have an eight-second deadline. Local age/resume timers only update display state; no polling, refresh button, keep-alive job or retry loop was added.

Caches are per Node process. Restart/redeploy clears them; multiple instances or worker processes have separate caches and can each request SBU. Actual Render process/instance count is pending. Shared visitor cache means within one process, not cross-instance persistence.

If this is a free Render web service, Render's [free-instance documentation](https://render.com/docs/free) says it can spin down after 15 idle minutes and take about a minute to wake. That can exceed the existing eight-second frontend budget. The current truthful error/reopen behavior is retained. Whether to accept that limitation or request a separately approved hosting change is a user decision **after the actual tier is known**; no paid upgrade, timeout change, warm-up traffic or background requests were introduced.

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

No hosting-specific behavior is certified until Task 5.3's pending evidence is available. This change is not archived or deployed.

Final local result: backend **46/46**, frontend **379/379**, frontend lint, both production builds, regular-build photo byte checks, compiled production startup, Study Spot Finder/Campus Explorer browser checks, strict OpenSpec validation and diff checks passed. Server has no configured lint command. The older group-messaging browser-runner failure above remains a disclosed limitation, rather than a passed check. Tasks 5.1, 5.2 and 5.4 are complete within their specified local/available-fixture scope; Task 5.3 remains pending. Overall progress is **21/22**.
