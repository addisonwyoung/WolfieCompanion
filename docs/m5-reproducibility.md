# M5 reproducibility assessment

Repository inspection: 2026-11-16. This is a source/configuration assessment, not certification of the live hosted project. No existing secret values were copied. Only local env **names** were inspected.

## Environment inventory

“Core” means authenticated profile, enrollment, social and coursework use, with the chosen project's migrations installed. All Vite settings are compiled into browser assets. Never use them for privileged credentials.

| Variable | Where consumed | Visibility | Required for core / purpose |
| --- | --- | --- | --- |
| VITE_SUPABASE_URL | client/src/account.ts | Public | Yes, Supabase project endpoint. |
| VITE_SUPABASE_PUBLISHABLE_KEY | client/src/account.ts | Public | Yes, browser Supabase client. RLS and caller sessions enforce access. |
| VITE_MAPTILER_API_KEY | client/src/campusExplorerConfig.ts | Public browser key | No; map background. Restrict provider origins/quota. |
| VITE_MAPTILER_MAP_ID | same | Public | No; approved MapTiler style ID. |
| VITE_CAMPUS_FEEDBACK_URL | same | Public | No; HTTPS/mailto suggestion link. |
| SUPABASE_URL | server/src/avatar.ts, classmatePicture.ts, friendPicture.ts, courseReviewModeration.ts | Public | Needed for API integrations, not bare health/crowd startup. Must match client project. |
| SUPABASE_PUBLISHABLE_KEY | same | Public | Needed for caller token validation/API operations. Own-avatar upload uses caller permissions. |
| SUPABASE_SERVICE_ROLE_KEY | peer picture modules and courseReviewModeration.ts | **Secret, privileged** | No for basic accounts; required for peer pictures and review publishing. |
| OPENAI_API_KEY | server/src/courseReviewModeration.ts | **Secret** | No; required for external moderation in review publishing. |
| COURSE_REVIEW_HARD_BLOCK_TERMS | same | Private server configuration | No; optional comma/newline-separated terms; empty means no configured terms. |
| PORT | server/src/index.ts | Nonsecret | No; defaults 3000. Vite proxy assumes 3000. |
| CROWD_REPORTS_PATH | same | Nonsecret local path | No; defaults to server/data/crowd-reports.json. Do not set empty; use an absolute path if overriding. |
| ENABLE_SCHEDULE_PREVIEW | index.ts, ocr/preview.ts | Nonsecret | No; only exact 1 enables local browser OCR. |
| SCHEDULE_PREVIEW_ORIGIN | server/src/ocr/preview.ts | Public origin | No; defaults http://localhost:5173; exact HTTP localhost/127.0.0.1 origin required. |
| NODE_ENV | index.ts, ocr/preview.ts | Nonsecret | No; production always disables browser OCR. |
| GOOGLE_APPLICATION_CREDENTIALS | Google Vision SDK credential discovery | Path to **secret credential material** | No; optional alternative to user ADC. Keep credential JSON outside repo. ADC also needs authorized project/quota/billing/API setup. |
| PRISMA_ENV_FILE | server/prisma.config.ts, src/lib/prisma.ts | Nonsecret path | No; defaults .env. Only literal .env.supabase switches URL selection to DIRECT_URL. |
| DATABASE_URL | same | **Secret connection URL** | No; unused Prisma runtime scaffold; selected unless PRISMA_ENV_FILE is .env.supabase. Build generation does not need a connection. |
| DIRECT_URL | same | **Secret connection URL** | No; selected by that exact Prisma filename. Not loaded automatically for Express routes. |

Vite's built-in BASE_URL and DEV are used for asset links and development-only helpers; they are not missing service credentials. The runtime scanner found no additional application-defined environment variables. Google libraries may honor their standard platform/ADC settings beyond the explicitly documented credential-file override.

Development harness settings: CHROME_PATH selects Chrome in client/test/*-browser.mjs; CALENDAR_ONLY limits scenarios in academic-browser.mjs. Neither is a core runtime dependency or part of npm test. Older documentation uses WOLFIE_TEST_DATABASE_URL as a shell placeholder for psql, not an application variable. SQL/concurrency tests require their own isolated PostgreSQL setup.

Google OAuth **client ID and client secret** are external configuration in Supabase Auth, not application env variables. The database password is only for owner database administration/scaffold use, not normal reviewer startup. No Firebase, SMTP, Socket.IO or Mapbox credentials are consumed by current application code.

## Credentials missing after cloning

Ignored local server/.env and server/.env.supabase and client/.env.local exist on the inspected machine; they do not travel with Git. Presence of a variable name does not prove its value is valid.

- Required public bootstrap configuration: Supabase URL and publishable key for client and relevant server routes.
- Required external authentication: an eligible verified Stony Brook Google identity and access to the configured Google OAuth audience. No supported alternative account is supplied.
- Full API functionality: server service-role key and OpenAI API key.
- Optional integrations: authorized Google Vision ADC/project access and billing; approved MapTiler public key/map ID.
- Independent provisioning: owner access to a Supabase project/database and a Google OAuth client. Google OAuth secrets remain in Supabase.

Public project settings can be supplied to reviewers without a database password. A service-role key is not a restricted reviewer credential: it can bypass database policies. See [Supabase API key security](https://supabase.com/docs/guides/getting-started/api-keys).

## Can the existing hosted backend support reviewers?

**Conditionally, for a dedicated development environment; safety is not established by this audit.** Source migrations implement verified Google-domain eligibility, RLS, restricted RPCs, participant checks and private avatar storage. These are intended controls, not evidence of deployed state. Public-key exposure is expected; it does not make production student data appropriate for a review environment.

Before granting access, the owner must confirm:

- This really is an isolated development project with synthetic/non-sensitive content, appropriate operator access and recoverable data.
- The complete intended migration set is installed; policies, grants, security-definer RPCs, private Storage and anonymous/second-user denial work with actual HTTP tokens.
- Google provider credentials, consent/audience/test-user access and exact callback URLs work for the reviewer. A non-Stony-Brook reviewer cannot exercise authenticated features under current eligibility rules; do not bypass them for documentation.
- Realtime publication and cross-browser updates work; messaging also has polling, which does not prove publication setup.
- Appropriate catalog/current-term/professor/section data and verified enrollment are available; course verification is an application workflow, not proof of official registrar enrollment.
- Privileged credentials remain under owner/trusted-developer control. Peer-picture endpoints check caller authorization before privileged resolution; review publishing checks eligibility/enrollment before privileged writes. Those checks still require acceptance testing.
- Provider quotas, billing and project availability cover the demonstration.

Existing eligible users can share data through intended social features; optional sharing controls do not provide tenant isolation between cohorts. OAuth test-user restrictions are not a substitute for database authorization. Anonymous crowd submission has no authentication/moderation, and normal server startup listens on 0.0.0.0 unless OCR opt-in binds it to loopback. Keep the demo API on a trusted local network; this is not a hardened public deployment.

The simplest complete M5 experience is an owner-controlled dedicated hosted Supabase project plus a trusted developer's local API with necessary secrets. For an untrusted reviewer, public configuration alone produces a reduced-feature experience. An owner-operated API is another option, but routing/hosting must be supplied and verified separately. The repository currently provides only the local Vite proxy.

## Independent hosted versus fully local setup

Migrations include accounts/storage, course reviews/catalog/enrollment verification, classmates, friendships, direct/group messages, academic items/reminders and campus records. Applying only accounts does not recreate the application. Later migrations replace earlier RPCs and policies; use prerequisite comments and review all files.

Duplicate version prefixes: 202610230001, 202610230002, 202610230003, 202610230004, 202610250001 and 202610250002. Each names two different files. This complicates version-based CLI tracking. The repository has no checked-in Supabase CLI configuration or automated full-chain replay/seed setup. This task intentionally does not rename migrations or fix ordering/authorization.

Independent hosted provisioning is plausible using owner-reviewed manual SQL, with a recorded full-filename history and fresh-project validation. It remains a manual path until that replay is tested. A complete local stack additionally requires CLI/Docker configuration, Auth/Storage/Realtime, Google provider callbacks and eligible identities, plus seed/catalog verification. See [official local setup](https://supabase.com/docs/guides/local-development/cli/getting-started), [Google provider configuration](https://supabase.com/docs/guides/auth/social-login/auth-google), and [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

The SQL bootstrap uses Auth/Storage stand-ins for isolated policy tests. It is not an auth service or a runnable backend, and must never run on hosted Supabase. No claim of a working fresh local stack is made.

## Secret handling and verification

### Server filename correction for M5

The canonical working convention is `client/.env.local` for Vite, `server/.env` for Express, and optional `server/.env.supabase` for separate Prisma tooling. Run `npm run dev` from `server/`; its entry point imports `dotenv/config` and loads `.env` from the working directory. Preserve existing files. Prisma defaults to `.env`/`DATABASE_URL`; setting `PRISMA_ENV_FILE=.env.supabase` in the invoking shell selects `.env.supabase`/`DIRECT_URL`. Express does not use that selector, and the current API does not import the Prisma scaffold.

The earlier explicit `node --env-file=.env.local --import tsx src/index.ts` command can load `.env.local`, but plain `npm run dev` does not select that file. The entry point still loads `.env` afterward, filling variables not already set. Introducing another server file therefore adds unnecessary precedence complexity. Documentation now consistently uses the existing `.env` convention.

For this follow-up, installed dotenv was checked with disposable synthetic files outside the repository: default `.env` selection, preservation of existing environment values, and explicit `.env.supabase` selection passed. Package/startup and Prisma loader code were inspected. Documentation consistency and git diff whitespace checks passed. Git ignore checks confirmed all three real env paths are excluded, and none are tracked. No real env file contents were read or changed in this follow-up; no actual configured API, OAuth, or database connection was exercised.

Root .gitignore excludes .env and .env.* at every depth, with .env.example allowed. Added exclusions cover common credential directories/JSON names, private keys, database dump/backup extensions and Supabase temporary state. Arbitrarily named SQL exports/JSON secrets still require review; ordinary migration/test SQL and non-secret JSON must remain trackable. Ignore rules do not purge existing Git history.

Only client/.env.example and server/.env.example were tracked among env files during inspection. No current tracked private-key files were found by the filename check. This is not a full historical or content-based secret scan.

No authentication code, authorization, migrations, package scripts or application functionality was changed. No hosted database operations, OAuth login, paid API calls or migrations were performed.

### Checks performed

- Node 22.23.4 / npm 10.9.9, using existing installed dependencies; a fresh clone and npm ci were not executed.
- Client: 27 test files / 254 tests passed; ESLint passed; TypeScript/Vite production build passed with a chunk-size warning.
- Server: 25 tests passed; Prisma generation and TypeScript build passed.
- Initial client tests/build and server tests hit Windows sandbox spawn EPERM. Outside-sandbox retries passed; this was an execution restriction rather than an assertion failure.
- git diff --check passed after removing an extra EOF blank line. Git still reports its normal LF-to-CRLF conversion advisory.
- git check-ignore confirmed real env paths, representative credential paths, a database dump and Supabase temporary state are ignored; both example env files remain unignored.
- Tracked env filename inspection found only the two templates. Existing credential values were neither printed nor copied. No full Git-history secret audit was performed.

Still unverified: fresh dependency installation, clean-machine startup, full migration-chain replay, managed Google OAuth/redirects and reviewer eligibility, deployed RLS/RPC/Storage/Realtime behavior, catalog/enrollment data readiness, actual peer pictures/review publishing/maps/OCR, and current hosted project's data isolation. These require owner access and real-account/provider acceptance, as described in the root README.
