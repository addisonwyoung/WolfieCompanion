# Verification

## Completed local checks

- Client: 51 tests in 9 files pass, including existing account, import, profile, classmate, and review regressions. New coverage includes adapter validation/errors, date-only and timed campus boundaries, live midnight refresh, CRUD/completion for all types, delete confirmation/cancellation/failure, retained drafts, duplicate-write guards, stale loads/mutations after account replacement, and planner failure isolation.
- Client ESLint passes without warnings. TypeScript/Vite production build passes.
- Server: all 20 tests pass; Prisma generation and TypeScript build pass. No server feature or hosted connection was added.
- Fresh disposable PostgreSQL 18 cluster on explicit loopback `127.0.0.1:55442`: test bootstrap plus existing migrations and the new academic-items migration applied successfully only in that isolated cluster. `academic_items.sql`, `accounts.sql`, `course_reviews.sql`, and `classmate_discovery.sql` all pass with `ON_ERROR_STOP=1`. Synthetic test transactions roll back. New coverage exercises direct owner/peer/ineligible/anonymous permissions, cross-owner courses, immutable ownership, restrictive course references, validation, create/edit/complete/reopen/delete, date-only null time, and deletion preserving sibling items.
- Existing `course_reviews.sql` contained an unescaped apostrophe in an assertion message. Escaping that literal corrected SQL parsing; behavior/assertions are unchanged.
- Headless installed Chrome, local fixture only: keyboard create/save, persistent reload through fixture localStorage, visible focus, and no horizontal overflow in editor and agenda at 375 and 1280 pixels. The fixture uses no Supabase client or credentials. Component tests additionally cover editing/completion/deletion and keyboard-oriented focus restoration. This is not hosted persistence acceptance.
- Strict OpenSpec validation passes. All implementation tasks are checked; hosted acceptance remains explicitly pending as required by task 5.2.

## Manual release steps still required

1. Review `supabase/migrations/202610220001_academic_items.sql` and the prerequisites/rollback in `docs/academic-items.md`.
2. Manually apply the reviewed SQL in the intended Supabase project after the account schema prerequisites. No hosted migration, hosted data write, or hosted smoke test was performed by this implementation.
3. Verify the managed Auth/PostgREST integration with two eligible students: create/reload/edit/complete/reopen/confirmed delete, another student's denial, and rejection of deleting a referenced course. Check another browser/device and campus date/time behavior. Hosted test writes require the user's separate explicit request if performed by the agent.
4. Keep personal tables and restrictive constraints on application rollback. Do not drop academic items to revert the client.

## Known limits

No email notifications, enrollment terms, section association, recurrence, course-removal UI, or custom DST transition-hour disambiguation. Campus time uses standard America/New_York formatting. Native browser confirmation supplies deletion confirmation. No live Google OAuth or hosted Supabase acceptance is claimed by the local tests.
