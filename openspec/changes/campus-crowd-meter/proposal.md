# Proposal

## Why

Students need a quick way to see and share how crowded campus study spaces are. A shared crowd meter adds a complete campus utility workflow to the existing profile/course prototype.

## What Changes

- Add a study-location list and detail view for North Reading Room, Central Reading Room, Second Floor Core, Main Stacks, Galleria, and Music Library.
- Show the latest reported level (Empty, Low, Moderate, Busy, Full), its age, and recent reports.
- Accept new reports with server timestamps and optional notes up to 200 characters. Updating a location means submitting another report, preserving history.
- Share reports through the existing server, persist them across restarts, and refresh open views every 15 seconds.
- Preserve the existing dashboard and its offline sample-data behavior. Crowd reporting requires the backend.
- Exclude authentication, maps, sockets, voting, aggregation, editing/deleting historical reports, and production moderation from this prototype.

## Capabilities

### New Capabilities

- `campus-crowd-meter`: Shared study-location crowd reports, current summaries, report submission, timestamps, and history.

### Modified Capabilities

None. Existing dashboard requirements remain unchanged.

## Impact

Adds React views and API access, Express routes and a small file-backed report store, a development API proxy, focused server tests, and run instructions. Uses existing runtime dependencies; no external service or account is required. Intended for one server process with writable persistent local storage.
