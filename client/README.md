# Wolfie Companion

For current M5 prerequisites, reviewer versus independent-backend setup, service requirements and verification limits, use the [root setup guide](../README.md). Sections below include historical feature notes; current discovery uses live backend data rather than fictional classmates.

Google sign-in opens your personal profile and saved current classes. Fictional classmates remain labeled demonstrations; saved classes do not prove official registration.

## Run locally

Follow [Supabase account setup](../docs/supabase-accounts.md) for migrations, Google provider configuration, and environment values. From `client/`, run `npm ci` and `npm run dev`. Run the API from `server/` with the documented environment for profile pictures and library occupancy.

Edit your name, major, year, interests, commuter/dormer status, and picture, then Save or Cancel. Saved profile and classes restore after reload/login. Manual class entry does not require OCR.

## Checks

Run `npm test`, `npm run lint`, and `npm run build` from `client/`. Automated tests use injected/mocked account and OCR services; real Google/Supabase acceptance requires a configured project.

## Study Spot Finder

Start the backend and Vite frontend using the setup above. After sign-in, select **Explore → Study spaces** (`?view=spaces`). The existing mount and navigation are preserved. The development proxy forwards `/api` to port 3000; deployed builds retain the existing Vercel-to-Render `/api` forwarding.

Five library cards show SBU university sensor occupancy, rounded percentages, Low/Moderate/Busy levels and retrieval ages. Opening the feature requests `GET /api/libraries` once, subject to Express's shared five-minute cache. Selecting a card opens details; returning to the list reuses those readings. There is no refresh button, student report UI, polling, or foreground network refresh. To request new readings, leave Study Spot Finder and reopen it. A backend or network failure never substitutes student reports or invented zero occupancy.

Local display timers advance retrieval age, label five-minute-old readings stale and remove current population/percentage/level/remaining-capacity metrics after 30 minutes. Focus, visibility resume and page restore re-evaluate age without fetching. Retrieval time is the backend's successful fetch time, not a sensor measurement timestamp. Relative ages use Retrieved / Last retrieved, with exact times available on timestamp hover. The list uses subtle fine print instead of a global age warning. Unavailable locations remain selectable for facilities information.

Local smoke verification on November 24, 2026 returned five actual SBU readings through Express; the second request reused all five cached values/timestamps with no extra upstream calls. The earlier agent smoke environment required system-CA trust, but the user subsequently verified the usual `npm run dev` workflow without extra certificate configuration. No application TLS setting or deployed configuration was changed or is required by this feature.

Details distinguish estimated remaining **occupancy capacity** from actual empty study seats. Numerical computer/outlet/room counts are sourced static facilities, not live availability. [SBU Places to Study](https://library.stonybrook.edu/services/access-services/places-to-study/) is the source; Health Sciences counts are explicitly library-wide. ID 5 retains the location title “3rd Floor.” Its separate amenities card identifies Main Stacks facilities: 56 small-table seats, 199 study-carrel seats, 4 lounge chairs and 276+ outlets. The sensor footprint remains unconfirmed; these facilities do not establish that the sensor exclusively monitors Main Stacks.

All five optimized local WebP photos appear in both development and production; missing images retain the styled placeholders. Metadata in `libraryDetails.ts` controls `src`, `alt`, `credit`, `sourceUrl` and `position`. See the image credits document for user publication approval and unverified third-party permissions. The historical card beneath amenities fetches only on detail entry, independently of live data, through a one-hour backend cache. Rounded hourly bars preserve SBU's returned order/window with a fixed 0–100% scale and hover/tap/keyboard inspection. Missing readings and genuine zero are distinct; values above capacity are disclosed with capped bar heights. See [verified historical API findings and limitations](../docs/library-occupancy.md). Legacy backend report routes and storage initialization are retired; existing saved report files remain untouched. Campus Explorer data is unchanged.

Verification: `npm test -- libraryOccupancy.test.tsx` from `client/` covers requests, navigation, age/expiry, cancellation and failure states. From the repository root, `node client/test/library-occupancy-browser.mjs` uses installed Chrome/CDP to check three/two/one-column cards, responsive details, keyboard focus, no page overflow and no extra requests at 1280/820/375px. Its local synthetic preview is `/test/library-occupancy-preview.html`; no SBU or private account data is used. Browser screenshots are written to a temporary directory printed by that command. Run the regular test, lint and build checks above too.

History follows SBU's official room-specific reference weeks: IDs 1–3 use 52, Music
uses 48,49,50, and 3rd Floor uses 49,50,51. The adapter validates returned selection
metadata for each room. The graph keeps a concise reference-week/not-a-forecast
description; concise window/interaction guidance is in collapsed **About this data**. Technical week selections, reference timestamps and source limitations
remain in developer documentation. No seasonality or predictive
accuracy claim is made. This is a Group 3 refinement; request counts and all live
freshness/cache behavior remain unchanged.

Library details also show a fresh-live versus historical comparison under the graph
heading as a compact green/blue/amber subheading with no supporting sentence. Initial graph selection matches the live retrieval hour when valid and otherwise uses the first bucket; user inspection persists. Details show only Current occupancy and Est. remaining capacity, with a short available-seats qualification. It uses the campus hour of the live retrieval timestamp (assuming SBU's
hour labels are America/New_York) and actual uncapped percentages, with inclusive
ten-percentage-point thresholds. Missing/ambiguous matching hours and non-fresh
readings hide the comparison. Existing local expiry updates remove it without
refetching; main cards, graph bars and backend/cache behavior are unchanged. The
reference-week basis and hour assumption are disclosed under About this data.

## Schedule upload preview

Run `npm ci`, then `npm run dev -- --host localhost --port 5173 --strictPort`. In a second terminal, set `ENABLE_SCHEDULE_PREVIEW=1` in `server/.env`, then start the API from `server/` with `npm run dev` and configured Google ADC credentials. Open http://localhost:5173 and select Import schedule beside Your courses.

Choose one PNG/JPEG up to 10 MiB, pick SOLAR class list or weekly calendar, and press Extract classes. Selection alone stays local; extraction sends the image to Google. Edit Course code and Section, add/remove rows, or Clear/Close. Review the unverified results and click Add to Your courses to merge course codes and sections into your Supabase account. Existing courses stay, duplicate pairs are merged, and saved classes restore after reload/login. Extraction and edits alone remain temporary; screenshots are never saved. If preview is disabled, restart the API with the flag; for another frontend port, configure the server's exact `SCHEDULE_PREVIEW_ORIGIN` to match.

`npm test` runs offline component tests; `npm run build` and `npm run lint` check the app. Real extraction needs Google access and uses OCR units only when explicitly requested.

## Accounts

Google sign-in, editable profiles/pictures, and saved classes require the Supabase configuration in [account setup](../docs/supabase-accounts.md). Copy `.env.example` to `.env.local` and supply the project URL and publishable key before starting Vite. The authenticated dashboard has no personal sample-data fallback. Manual class entry works without the development-only OCR service; only explicit class confirmation persists enrollment.

## Library photographs

The five user-selected WebP images in `public/images/library/` appear in development and production, with named fallback placeholders and clickable detail-only photo source credits. Original JPEGs are preserved locally but ignored by Git and excluded from build output. See [image credits and permission status](../docs/library-image-credits.md). The third-floor image depicts a staircase, not Main Stacks. Health Sciences displays "LinkedIn" with the original William Wertheim post URL. Occupancy identity and sensor coverage are unchanged.

Optimized WebP files are eligible for Git tracking. Vite's build filter publishes the five named WebP files and preserves other public assets while excluding originals. The user explicitly approved production inclusion; third-party reuse permissions remain unverified. Images remain replaceable through their local files and metadata; update the build allowlist if a filename changes.

`node client/test/library-occupancy-browser.mjs --production` builds the same Study Spot Finder UI in production mode into an isolated temporary directory with a synthetic-data entry, serves it with Vite preview, and runs photo/detail/fallback checks. It does not add a test page to the regular application build, bypass actual account authorization or contact SBU.

`node client/test/library-occupancy-browser.mjs --optimize-photos` uses installed Chrome canvas to create WebP copies at up to 1200px wide, preserving aspect ratio and originals. Quality starts at 0.90 and decreases only for images exceeding the approximately 250 KB target. No project dependency is installed. The normal browser command checks all five card/detail photos at 1280/820/375px and actual missing-image fallback without extra occupancy requests. Do not commit its screenshots (they remain in its printed temporary directory).
