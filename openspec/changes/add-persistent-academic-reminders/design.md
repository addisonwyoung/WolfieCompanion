# Design

## Context

See proposal.md for motivation. Inspected current local `main`: `academicItems.ts` performs owner-scoped direct table CRUD; `useAcademicItems.ts` owns planner mutations; `AcademicPlanner.tsx` mounts only after its first navigation and retains Agenda/Calendar state. Its 15-second clock changes labels, not persisted reminder state. `AcademicItemDialog.tsx` has no reminder fields. `App.tsx` has account-keyed authenticated content and message unread navigation, but no academic bell. `MessagingNotifications.tsx` supplies messaging-specific counts and refresh behavior; do not reinterpret those as coursework notifications. `academic_items` already has ownership/course foreign keys, timestamps, completion, nullable campus wall time and RLS. Tests include component/adapter/account/calendar coverage and `academic-browser.mjs`.

Existing `academic-agenda-interface` explicitly excludes reminder controls/frequency settings and freezes mutation payload/schema. This change deliberately updates those requirements through complete deltas, while preserving modality, course UUIDs, owner authorization, calendar state and date-only deadlines. `academic-items` forbids email, which remains unchanged. Early design-doc references to Resend are plans, not an implemented integration.

## Goals / Non-Goals

**Goals:** Persist user defaults, overrides, notification occurrences/read/dismissal; reconcile from authoritative server time with safe concurrent sessions; expose the bell throughout eligible signed-in views; navigate into the existing academic editor without duplicating editing logic.

**Non-Goals:** Email/digests, browser/OS push, service workers, continuously running cron/worker, closed-app exact-time delivery, snooze, recurring assignments, quiet-hour customization, messaging/friend notifications in the bell, group reminders, arbitrary offsets, changing assignment overdue rules, or new service credentials. Planning does not run migrations or change application code. Implementation should use a new feature branch from up-to-date main; this proposal is currently authored on local main and does not create/switch branches.

## Decisions

### 1. Preferences, overrides and deterministic effective settings

Use a separate owner-private preferences row, rather than adding unrelated academic controls to the profile-sharing schema. Default enabled=true; per-type defaults are exam/project `[week,day]`, assignment/quiz `[day]`. Allowed keys: `week` (168h), `three_days` (72h), `day` (24h), `three_hours` (3h). An empty list means Off; duplicate/unknown offsets reject. Settings UI opened from the bell supports the master switch and each type's defaults. Save is explicit and transactional; Cancel does not write.

Extend `academic_items` with nullable `reminder_offsets`: null means inherit personal type defaults; an array overrides, including [] for Off. Editor offers Use my defaults versus Customize, shows effective selections, and includes them in dirty/save/cancel handling. Changing a type recomputes only inherited defaults. Personal default changes affect future schedules of existing inheriting items; explicit overrides remain intact. Global Off suppresses all future delivery including overrides; existing delivered notifications remain available until cleared or invalidated by an item mutation. Reenabling starts from commit time and never backfills missed thresholds.

For date-only items, exclude three_hours from inherited effective settings with explanatory copy. Do not silently modify saved personal defaults. Explicit three_hours with null time is rejected; clearing a time in the editor removes that item override selection with visible explanation before saving, keeping the draft dirty. No changes are persisted until Save. Existing items migrate with inherit mode and scheduling activation at migration commit, so past thresholds cannot appear as newly scheduled reminders.

Alternative: only per-item settings. Rejected because the user asked for personal settings and consistent defaults without configuring every new item.

### 2. Campus-time conversion is independent of overdue grouping

Timed deadline is `(due_date + due_time) AT TIME ZONE 'America/New_York'`; subtract elapsed interval hours for each selected offset. Database conversion is canonical: ambiguous autumn times resolve to the standard-time (later) occurrence; nonexistent spring times advance by the gap under the standard-time interpretation. Document these rare cases and cover them with SQL boundary tests. The browser formats returned instants instead of independently scheduling by its local timezone.

Date-only week/three_days/day deliver at 09:00 campus time seven/three/one calendar dates earlier. This is reminder-only timing; due_time stays null and the item remains due all day. Three-hour reminders require a specified time, as confirmed by the user. No midnight deadline is invented. UI labels distinguish 'day before at 9 AM' from exact '24 hours before' for date-only entries.

Alternative: treat a null time as midnight/end of day. Rejected because existing coursework semantics explicitly preserve unspecified time.

### 3. Persistent occurrences with terminal state, not disposable timer alerts

Add owner-private `academic_reminder_preferences` and `academic_reminder_occurrences`. Each occurrence stores UUID, owner, item FK (cascade only its reminder records on item deletion), schedule revision, offset key, due_at, activation time, state (`scheduled`, `delivered`, `skipped`, `cancelled`), delivered_at, a server-generated monotonic delivery_order, read_at, dismissed_at and a minimal delivery snapshot (title, course code, type, deadline date/time). Retain existing restrictive course FK. One occurrence per `(item_id,schedule_revision,offset_key)`; index pending owner/due and delivered owner/activity. No notes/location/profile data in notification list snapshots. Delivered/skipped/dismissed rows remain tombstones while the source item exists, preventing replay by reload or retries. A cancelled never-delivered future occurrence may be reactivated explicitly by renewed eligibility; its activation moves to that commit, never into the past. Read and dismissed timestamps advance monotonically using database time.

A deadline date/time change increments a server-managed schedule revision, cancels old scheduled rows and invalidates active old notifications; new occurrences must have due_at strictly after the change commit. Title/course/type changes update active display context and reconcile future offsets without resetting already delivered offsets. Offsets added/reenabled get activation at that operation and only future thresholds qualify. Disabling an offset cancels its scheduled row; previously delivered notifications stay unless the item is completed/deleted/rescheduled. Reenabling the same offset may reactivate a cancelled never-delivered occurrence only when its threshold is still strictly future; a delivered/skipped/dismissed occurrence never replays. Reopening a completed item schedules or reactivates only still-future, never-delivered/non-skipped offsets in the same deadline revision. Reopening cannot resurrect a previously delivered/cleared occurrence. These decisions favor duplicate prevention over automatic resend; snooze is outside scope.

Use one atomic owner-authorized item-save boundary (the existing single INSERT/UPDATE already atomically saves all fields and runs scheduling triggers; implementation inspection found a redundant RPC wrapper unnecessary) for core fields plus override changes. Trigger helpers on direct item INSERT/UPDATE/DELETE and preferences changes enforce scheduling invalidation even when bypassing UI; direct eligible-owner core item writes retain their RLS contracts, but clients cannot write generated revision, occurrence delivery state or another owner's preferences. Migration must narrow generated-column grants without losing valid existing CRUD grants. Replace migrated API payloads deliberately and retain complete/reopen/delete APIs unless their transaction contract needs a wrapper. All operations derive identity; no client owner/time parameters establish authority.

Alternative: delete notifications on Clear. Rejected because subsequent reconciliation could recreate them unless deduplication history survives.

### 4. Caller-scoped materialization, catch-up and concurrency

A proposed `academic_reminders_refresh()` authenticated RPC transaction derives auth.uid(), validates current eligibility, takes a per-owner transaction advisory lock and reconciles schedules/delivery using database time. Item/preference mutation triggers acquire the same owner lock after their source row change; refresh/clear take the owner lock but must never acquire source item/preference row locks or write those source rows. Reconcile occurrences from the committed/current-transaction source values. Do not introduce a reverse owner-lock/source-row-lock dependency in RPC wrappers. Bulk direct transactions can still encounter ordinary PostgreSQL deadlocks; abort atomically with explicit retry rather than claim success or partially deliver. This serializes delivery with completion/rescheduling/global-off races; dedup uniqueness remains the final boundary. Read/clear operations are owner-authorized, idempotent and serialized consistently; exact API signatures belong in implementation docs.

Select due scheduled occurrences where activation < due_at <= now. Skip thresholds already past at migration/create/reconfiguration. While an item is still pending/not overdue, if several eligible reminders crossed since the last refresh, deliver only the latest due occurrence per item and mark earlier crossed occurrences skipped. Previously delivered notifications stay. If the item is now overdue, skip undelivered past occurrences rather than issuing overdue/backlog notifications; already-delivered reminders persist until explicitly cleared or item invalidation. No repeat overdue alerts. For date-only work, overdue starts on the following campus date; timed work is overdue after its instant. The bell shows factual scheduled/due dates, not stale phrases like 'tomorrow' after a late return.

An account-keyed reminder provider runs refresh plus bounded list/count reads on eligible workspace entry, focus, online and every 30 seconds while visible, regardless of planner mounting. Pause on hidden/unmounted views and tear down on account change. Delayed delivery is acceptable to the next successful refresh; closed-app periods create no delivery promises. On reopening, eligible catch-up is materialized once and persisted. Optional owner-protected Realtime invalidation on occurrence/preferences tables helps cross-tab/device read/clear changes; polling remains sufficient. Safe events must not publish helper/private scheduling state to unrelated users.

Alternative: Supabase Cron/Edge worker. Deferred because this release delivers in-app only and requires neither paid services nor a deployed always-running process. Future worker can call private materialization logic under a separately reviewed authorization design.

### 5. Bell, details, clearing and item editing

Add a dedicated AcademicReminderProvider/typed API and NotificationBell near authenticated navigation, separate from messaging counts. Bell has visible/accessible notification identity, count capped visually at 99+, aria-expanded/controls and descriptive unread label. Do not flash/repeatedly animate. Dropdown uses normal semantic list/buttons (not ARIA menu with interactive descendants), newest delivery first with stable `(delivered_at,id)` keyset pagination (20 rows), full server unread total and explicit loading/error/empty/load-more states. Opening or scrolling the list never marks all read.

Each row exposes title/course/deadline/offset context, unread state, open-details and a separate labeled Clear. Select closes dropdown and opens a single native reminder-details dialog. Attempt mark-read for that row; display errors/retry without pretending its unread count cleared. Details show stored reminder context and current item availability, View item, Clear and Close. No nested modal. Escape/outside-click closes idle dropdown and restores focus logically; dialogs keep existing modal/focus conventions. Close details to the bell; successful navigation resolves focus in the editor and suppresses stale bell restoration.

View item closes reminder details, supplies an account-keyed item ID/navigation nonce to App, mounts/reactivates AcademicPlanner and fetches the current owner-authorized item even outside filters/completion/month. It opens the existing editor once without destructive resetting of retained filters/month. Invalid/obsolete targets produce an unavailable state and never fabricate coursework or bypass the discard flow. The bell is inert while another native modal is active. On returning from editing, focus goes to a visible planner control; don't restore focus to a closed dropdown row.

Clear sets dismissed_at, removes from active list/count after server confirmation and never deletes source coursework. Clear all captures an owner-locked server delivery_order watermark at activation and dismisses only undismissed delivered occurrences at/below it, including read/unread rows across unloaded pages; arrivals after the watermark remain. Retries reuse that bound. Provide concise scope copy and no extra confirmation for reversible coursework-independent dismissal; no Undo/history UI in this version. If an arrival is reconciled between opening and clearing, only those inside the captured server bound clear. Preserve pending/error states; batch failure cannot be presented as empty success.

### 6. Security, state isolation and compatibility

RLS restricts all reminder settings/occurrences to eligible owner; private helpers have no client execute grants, SECURITY DEFINER uses empty search_path and explicit authorization, generated fields have no client write privileges. Prevent forging snapshots, owner assignment, schedules, delivery/read/dismiss timestamps or reading other-owner counts via crafted IDs/cursors. Queries and writes validate limits/types. No admin/shared notification path.

Provider and private dialogs are keyed to authenticated account, not only a page/view. Abort obsolete reads and invalidate generations for every async continuation; do not persist private notification caches or drafts in localStorage/URLs. Ignore late item/settings/read/clear/navigation results after sign-out/session replacement. Missing reminder migration fails with isolated retryable setup guidance while academic CRUD/calendar/messages remain available; successful empty responses are not substituted for failures. Merge safe cross-device refreshes and preserve page cursors on retry. Existing message unread keys and read positions never change.

## Risks / Trade-offs

- No closed-app exact-time delivery → explicit in-app wording, bounded catch-up, future worker out of scope.
- DST/date-only surprises → canonical SQL instants, 9 AM calendar-day labels, specific gap/fold and alternate-browser-zone tests.
- Direct CRUD bypasses scheduling → database-triggered reconciliation and narrowed generated privileges, tested under broad role defaults.
- Multi-device completion versus delivery → owner lock plus uniqueness and deterministic ordering; delivery committed first can exist briefly until completion invalidates it, completion committed first cannot yield a later stale delivery.
- Unbounded occurrence history → at most four offsets per item revision, indexes/paging; keep tombstones for correctness, no silent retention purge this release.
- Clear all racing arrivals → server-issued monotonic watermark, retry same bound, tests across unloaded pages.
- Schema/spec drift → update complete affected existing requirement blocks and extend actual academic/editor/browser tests, not a parallel planner.

## Migration Plan

1. Implement later on a new branch from current main after checking working-tree state; preserve other in-progress feature changes.
2. Create a new transactional additive migration after current academic/account prerequisites. Add validated preferences/overrides, server-managed schedule fields, occurrences, scoped RPCs/triggers, RLS/grants/indexes and optional safe publication entries. Seed inherit-mode existing items at migration activation; no overdue/backfill delivery or coursework deletion.
3. Verify on disposable local PostgreSQL with existing account/academic/semester/messaging migrations plus synthetic users; run access/concurrency tests and regressions before owner review. Never run bootstrap/tests on shared Supabase.
4. Owner reviews/applies the new migration once, then deploys the client. No new keys, hosted worker or Express endpoint. Document signed-in multi-account/device acceptance separately from fixture results.
5. Roll back UI/provider first; retain preferences/occurrences/coursework. If needed, owner disables new delivery entry points under reviewed SQL. Preserve trigger prerequisites for old academic CRUD and don't drop student data. Existing messages remain independent.
