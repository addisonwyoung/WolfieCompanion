# Proposal

## Why

Students can save deadlines and see overdue/today labels, but cannot choose advance reminders or revisit a persistent notification inbox. Add personal reminders that surface through a bell across the authenticated workspace without repeatedly interrupting students or requiring external notification services.

## What Changes

- Add database-backed account settings: reminders enabled by default; exams/projects default to one week and 24 hours before, assignments/quizzes to 24 hours before. Allow per-type personal defaults and per-item overrides drawn from one week, three days, 24 hours, and three hours, plus Off.
- Require a due time for three-hour reminders (confirmed user choice). For date-only work, day-based reminders fire at 9 AM America/New_York on the earlier calendar day without inventing a due time.
- Generate due reminders with a caller-scoped database reconciliation on authenticated entry/focus/online and visible periodic refresh. This release provides persistent in-app delivery, not closed-app push/email or an always-running scheduler.
- Add a workspace notification bell with unread badge and a keyboard/touch-operable dropdown of saved academic reminders. Opening the bell does not mark every notification read. Selecting a reminder opens its details and marks that reminder read; View item opens the existing editor. Individually clear or Clear all persists dismissal without deleting coursework or regenerating cleared occurrences.
- Reconcile completion, deletion, rescheduling and settings changes; skip already-past thresholds on activation, avoid repeated overdue/backlog alerts, deduplicate concurrent tabs/devices, and preserve privacy across accounts.
- Keep messaging badges independent and preserve existing agenda/calendar grouping, null due times, ownership checks and accessible modal behavior.

## Capabilities

### New Capabilities

- `academic-reminders`: Personal settings, item overrides, deterministic campus-time scheduling, persistent notification delivery/read/dismissal, authorization and reconciliation.
- `notification-center`: Bell badge, paginated dropdown, reminder details, clear actions, item navigation, accessibility and session lifecycle.

### Modified Capabilities

- `academic-items`: Persist reminder configuration and extend item mutation/completion/deletion lifecycle while retaining private course-linked data and in-app-only delivery.
- `academic-agenda-interface`: Permit reminder controls in the existing editor and route notification-origin navigation into it without losing established draft/focus behavior.

## Impact

- Extend `academic_items` additively and add private reminder preference, schedule/occurrence and notification state with owner-scoped SQL functions, RLS, indexes, transaction/locking and tombstones. Owner-reviewed migration; no hosted SQL during implementation.
- Extend `academicItems.ts`, `useAcademicItems.ts`, `AcademicItemDialog.tsx`, `AcademicPlanner.tsx` and `App.tsx`; add dedicated typed reminder API, account-keyed provider, settings and bell/detail components. Existing message tables/RPCs and `MessagingNotifications` semantics remain unchanged.
- Add deterministic time, SQL authorization/concurrency, component, account lifecycle and desktop/mobile browser tests; update `docs/academic-items.md` and teammate deployment guidance.
- No email provider, push permission/service worker, production worker, new secrets, external delivery, or paid service. Existing items receive only future reminder occurrences from migration activation; no historical notification backfill.
