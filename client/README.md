# Wolfie Companion prototype

An interactive frontend demo with a sample profile and course-based classmates.
All people and enrollments are fictional. Courses are fixed to CSE 416, CSE 310,
AMS 210, and AMS 261; no official enrollment or course information is implied.

## Run locally

From the repository root:

```sh
cd client
npm ci
npm run dev
```

Open the local URL printed by Vite. No backend, account, database, environment
variables, or external services are needed.

Edit the sample profile's major, year, and comma-separated interests, then Save
or Cancel. Select a course to browse its classmates. Saved profile edits remain
while switching courses and reset to the original sample profile on page reload.
Nothing is written to browser storage or sent to a server.

## Checks

From `client`:

```sh
npm run lint
npm run build
```

Browser verification covers desktop and 375-pixel layouts, keyboard-only editing
and course selection, validation, Cancel/reopen, reload reset, distinct rosters,
and empty results. See the change's `verification.md` for recorded results.

Authentication, persistent profiles, course editing/import, messaging,
recommendations, and study groups are outside this prototype.

## Campus crowd meter

In two terminals, start the backend with `cd server && npm ci && npm run dev` and the frontend with `cd client && npm ci && npm run dev` (from the repository root). Open the Vite URL and select **Study spaces**. The development proxy forwards /api to port 3000. For a deployed build, configure the web host to forward /api to the same backend; no deployment is included here.

Select any of the six locations, choose Empty/Low/Moderate/Busy/Full, optionally enter a note up to 200 trimmed characters, then submit. The newest accepted report sets the summary; the latest ten reports are shown. Times include relative age and exact local date/time. Reports are student observations, not measured occupancy.

For a two-user demo, open a second independent browser session against the same app/backend. Submit in the first and wait up to the next 15-second refresh in the second (or return it to the foreground). Reports survive page reload and server restart with the same storage. See server/README.md for the persistent path and single-process restriction. Profile/course sample data still works when the server is stopped; crowd requests show retry errors and retain unsent notes.
