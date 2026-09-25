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
