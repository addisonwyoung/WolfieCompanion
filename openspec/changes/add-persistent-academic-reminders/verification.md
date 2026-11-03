# Verification — persistent academic reminders

Implemented on `codex/persistent-academic-reminders`, based on local main. No commits, pushes, merges, hosted SQL, email/push services or external account messages were performed.

## Implementation boundary

The existing academic item INSERT/UPDATE is already one atomic SQL statement. It now includes `reminder_offsets` and runs scheduling triggers in that transaction, meeting atomic save requirements without adding a duplicate save RPC. Existing direct core CRUD/RLS is preserved; generated scheduling columns have no client write grants. Preferences use separate owner-authorized RPCs. This implementation clarification is reflected in design/docs.

No worker/cron is installed. The account-keyed provider refreshes server-authoritative delivery on entry/focus/online and every 30 visible seconds. Notifications, preferences, overrides, read state and clear tombstones persist in PostgreSQL. Closed-app delivery is explicitly not promised.

## Passed local checks

- Reminder component/API tests: 17 passed, covering strict responses/offsets, default/cancel/failed-save/retry, date-only three-hour removal/dirty state, read failure/retry, persistence, pagination cursors/full counts, bounded clear retry/new arrival, hidden/focus refresh, account teardown during refresh/read/settings/clear, missing schema/core fallback and current-item navigation/unavailability.
- Focused academic/calendar/messaging client regression command: `npm --prefix client test -- test/academicReminders.test.tsx test/academicItems.test.ts test/academicPlanner.test.tsx test/academicCalendar.test.tsx test/messaging.test.tsx test/messagingUnread.test.tsx test/groupMessaging.test.tsx --reporter=dot --maxWorkers=1`: 89 tests passed across 6 matched files. (`messagingUnread.test.tsx` is not an existing filename; the matched messaging suite still runs. Test coverage is reported by actual matched files, not requested names.)
- Client lint and production build passed. Existing Vite >500 kB bundle advisory remains; no dependency was added.
- Server tests: 25/25 passed with permission to bind temporary loopback HTTP ports. Server build/Prisma generation passed. No server production behavior changed.
- SQL suite `supabase/tests/academic_reminders.sql` passed on disposable PostgreSQL 18 at localhost:55461, both with minimal account/academic prerequisites and after the complete checked-in migration chain. Covers default/override validation, null-time/9 AM, leap/year boundaries, DST fold/gap, generated privileges, duplicate/catch-up suppression, overdue/late activation, completion/reopening/rescheduling, persistent read/clear, >20 rows/full count, bounded clear with later arrival, peer/anon/ineligible denial and source deletion/sibling retention.
- Complete migration chain applied successfully in disposable `reminders_full`, including broad default anon/authenticated table/function grants before application; academic SQL, group SQL and group-removal SQL passed there.
- Historical account/direct/unread SQL suites passed on their compatible pre-semester prerequisite schema with this reminder migration installed. Academic CRUD SQL passed there too. Tests against newer professor/section APIs are separately noted below.
- `python3 supabase/tests/academic_reminders_concurrency.py` passed real two-connection duplicate refresh, direct item completion/refresh, reschedule/refresh and preference disable/refresh commit-order races. No partial delivery or stale active reminder remained.
- Chrome `client/test/reminder-browser.mjs` passed at 1280px and 375px: settings, native forward/reverse focus wrapping, long title/25-row dropdown, pagination, read/reload persistence, details/View item to existing editor, deadline-edit invalidation, bounded clear retry preserving later arrival, reload and account replacement during pending clear. Test-only synthetic data, no Supabase connection. Final screenshot directory `/var/folders/qc/wjnj2dzn5gv46y96_ktcsrd00000gq/T/wolfie-reminders-MH1Jy2/`; representative mobile settings/dropdown screenshots were visually inspected and showed no page overflow.
- Strict OpenSpec validation and whitespace diff checks passed.

## Existing baseline failures, not repaired in this change

The initial complete client run encountered 26 failed tests and a friendship worker heap exhaustion. A clean `git archive main` snapshot under `/tmp/wolfie-reminder-baseline`, using the same installed dependencies, reproduced the same 26 failed test names plus friendship heap exhaustion. Failures concern stale course/professor/section/profile fixtures and older schedule-import props. No reminder implementation is present in that baseline snapshot.

To collect the other results without repeatedly exhausting the worker, `npm --prefix client test -- --reporter=dot --maxWorkers=1 --exclude test/friendship.test.tsx` completed with 26 failures, 145 passes and 4 existing schedule-import uncaught errors at that run (15 new reminder tests then existed). Automated comparison of failure names against the baseline found **no new failure names and no baseline-only failure names**. Two additional reminder tests were added afterward and passed; targeted final runs/lint/build are recorded above. The full suite is not claimed green. Existing failures were not changed without request.

After all latest migrations, historical `accounts.sql` expects the old save_enrollments payload without section/professor fields; historical direct/unread fixtures expect the old shared-course contact boundary. They fail under the newer professor/verified-section rules. Those same suites pass with their matching pre-semester prerequisites plus the reminder migration, while the full-chain reminder/academic/group tests pass. This is not a claim that the old fixtures validate latest enrollment behavior. No historical test or unrelated behavior was rewritten.

## Owner deployment and acceptance remaining

Review/apply only `supabase/migrations/202610280001_academic_reminders.sql` to the intended shared project after prerequisites. Never run test/bootstrap files there. Deploy/restart the client; no new keys or running job. A missing reminder migration remains isolated from core coursework through recognized missing-column fallback; configuring a custom reminder requires the migration and retains the failed draft rather than silently dropping choices.

With two eligible accounts and two devices, manually check settings/override persistence, one future timed and one date-only arrival, same-account cross-device read/clear, bounded Clear all/new arrival, completion/reopen/reschedule, View item, a peer's denied raw counts/IDs/cursors and unchanged message badges/calendar. Managed Auth/PostgREST, actual hosted polling latency and cross-device acceptance remain pending. Previously downloaded text cannot be recalled from devices. Rollback removes/disables the client reminder UI first while preserving coursework, reminder tables, tombstones and compatible triggers; any RPC revocation is separate owner-reviewed SQL.
