# Verification

## Completed locally

- Client: `npm test -- --reporter=dot` passed all 35 tests across 7 files, including 5 new discovery adapter/UI/lifecycle tests. Existing profile, account, course review, evaluation, and schedule-import tests pass.
- `npm run lint` and `npm run build` passed (TypeScript and production Vite bundle).
- Isolated PostgreSQL 18 on `127.0.0.1:55447`: bootstrap, account migration, account policy tests, migration rerun regression, and discovery suite passed. The discovery suite applies the new migration only to this disposable local cluster, snapshots existing table/Storage policies and ACLs before application, and confirms they remain unchanged. Synthetic student fixtures roll back.
- SQL checks cover normalized course matching, multiple/different sections, deterministic ordering, exact three-column response, null major, self exclusion, empty results, invalid/null inputs, missing membership, anonymous/missing/ineligible sessions, and unconfirmed/wrong-domain/non-Google/provider-unverified/mismatched-email peers. Same-course peers still cannot directly read/write other profiles, memberships, sections, or avatars.
- Headless Chrome with actual React/Vite components and a synthetic Supabase client: name/major card and `1 classmate` count rendered at widths 375 and 1280 without horizontal overflow. The temporary browser harness was removed. No live Supabase calls were used. Vitest verifies Enter-key course selection/retry, selected-state accessibility, state transitions, and stale-response rejection.
- Strict OpenSpec validation passed for `real-classmate-discovery` and the reconciled `add-supabase-accounts-and-enrollments` change. `git diff --check` passed at implementation completion.

Sandbox restrictions initially blocked Vite child-process startup and local PostgreSQL startup; approved local executions succeeded. An initial temporary browser harness used invalid optimizer paths; correcting its imports made the smoke check pass. These were test-runner issues, not shared-database operations.

## Owner-confirmed deployment and application smoke test

The owner reports that `supabase/migrations/202610180001_classmate_discovery.sql` was manually applied to shared Supabase and real classmate discovery was successfully tested in the application. This confirms owner-reported deployment and a successful live application smoke test; the report does not establish the individual two-account or security assertions below. Codex did not execute SQL against shared Supabase or independently inspect its deployed schema, function owner, or effective ACLs. No local environment credentials were inspected or copied.

## Pending live two-account and security checks

The following checks remain unverified against shared Supabase unless separately confirmed by the owner:

1. Save the same course (including different sections) and verify reciprocal name/major-only visibility, no duplicates, and self exclusion.
2. Change a major, reselect/reload the course, and verify the next lookup reflects it.
3. Save unrelated courses and verify no unrelated peers; direct lookup of an unsaved course must fail.
4. Confirm direct peer profile/enrollment/section reads and writes and private avatar access remain denied using real sessions.
5. In a dedicated test environment without the discovery migration, confirm the error/retry state appears without fictional fallback.
6. Inspect deployed schema compatibility, the SECURITY DEFINER function owner and its required Auth/table access, effective execution grants (including default/inherited grants), and any preexisting RPC overloads. Repository review and local ACL tests do not establish the shared project's configuration.

The owner-confirmed application smoke test is complete; the specific managed Auth/API/Storage checks above remain pending. Local stand-ins and mocks do not establish those live security properties. Task 3.2 is satisfied by the deployment confirmation and explicit pending-acceptance record, as its wording allows. Archiving records implementation completion and the owner's successful application test, not comprehensive production/security acceptance.

## Specification sync and archive

The prerequisite accounts change's `prototype-dashboard` delta was synced first, followed by both discovery deltas. The main dashboard now retains the account-backed shell, profile, saved-course, and responsive requirements while using the live roster contract. The new main `classmate-discovery` spec contains all three discovery requirements and their scenarios. Both discovery deltas were compared against the resulting main specs and matched. Strict validation passed for the discovery change, accounts change, and all main specs.

Only `real-classmate-discovery` is archived. The accounts change remains active with its own pending tasks; its other capability deltas were not synced by this operation. After sync, validation caught that the accounts delta's historical roster block omitted three newly added scenarios. That superseded block was reconciled with the complete discovery roster contract; strict accounts validation then passed, and a later accounts sync will preserve the newer roster behavior. No application code, migration SQL, or shared database was changed during this archive operation.

Post-archive `openspec validate --archived --strict` passed this archive (11/11 tasks). The repository-wide archive check also reported an unrelated preexisting incomplete task in `2026-09-25-course-evaluations` (10/11); that archive was left untouched.
