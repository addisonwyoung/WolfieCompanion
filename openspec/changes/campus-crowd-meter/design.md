# Design

## Context

See proposal.md for motivation. The existing React dashboard uses local sample data. Express currently exposes only /api/health; no database, authentication, or test runner is configured. The durable prototype-dashboard spec requires the existing screen to work without the backend. This feature spans client and server and therefore needs an integration design.

## Goals / Non-Goals

**Goals:** Deliver one shared location-to-report flow with few dependencies and a clear source of truth.

**Non-Goals:** Production deployment, verified reporters, historical report editing, crowd averaging, maps, distributed storage, or real-time sockets.

## Decisions

1. **Separate crowd view in the existing shell.** Keep dashboard as the default; add navigation to Study spaces using local view state, preserving profile and course state in App. Existing components remain independent of the crowd API. Use relative /api requests and a Vite development proxy to port 3000. A router is unnecessary for this prototype.

2. **One Express service with file persistence.** Keep the six locations as server-owned constants with stable slug IDs. Store reports as { id, locationId, level, note, submittedAt }; array order is acceptance order. Use a JSON file at a documented configurable path, defaulting to server/data/crowd-reports.json, ignored by Git. Serialize write operations, write a temporary file then rename, and acknowledge only after successful persistence. Update in-memory state only after the write succeeds. Missing storage initializes empty; malformed existing storage must fail clearly, never silently reset. This is sufficient for one student-demo server. Browser storage cannot share across users; PostgreSQL/Prisma adds setup beyond this feature and can replace the store later.

3. **Small API contract.** GET /api/locations returns { locations: [{ id, name, latestReport }] }. GET /api/locations/:id returns { id, name, latestReport, reports }, with ten latest reports descending. POST /api/locations/:id/reports accepts { level, note? }, returns 201 with the accepted report. Use 400 for invalid input, 404 for unknown location, and 500 for storage failures with safe messages. Generate UUIDs and ISO UTC timestamps on the server; ignore client-supplied identity/timestamp fields. Latest means last accepted, not majority opinion. Repeated submissions are new observations, not edits. Enforce five exact level strings and the 200-character trimmed note bound on the server as well as the form.

4. **Polling over sockets.** Fetch on entry, every 15 seconds while visible, and on foreground return. Refetch summary/detail after a successful submission, showing its accepted report immediately. Cancel obsolete requests or guard responses by location/request generation, including pre-submission polls. Clear timers on exit. Retain draft on errors, disable submit while pending, and distinguish a saved report from a subsequent refresh failure. Polling keeps the implementation understandable at prototype scale.

5. **Honest freshness.** Show Latest student report, relative age, and an accessible exact date/time for each report. Recompute relative labels every minute. No report means unknown, never Empty. Old reports remain visible with their age; no automatic expiration or invented freshness. Notes render through ordinary React text. Use text labels alongside colors and existing responsive styling.

## Risks / Trade-offs

- One writable file is unsuitable for multiple server processes or ephemeral hosting -> Document a single persistent server instance; serialize writes and test simultaneous submissions and restart recovery.
- Anonymous prototype reports are unverified -> Label them student-reported and keep authentication/moderation out of this local demo; do not claim production readiness.
- Polling introduces delay -> Specify the 15-second refresh interval and display report ages and refresh failures.
- Latest report may conflict with others -> Keep recent history visible rather than add aggregation logic.

## Migration Plan

Add API/store modules and client views; preserve /api/health. Add focused API/store tests using Node's test runner with the existing tsx tooling, isolated temporary storage, and a server npm test command in CI. Document starting both servers and the storage path. No external accounts or database migration are needed. Rollback removes the crowd feature while leaving its data file intact for recovery.
