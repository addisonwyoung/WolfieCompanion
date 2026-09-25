# Wolfie API

Run `npm ci` then `npm run dev` from server. Default port: 3000 (`PORT` overrides it).
Reports persist in server/data/crowd-reports.json. `CROWD_REPORTS_PATH` can select another file (use an absolute path). Missing storage starts empty; invalid storage stops startup rather than discarding reports.

Use one server process and persistent writable disk. This anonymous student prototype has no authentication or moderation; it is not intended for public production use.

- GET /api/health: health status.
- GET /api/locations: six locations with latestReport (null when unknown).
- GET /api/locations/:id: location, latestReport and ten recent reports newest first.
- POST /api/locations/:id/reports: JSON {"level":"Low","note":"many seats available"}. Levels: Empty, Low, Moderate, Busy, Full. Note optional, at most 200 trimmed characters. Returns 201 and a server-timestamped report. Errors: 400 invalid input, 404 unknown location, 500 save failure.

IDs are lowercase hyphenated names, e.g. north-reading-room. Every submission appends history; the last accepted report determines the current summary. No report means unknown, never Empty.

`npm test` runs isolated API/storage tests; `npm run build` compiles the server. Back up the JSON file before manually resetting demo data. Do not run multiple processes against the same file.
