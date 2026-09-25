# Tasks

## 1. Shared report API

- [x] 1.1 Add the six location constants and serialized file-backed report store; test empty initialization, successful restart recovery, timestamp ties, concurrent writes, write failure, and rejection of corrupt storage using temporary files.
- [x] 1.2 Add location list/detail and report creation routes with server IDs/timestamps, validation, latest summaries, and ten-report history; verify API tests cover all levels, optional notes, 200-character boundary, invalid input, unknown locations, and preservation of /api/health.
- [x] 1.3 Add a server test command and CI test step, ignore runtime report files, and document the API, storage configuration, and single-process limitation; verify npm test and npm run build in server and exercise the documented startup instructions.

## 2. Crowd-meter interface

- [x] 2.1 Add Study spaces navigation, six-location list, detail/back interaction, level labels, history, and empty/loading states using the existing style system; verify all locations and that profile/course state remains intact when returning to the dashboard.
- [x] 2.2 Add the report form with five levels, optional note, validation, pending state, success feedback, and retained drafts on failure; verify a submission updates summary/history, subsequent submissions preserve history, and notes render as text.
- [x] 2.3 Add the development API proxy, 15-second polling, foreground refresh, minute-based relative ages, exact timestamps, request cancellation/order guards, and retry/stale-data feedback; verify navigation during delayed requests, API outages, and a successful save followed by a refresh failure.
- [x] 2.4 Document both-server startup and the two-browser demo in client/README.md; verify the instructions and the keyboard-only flow at desktop and 375-pixel widths without overflow.

## 3. Integrated verification

- [x] 3.1 Use two independent browser sessions against the same backend to verify another user's report appears on the next refresh; restart the server and confirm report history/timestamps survive, recording results.
- [x] 3.2 Run client lint/build, server tests/build, and OpenSpec strict validation; confirm existing profile/course behavior with the backend stopped and record results plus any remaining limitations.
