# Wolfie Companion

Google sign-in opens your personal profile and saved current classes. Fictional classmates remain labeled demonstrations; saved classes do not prove official registration.

## Run locally

Follow [Supabase account setup](../docs/supabase-accounts.md) for migrations, Google provider configuration, and environment values. From `client/`, run `npm ci` and `npm run dev`. Run the API from `server/` with the documented environment for profile pictures and crowd reports.

Edit your name, major, year, interests, commuter/dormer status, and picture, then Save or Cancel. Saved profile and classes restore after reload/login. Manual class entry does not require OCR.

## Checks

Run `npm test`, `npm run lint`, and `npm run build` from `client/`. Automated tests use injected/mocked account and OCR services; real Google/Supabase acceptance requires a configured project.

## Campus crowd meter

In two terminals, start the backend with `cd server && npm ci && npm run dev` and the frontend with `cd client && npm ci && npm run dev` (from the repository root). Open the Vite URL and select **Study spaces**. The development proxy forwards /api to port 3000. For a deployed build, configure the web host to forward /api to the same backend; no deployment is included here.

Select any of the six locations, choose Empty/Low/Moderate/Busy/Full, optionally enter a note up to 200 trimmed characters, then submit. The newest accepted report sets the summary; the latest ten reports are shown. Times include relative age and exact local date/time. Reports are student observations, not measured occupancy.

For a two-user demo, open a second independent browser session against the same app/backend. Submit in the first and wait up to the next 15-second refresh in the second (or return it to the foreground). Reports survive page reload and server restart with the same storage. See server/README.md for the persistent path and single-process restriction. Supabase profile/class requests go directly to Supabase; pictures and crowd reports require the API. Crowd failures show retry errors and retain unsent notes.

## Schedule upload preview

Run `npm ci`, then `npm run dev -- --host localhost --port 5173 --strictPort`. In a second terminal, start the API from `server` with `ENABLE_SCHEDULE_PREVIEW=1 npm run dev` and configured Google ADC credentials. Open http://localhost:5173 and select Import schedule beside Your courses.

Choose one PNG/JPEG up to 10 MiB, pick SOLAR class list or weekly calendar, and press Extract classes. Selection alone stays local; extraction sends the image to Google. Edit Course code and Section, add/remove rows, or Clear/Close. Review the unverified results and click Add to Your courses to merge course codes and sections into your Supabase account. Existing courses stay, duplicate pairs are merged, and saved classes restore after reload/login. Extraction and edits alone remain temporary; screenshots are never saved. If preview is disabled, restart the API with the flag; for another frontend port, configure the server's exact `SCHEDULE_PREVIEW_ORIGIN` to match.

`npm test` runs offline component tests; `npm run build` and `npm run lint` check the app. Real extraction needs Google access and uses OCR units only when explicitly requested.

## Accounts

Google sign-in, editable profiles/pictures, and saved classes require the Supabase configuration in [account setup](../docs/supabase-accounts.md). Copy `.env.example` to `.env.local` and supply the project URL and publishable key before starting Vite. The authenticated dashboard has no personal sample-data fallback. Manual class entry works without the development-only OCR service; only explicit class confirmation persists enrollment.
