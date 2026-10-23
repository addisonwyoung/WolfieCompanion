# Assignments & Exams

Sign in with your eligible Stony Brook Google account and save courses using the dashboard's manual entry or reviewed schedule import. Open **Assignments & Exams** to see your private agenda across all saved courses. Course and type filters do not change classmate selection. Pending work appears under Overdue, Today, and Upcoming; completed work appears in Completed.

Each compact agenda row shows its title, course, type badge, and readable date; optional campus time and location appear when provided. Check the completion checkbox to mark an item complete, or clear it in Completed to reopen it. These changes run directly, without a confirmation prompt. If an update fails, its previous saved state remains and an error explains how to retry.

Choose **Add item** or open a row's three-dot **Actions** menu and choose **Edit**. The modal contains title, course, type, due date, optional campus time, and completion status. Expand **Optional details** for location and notes; collapsing it preserves those fields. Existing optional details start expanded when editing. There is no section field. The menu supports Enter/Space, arrow keys, Home/End, Escape, and Tab/Shift+Tab.

The modal blocks background interaction and keeps keyboard focus inside. Clicking the backdrop never closes it. Cancel, Close, or Escape closes a clean editor; with unsaved changes it shows **Keep Editing** and **Discard Changes** inside the same dialog. Keep Editing (or Escape in that confirmation) preserves the draft. Discard closes without saving. Save submits directly and closes after server-confirmed success, restoring focus to the opener or a logical agenda control. While saving, controls and dismissal are disabled; this does not cancel an already-sent server request. Failed saves keep all fields and display an error inside the modal for retry.

To remove an individual item, use **Actions > Delete**. A styled modal identifies the item and warns that deletion cannot be undone; Cancel receives initial focus. Cancel or Escape sends no delete request, while explicit **Delete** removes only that item after server confirmation. During deletion the dialog stays open and cannot be dismissed. On failure it retains the row, explains the error, and offers Cancel or explicit Delete to retry. Background interaction and backdrop dismissal remain blocked. Focus returns to the row after cancellation, or a sensible remaining control after deletion. Browser confirm/alert prompts are not used.

Sign-out, session loss, and account replacement immediately clear private drafts, dialogs, and menus without a discard prompt, including when a request is pending. Old responses cannot populate the new workspace. Background navigation and Sign out cannot be activated while a modal is open; external authentication events still tear it down safely. Drafts are not saved to localStorage or URLs and are lost on reload.

Dates and times use **America/New_York**, regardless of your browser's time zone. Leaving time blank stores no time: an October 21 item stays due throughout October 21 and becomes overdue on October 22. Clearing an existing time restores this behavior. Timed entries become overdue after their campus wall time passes. Standard time-zone formatting handles seasonal offsets; repeated/skipped DST transition-hour comparisons have no custom disambiguation in this MVP. Indicators refresh while open and on return. These labels are in-app reminders; no email or background notification is sent.

Items are private to their eligible owner, including when classmates share the course. Course references use the saved membership's database UUID, retained as `databaseId`; the existing code-derived `id` still drives course selection. A course cannot be removed while pending **or completed** items reference it. Explicit item deletion can resolve references; there is no course-removal interface in this change. Whole-account cleanup is separate and must explicitly remove academic items before deleting courses/Auth users; do not rely on cascades.

## Manual migration review and application

The application never applies migrations. The prepared file is [202610220001_academic_items.sql](../supabase/migrations/202610220001_academic_items.sql). Review it before manually applying it in your Supabase SQL Editor. It requires the existing accounts migration (`202610160001_accounts.sql`), including `user_courses`, `private.is_eligible`, and `private.touch_updated_at`. Existing review/discovery migrations remain independent.

The migration adds one table, a unique `(id,user_id)` course constraint, ownership-consistent restrictive foreign key, agenda/course indexes, owner-immutability and updated-at triggers, and eligible-owner/course-owner RLS. No changes to existing enrollment RLS or course code/section normalization are required. `due_time` is nullable without a midnight default. Ownership defaults to `auth.uid()` and is enforced for direct requests as well as UI requests. No service-role key is needed in the client.

Apply this versioned migration once, after reviewing local test results, before expecting hosted planner persistence to work. Until applied, the planner shows a retryable storage-setup error; the dashboard remains available. After your manual application, retry loading items. Hosted provider/REST and cross-device acceptance are pending: independently verify create, reload, edit, complete, reopen, confirmed delete, second-user isolation, and rejected removal of a referenced course. No hosted test writes were performed as part of this implementation.

Rollback: revert/disable the planner client while retaining its table, data, and restrictive constraints. Do not drop student data as routine rollback.

## Isolated local checks

Never run `supabase/tests/bootstrap.sql` or SQL test fixtures against a hosted Supabase project. They create stand-ins for managed Auth/Storage and synthetic users. Use a new disposable local PostgreSQL 15+ cluster and explicit loopback connection parameters; do not use an environment-provided remote database URL.

Example PowerShell (adjust the PostgreSQL binary path; use a fresh directory and unused port):

```powershell
$pgBin = 'C:/Program Files/PostgreSQL/18/bin'
$testCluster = Join-Path $env:TEMP ('wolfie-academic-' + [guid]::NewGuid())
& "$pgBin/initdb.exe" -D $testCluster -A trust --no-locale -E UTF8
& "$pgBin/pg_ctl.exe" -D $testCluster -l "$testCluster.log" -o '-p 55442 -h 127.0.0.1' start
& "$pgBin/psql.exe" -h 127.0.0.1 -p 55442 -U $env:USERNAME -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql -f supabase/migrations/202610160001_accounts.sql -f supabase/migrations/202610170001_course_reviews.sql -f supabase/migrations/202610180001_classmate_discovery.sql -f supabase/migrations/202610220001_academic_items.sql -f supabase/tests/academic_items.sql -f supabase/tests/accounts.sql -f supabase/tests/course_reviews.sql -f supabase/tests/classmate_discovery.sql
& "$pgBin/pg_ctl.exe" -D $testCluster stop
```

Local SQL tests cover constraints, date-only null time, CRUD/completion, owner/peer/ineligible/anonymous access, owner reassignment, cross-owner course references, and restricted course deletion. They run transactions rolled back after verification. They do not verify managed Google Auth or the hosted PostgREST service.

Run `npm test`, `npm run lint`, and `npm run build` in `client/`, plus `npm test` and `npm run build` in `server/` when changing server behavior. For the local browser fixture, run `node client/test/academic-browser.mjs` from the repository root. It uses installed Chrome (override `CHROME_PATH` if needed), a temporary profile, Vite on loopback port 5178, and synthetic per-account localStorage persistence only; it never connects to Supabase. At 375 and 1280 pixels, including a short-height case, it checks compact rows, menu keys, forward/reverse focus wrapping, inert backgrounds, ignored backdrops, safe confirmation focus, both discard choices, save/delete pending and failure/retry, CRUD/reload, and externally driven account teardown. It rejects browser confirm/alert dialogs and saves screenshots to its temporary profile directory. These fixtures do not persist production drafts or establish hosted Supabase acceptance. Component tests use minimal dialog method stubs; real modality is verified only by the browser run.

## Calendar tab

Assignments & Exams opens on **Agenda**. Choose **Calendar** to see your personally saved assignments, exams, quizzes, and projects on their due dates. Both tabs use the same private saved items; switching views does not create copies, write deadlines, or load a separate store.

Calendar initially shows the current **America/New_York** month and **All statuses**, including completed work. Course and type filters carry between tabs. Calendar's All/Pending/Completed selection is independent of Agenda's Pending/Completed selection. The current account workspace remembers these choices and the browsed month/day while you navigate; reload or account replacement resets view choices. Saved items remain persisted.

Use **Previous month**, **Next month**, or **Today** to navigate. Today returns to the current campus month and date while retaining filters. The current day is marked; midnight refresh updates campus today and overdue labels without changing a month you chose to browse. Date-only deadlines keep their stored dates and have no invented time. Timed deadlines retain their campus time label even when your browser is in another zone.

Desktop shows each month's item buttons inside their date cells. On phones, select a date in the compact month grid to see its full item list below; counts identify dates with work. All entries stay reachable on crowded dates. Completed items say **Completed** rather than showing an overdue label. Empty months remain navigable; no matching month/filter results offer Clear filters. With no saved items, use Add item; with no courses, add a saved course first. Loading and failures use the existing recovery flow.

Click or keyboard-activate an item to open the same **Edit academic item** modal used by Agenda. Its fields, optional notes/location, validation, completion checkbox, dirty-draft confirmation, and retry behavior are unchanged. Add item also works from Calendar with course-filter prefill; selecting an empty date does not create an item. Save updates both views only after server confirmation. A changed due date moves the entry without duplicating it; the current month and filters stay selected. Browse to the new month/date if an edit moves the item outside the current view. Closing restores focus to the item, or a visible calendar date/heading when that item moved or no longer matches. Failed saves keep the draft and original saved entry; discarding leaves the entry unchanged. Individual deletion remains available through Agenda's actions menu.

Calendar introduces **no new migration, backend endpoint, secret, or calendar provider**. Existing academic item ownership and account teardown rules apply to every calendar entry and open draft. No private events/drafts are stored in localStorage by the application. Synthetic browser tests use their own test-only fixture persistence.

### Live calendar acceptance (pending)

After deploying the client, use your eligible account with existing saved academic items:

1. Open Calendar and confirm assignments, exams, quizzes, and projects appear on their due dates, with completed items visible under All statuses.
2. Filter by course/type/status, navigate months and Today, and verify the same saved data in Agenda. On a phone select a date to view its full list.
3. Open an item, edit its title/date, save, and verify one occurrence at the new date in Calendar and Agenda after reload. Test cancel/discard and a retryable failure without losing the last saved item.
4. Check keyboard tabs, month controls, item activation, modal focus and return focus. Test a date-only item in a non-campus browser time zone.
5. Sign out or switch accounts during a pending edit and verify the previous account's calendar/draft never appears in the replacement workspace.

Record live results only after real-account verification. Local synthetic fixtures do not verify a deployed Supabase project.

### Calendar implementation validation — October 23, 2026

- Client: 92 tests passed; lint and production build passed. The build retains a non-blocking bundle-size warning.
- Synthetic native Chrome: the full Agenda and Calendar flows passed at 1280px and 375px, using a browser in America/Los_Angeles. Checks include crowded dates, null-time placement, tab/month controls, modal focus/inertness, same-dialog discard, save failure/retry, confirmed rescheduling, reload persistence, and account teardown. The browser runner prints its temporary screenshot directory.
- The browser check exposed a repeated-Escape native close-request issue in the shared editor; Escape is now handled before a native close request so returning from discard confirmation keeps the editor visible and preserves its draft. A dedicated regression test covers it.
- With user approval, the outdated profile test now selects interests through the current picker rather than typing into its search field as though it were the former free-text editor. Profile implementation was unchanged.
- Live real-account acceptance is pending; no shared database change, new secret, or deployment was performed for this calendar feature.

To repeat the synthetic native checks on macOS with Node 22+, run from the project root:

```sh
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node client/test/academic-browser.mjs
```

The test uses only its local fixture and disposable browser profile; no Supabase credentials are required.
