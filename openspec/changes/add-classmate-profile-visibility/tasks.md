# Tasks

## 1. Persist sharing and restrict peer projections

- [x] 1.1 Add an additive migration for four default-false visibility flags and an authenticated course/peer detail RPC with allowlisted conditional JSON keys. Verify isolated local SQL covers existing/new defaults, each independent flag, shared empty values, normalized courses, self exclusion, and unchanged roster output.
- [x] 1.2 Add the service-role-only current-avatar resolver with independently checked trusted eligibility and both course memberships; revoke public/anon/authenticated execution. Verify SQL denies anonymous/ineligible/unrelated/unknown peers, forged caller access from authenticated role, private/removed/superseded avatars, peer writes, and direct table reads while preserving existing policies.
- [x] 1.3 Document migration order, detail projection/error contract, grants, and owner-only manual deployment in `docs/classmate-discovery.md`; verify the isolated bootstrap/migration/test sequence succeeds without shared credentials.

## 2. Owner sharing controls

- [x] 2.1 Extend account types and save/load to persist flags atomically with profile fields, defaulting absent flags to false. Verify adapter tests cover round trips, failed saves, and retained private values after revocation.
- [x] 2.2 Add independent sharing checkboxes to `Profile.tsx`, fixed name/major audience copy, and updated picture help. Verify profile tests cover private defaults, individual toggles, cancel, save/reload persistence, retained drafts on failure, and unset major without forced completion.
- [x] 2.3 Update account/discovery guidance to explain mandatory baseline visibility, opt-in optional fields, and self-reported audience limitations; verify UI tests assert the new explanation and remove obsolete no-controls claims.

## 3. Authorized picture delivery

- [x] 3.1 Add an authenticated classmate-picture endpoint using verified bearer identity, caller-scoped authorization, service-only resolver, and server-only private Storage download. Verify server tests deny missing/invalid credentials, ineligible users, unrelated courses, forged targets/paths, revoked sharing, replaced/removed pictures, and missing server configuration without leaking values.
- [x] 3.2 Return validated image bytes with private/no-store headers and generic safe errors, preserving existing upload behavior. Verify successful delivery, content type, response headers, absence of path/signed URL exposure, and existing avatar tests.
- [x] 3.3 Document the server-only service credential, deployment order, failure behavior, and rollback; verify no secret is in browser configuration or tracked files and picture failure leaves text profiles usable.

## 4. Roster-to-profile interaction

- [x] 4.1 Add a strict detail adapter/model and request hook keyed by account/course/peer/retry. Verify tests cover allowlisted fields, malformed responses, unavailable versus transient errors, fresh reopening, and late-response masking across peer/course/account/auth changes.
- [x] 4.2 Wire View profile buttons and a read-only dialog into `CourseBrowser.tsx`/`App.tsx` with shared-field rendering and initial-based picture fallback. Verify keyboard activation, focus trap, Escape/close and focus return, preserved course/roster, private-section omission, empty fields, and no messaging action.
- [x] 4.3 Add authenticated picture blob loading with object-URL cleanup and stale-response guards; clear detail selection on navigation/auth/course changes. Verify picture-only failure keeps text visible and close/account/view changes revoke resources and cannot reveal previous peer data.
- [x] 4.4 Update discovery workflow documentation and tests for loading/retry/unavailable states and stable UUID after name changes; verify no fictional fallback and no use of owner editor for peer profiles.

## 5. Integration acceptance

- [x] 5.1 Run client tests/lint/build, server tests/build, and isolated SQL suites including existing accounts/discovery regressions. Record command results and distinguish local fixtures from live acceptance.
- [x] 5.2 Exercise the full class → classmates → profile → return flow and owner sharing/revocation with synthetic integration fixtures; record default-private behavior, stale request handling, picture revocation, and unchanged old-client roster contract.
- [x] 5.3 Provide an owner-run two-account live acceptance checklist covering independent field choices, unrelated-account denial, reload persistence, picture replacement/revocation, and sign-out. Record live outcomes only when actually performed after owner deployment; otherwise explicitly mark them pending.
