# Wolfie Companion

CSE 416 — Harvey Cao, Karen Elshemy, Mina Jaromy, Addison Young.

Wolfie Companion provides student profiles, enrollment, classmates, friends, messaging, study groups, academic tasks/reminders, course reviews, and campus resources for Stony Brook students.

## M5 blockers and recommended setup

A clone contains no usable backend configuration. Google sign-in requires a verified `@stonybrook.edu` Google identity; personal Gmail/password accounts cannot substitute. There is no guest account or authenticated sample-data fallback. The owner must confirm deployed migrations, OAuth access, redirects, and demonstration data. Peer pictures and review publishing need server secrets; OCR and map backgrounds need separate services.

The simplest M5 path is a **dedicated hosted development Supabase project containing synthetic data**, with eligible reviewer accounts. Do not expose a backend containing private student data to external review. Repository inspection cannot establish the current hosted project's configuration, migration state, isolation, or availability. The [environment inventory and backend assessment](docs/m5-reproducibility.md) lists owner checks and remaining limitations.

## Prerequisites and install

- Git and access to this repository.
- Node.js 22.13+ in the 22.x line (CI uses Node 22), or Node 24+, with npm.
- Internet access to Supabase/Google, an eligible Stony Brook Google account, and owner-approved access to the selected backend.

```sh
git clone https://github.com/addisonwyoung/WolfieCompanion.git
cd WolfieCompanion
npm --prefix client ci
npm --prefix server ci
```

There is no root package.json. Each package has a committed lockfile. Use the milestone commit/branch supplied by the team; these instructions do not require a historical feature branch.

## Reviewer: existing development backend

1. Obtain the development Supabase **project URL and publishable key** from the owner. Confirm that your eligible Google account can use the configured OAuth client.
2. Copy `client/.env.example` to `client/.env.local` and `server/.env.example` to `server/.env`. Preserve any existing local files. PowerShell commands for new files:

   ```powershell
   Copy-Item client/.env.example client/.env.local
   Copy-Item server/.env.example server/.env
   ```

3. Fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in the client, and matching `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` in the server. Leave optional services blank/disabled unless provisioned. Restart both processes after changes.
4. Do not run migrations or database tests on the shared project. The owner configures it once.
5. Start two terminals from the repository root:

   ```sh
   cd server
   npm run dev
   ```

   ```sh
   cd client
   npm run dev -- --host localhost --port 5173 --strictPort
   ```

Open **http://localhost:5173**. The API prints `Wolfie API ready`; `http://localhost:3000/api/health` returns health status. Vite proxies `/api` to `127.0.0.1:3000`. Keep these ports unless you also update the proxy and callback configuration. Run the server from `server/`: `npm run dev` invokes `tsx watch src/index.ts`, whose dotenv import loads `server/.env`. The client uses Vite and keeps `client/.env.local`. Preserve existing files; no rename or additional server env file is needed. Shell environment values take precedence over dotenv values. Restart the server after env edits.

Public configuration supports the configured account/social/coursework backend and own-avatar uploads. Peer pictures and review publishing remain unavailable without server secrets. For a complete demo, the owner must securely provision secrets to a **trusted developer** on a disposable development project, or operate a separate API with matching frontend routing. A hosted API/proxy deployment is not provided here. Do not distribute privileged project-wide keys to untrusted reviewers or put them in Vite variables.

## Developer: independent backend

### Existing server and Prisma environment files

Keep `server/.env` for Express runtime and `client/.env.local` for Vite. Keep any existing `server/.env.supabase` for separate Prisma tooling; it is not an Express runtime file. Prisma configuration defaults to `.env` and `DATABASE_URL`. To select `.env.supabase` and `DIRECT_URL`, set `PRISMA_ENV_FILE=.env.supabase` in the invoking shell **before** running a Prisma command from `server/`. Putting that selector only inside `.env.supabase` cannot select the file. Existing shell values are not overwritten by dotenv. The current Express app does not import the Prisma runtime module, and normal startup/build does not require a database connection. No database tooling is needed for the reviewer startup below.

An independent **hosted Supabase test project** is feasible with manual provisioning; it is not an automated fresh-clone setup.

1. Create a dedicated test project. Review **all** `supabase/migrations/` files, their prerequisite comments and feature deployment documents. Manually apply reviewed SQL through the project's SQL Editor, starting with accounts and following full filename order after checking dependencies. Record complete filenames applied. Applying only the initial account migration is insufficient. A fresh replay of the entire chain was not validated in this documentation task.
2. Several migrations share numeric version prefixes. Do not assume Supabase CLI push/reset can replay this directory unchanged. There is no checked-in `supabase/config.toml`, CLI dependency, complete local seed, or validated local Auth setup. Do not use Prisma migrations: its schema has no application models, and the Express routes do not import the Prisma scaffold.
3. Configure a Google **Web OAuth client**, consent screen and audience. Add the callback copied from Supabase's Google provider settings to Google's authorized redirect URIs (hosted form: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`). Store Google client ID/secret **in Supabase Auth**, not application env files. Enable Google and disable other providers per the account guide. Add eligible test users if the Google project's audience/testing settings require them. Institutional account restrictions can also block access.
4. Set Supabase's development Site URL to `http://localhost:5173` and allow exact frontend redirect `http://localhost:5173/auth/callback`. Google's callback is Supabase; Supabase's callback is the frontend. Other hosts/ports require their own exact entries. PKCE must complete in the browser that started sign-in.
5. Confirm the private `avatars` bucket/policies and current RPCs exist. Verify friendship/messaging publication membership in `supabase_realtime` where migrations conditionally configure it. Confirm current-term catalog offerings, professor/section data, enrollment verification workflow, and campus records for the demo. Some migrations seed data and later ones hide demo offerings; do not assume current-term data is ready. Pending enrollment does not grant verified-course functionality.
6. Fill both env files with your project's settings and use the startup commands above. Provision optional services only when needed.

See [accounts and policies](docs/supabase-accounts.md), [semester enrollment](docs/semester-aware-enrollments.md), [classmates](docs/classmate-discovery.md), [direct messaging](docs/direct-messaging.md), [group messaging](docs/group-messaging.md), and [campus explorer](docs/campus-explorer.md). This README supersedes historical branch-specific startup instructions; feature documents retain their owner-review requirements and historical limitations.

A fully local Supabase stack is possible in principle with the [official CLI/Docker workflow](https://supabase.com/docs/guides/local-development/cli/getting-started). Missing stack configuration, duplicate migration versions, replay validation, seeds and local Google callback/eligibility configuration must be resolved first. Plain PostgreSQL and the SQL test bootstrap do **not** supply Auth, Storage, Realtime, or Google OAuth. Fully offline authenticated use is unsupported. No unverified local-stack commands are prescribed here.

## Optional services and known limitations

| Feature | Requirements / limitations |
| --- | --- |
| Peer pictures | Server-only `SUPABASE_SERVICE_ROLE_KEY`, authorized relationship/sharing and avatar resolver RPCs. Own uploads use the caller token and publishable key. |
| Review publishing | Express API, matching Supabase public settings, service-role key, `OPENAI_API_KEY`, available external moderation and verified enrollment for the offering. Missing moderation fails publishing. Review text is sent to OpenAI. Reading existing reviews does not need OpenAI. |
| Schedule extraction | Separate Google Vision API enablement, billing, permissions and ADC. OAuth sign-in credentials do not configure Vision. For hosted extraction, use the authenticated opt-in and durable quota migration in the [production OCR setup](server/README.md#production-schedule-import-render--vercel). Local extraction uses `ENABLE_SCHEDULE_PREVIEW=1` in non-production mode with the exact localhost origin. Manual enrollment works without OCR. Images go to Google on extraction. Follow [OCR setup](server/README.md#schedule-ocr-experiment-cloud-setup) using your own authorized project ID instead of its historical example. |
| Map background | Approved public MapTiler key/map ID, appropriate provider origin restrictions and quota. Without these, map background is unavailable; location browsing does not need a tile key. Optional feedback URL enables suggestion links. |
| Social demonstration | Multiple eligible independent browser sessions and suitable enrollment/friendship data. Group chat creation needs the creator plus two accepted friends. New accounts start empty. |
| Reminders | Persistent in-app reminders; no email or closed-app push implementation. |
| Study Spot Finder | SBU library occupancy through Express, with independent live/history in-memory caches. Student reports and JSON storage startup are retired; saved report files remain untouched. Campus Explorer Supabase records are separate and unchanged. |

Current services are React/Vite, Express, Supabase Auth/Postgres/Storage/Realtime, optional Google Vision, OpenAI moderation and MapTiler. Firebase, Socket.IO, Resend/SendGrid and Mapbox are not required by the implementation. Prisma is a scaffold.

## Checks and manual acceptance

From the repository root:

```sh
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
npm --prefix server test
npm --prefix server run build
git diff --check
```

Tests use mocks/injected services; passing them does not establish live OAuth, policies, Storage, Realtime, map tiles, moderation or OCR. Server build generates the ignored Prisma client before compilation without connecting to a database. CI runs client lint/build and server build/tests; run client tests locally too. No root script, server lint script or Markdown checker is defined.

SQL tests under `supabase/tests/` are for **disposable isolated local PostgreSQL only**. The bootstrap provides Auth/Storage stand-ins. Never run it or SQL fixtures on a hosted/shared project. See the [test plan](docs/test-plan.md) and feature-specific prerequisites.

Before M5, manually verify eligible sign-in, profile/enrollment persistence after reload, own-avatar upload, two-user access isolation, discovery opt-ins, friendship/messaging across browsers, group membership restrictions, reminders and catalog state. Separately exercise peer pictures, review publishing, maps and OCR when provisioned. Health success alone does not verify these integrations.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Account setup screen | Fill client Supabase settings and restart Vite. |
| OAuth redirect mismatch | Google needs the Supabase callback; Supabase needs the frontend callback. |
| Google blocked / ineligible | Owner checks audience/test users; use verified `@stonybrook.edu` Google identity. No bypass account is provided. |
| Callback wrong or fails | Check Site URL, exact allowlist and localhost:5173. Begin a fresh sign-in in the same browser. |
| Workspace/RPC/table errors | Confirm matching project/key, all required migrations and catalog configuration with the owner. Do not reset the shared database. |
| Pictures unavailable | API must run with env loaded. Peer pictures also require its service-role key, sharing and relationship authorization. |
| Review publishing unavailable | Check service-role/OpenAI configuration, provider availability and verified enrollment. Keep secret/provider payloads out of issues. |
| OCR disabled / failing | Check opt-in, exact origin, non-production mode, ADC, API, billing, permissions and quota. |
| Map background unavailable | Check approved MapTiler key/map ID and provider origin restrictions. |
| Port occupied / API refused | Stop your own older process; keep UI 5173/API 3000. Strict port avoids silent OAuth port changes. |
| Built site cannot reach API | Development proxy is not bundled. Production hosting must route `/api` to Express and serve the SPA for `/auth/callback`; deployment is not included. |

Keep local env files, tokens, private images, database exports and Google credential JSON out of commits. Gitignore cannot protect arbitrarily named secrets or remove already tracked credentials. See the [audit record](docs/m5-reproducibility.md).
