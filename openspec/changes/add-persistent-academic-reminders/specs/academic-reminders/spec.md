# Spec Delta

## Purpose

Give eligible students private, persistent academic reminder settings and deduplicated in-app notifications for their own saved coursework across sessions and devices.

## ADDED Requirements

### Requirement: Persistent personal defaults and per-item overrides
Eligible students SHALL have saved academic reminder preferences with a master enabled switch, initially on, and independently configurable type defaults. Exams/projects SHALL initially use one week and 24 hours before; assignments/quizzes SHALL initially use 24 hours before. Allowed choices SHALL be one week, three days, 24 hours and three hours; empty selection SHALL mean Off. Duplicate or unsupported choices SHALL reject without partial writes. Each item SHALL support Use my defaults or an explicit override including Off. Personal default changes SHALL affect only future eligible occurrences of inheriting items; overrides SHALL remain unchanged. Turning the master switch off SHALL prevent all new deliveries while preserving already delivered notifications for inspection/clearing. Reenabling SHALL not backfill disabled time. Settings and overrides SHALL restore across reload/sign-out/devices and never change another account's settings. Cancel and failed save SHALL not claim a persisted change.

#### Scenario: Initial defaults
- **WHEN** a student opens reminder settings for the first time and creates items without overrides
- **THEN** reminders are enabled and effective selections are week/day for exams/projects and day for assignments/quizzes

#### Scenario: Override and default change
- **WHEN** a student saves three-day defaults and an individual item has an explicit day-only override
- **THEN** future eligible inheriting schedules use three days and the overriding item remains day-only after reload

#### Scenario: Master disable and reenable
- **WHEN** reminders are disabled across a threshold and later enabled again
- **THEN** no new notification is delivered for the disabled interval, future thresholds are eligible, and previously delivered uncleared notifications remain accessible

### Requirement: Campus-time scheduling without invented deadlines
For a timed item, reminders SHALL occur 168, 72, 24 or 3 elapsed hours before its America/New_York deadline according to effective choices. For a date-only item, week/three-days/day SHALL occur at 9 AM America/New_York seven/three/one calendar dates earlier, clearly labeled as day-based reminders; due_time SHALL remain unspecified. Three-hour reminders SHALL require a due time; date-only inheritance SHALL exclude that choice with an explanation, and invalid explicit date-only three-hour overrides SHALL reject. Clearing an item's time in the editor SHALL visibly remove an explicit three-hour selection in the unsaved draft. The existing full-date overdue semantics SHALL remain unchanged. Timing SHALL be authoritative independent of browser timezone; an ambiguous autumn deadline SHALL resolve to the later standard-time instant and a nonexistent spring deadline SHALL move forward by the gap for scheduling only.

#### Scenario: Date-only reminder
- **WHEN** an item is due October 21 without a time and uses the day-before reminder
- **THEN** its reminder is scheduled October 20 at 9 AM campus time, its stored time remains null and it becomes overdue only October 22

#### Scenario: Three-hour validation and time clearing
- **WHEN** a student configures a date-only item or clears a timed item's due time
- **THEN** three-hour reminders are unavailable for that item, explicit three-hour selection is removed visibly from the draft, and no change persists before Save

#### Scenario: Timezone and DST
- **WHEN** students in different browser timezones view a timed or date-only occurrence across a daylight-saving transition
- **THEN** they refer to the same scheduled instant, preserve campus dates/null time, and follow the stated autumn/spring conversion rules

### Requirement: Authoritative persistent delivery and bounded catch-up
Eligible authenticated workspace entry, foreground/focus, reconnect and a visible periodic refresh no slower than 30 seconds SHALL reconcile due occurrences using server time without requiring the planner to have been opened. Delivery SHALL persist once materialized; repeated polls, tabs/devices and retries SHALL not duplicate an occurrence. Thresholds at or before item creation, migration activation, settings activation or rescheduling SHALL be skipped. If several eligible thresholds crossed while absent and the item is not overdue, only the latest crossed threshold per item SHALL newly deliver and earlier crossed thresholds SHALL be skipped. Already delivered uncleared reminders SHALL remain. Undelivered reminders for currently overdue/completed/deleted items SHALL not deliver; there SHALL be no repeated overdue reminders. This release SHALL NOT promise delivery while the app is closed or provide email, browser/OS push or automatic permission prompts. Refresh failure SHALL remain distinguishable from an empty inbox and SHALL permit retry.

#### Scenario: App-wide delivery
- **WHEN** a student stays in Messages or Dashboard while an eligible threshold crosses
- **THEN** a successful foreground refresh creates one persistent academic notification and updates its bell count without opening Assignments & Exams

#### Scenario: Concurrent delivery and lost response
- **WHEN** two devices reconcile the same occurrence or retry after a committed response is lost
- **THEN** storage contains one occurrence and its notification/count is not duplicated

#### Scenario: Return after several thresholds
- **WHEN** a student returns after the week and day thresholds for a still-upcoming exam
- **THEN** only the day reminder newly delivers and the skipped week occurrence cannot appear on later refresh

#### Scenario: Late item or overdue return
- **WHEN** an item is created less than 24 hours before its deadline or the student returns after it is overdue
- **THEN** already-past thresholds are not delivered as a backlog and existing agenda overdue indicators still work

### Requirement: Coursework and settings lifecycle reconciliation
Completing or deleting an item SHALL cancel future reminders and remove that item's active delivered notifications from the bell/count. Rescheduling date/time SHALL invalidate old active notifications and permit only strictly future thresholds for the new schedule. Title/course/type changes SHALL reconcile display/future settings without resending previously delivered offsets for the same deadline. Removing an offset SHALL cancel future delivery for it while preserving previously delivered notifications unless the item itself is invalidated. Reopening an item or reselecting an offset for the same deadline SHALL not revive a previously delivered, skipped or cleared occurrence; only still-future never-delivered/non-skipped occurrences SHALL qualify, including explicitly reactivated previously cancelled future schedules. These outcomes SHALL also hold for authorized writes outside the UI, with atomic rollback on failure and no partial scheduling. Concurrent delivery and mutation SHALL have a consistent committed order: completion/removal committed before delivery cannot yield a stale notification; delivery first SHALL be invalidated by the subsequent item mutation.

#### Scenario: Completion and reopening
- **WHEN** an item with a delivered reminder is completed and later reopened with the same deadline
- **THEN** its delivered alert disappears, does not regenerate, and only still-future never-delivered eligible occurrences can deliver

#### Scenario: Reschedule or retitle
- **WHEN** the deadline moves or only the title changes
- **THEN** rescheduling removes old active reminder context and schedules future thresholds, while retitling updates context without duplicating a delivered offset

#### Scenario: Delivery races completion
- **WHEN** completion and a due delivery execute concurrently
- **THEN** transactions serialize or explicitly fail for retry, never expose partial changes, and the final completed item has no active or newly pending reminder

### Requirement: Owner-only reminder access and retained dismissal
Only an eligible owner SHALL read/change their preferences, schedules, notifications, counts and read/dismissal state. Anonymous, ineligible, peer and forged-owner/cursor requests SHALL fail without exposing content. Clients SHALL NOT forge delivery times, ownership, schedule revision or snapshots. Read and dismissal SHALL persist monotonically; clearing a reminder SHALL retain sufficient deduplication state to prevent its regeneration and SHALL not change the academic item. Individually repeated read/clear operations SHALL be safe. Clear all SHALL dismiss active delivered reminders across pages only through a captured authoritative server bound; retry SHALL reuse that bound and later deliveries SHALL remain. An item deletion SHALL clean up only that item's reminder data, preserving unrelated coursework/notifications.

#### Scenario: Clear persists across devices
- **WHEN** a student clears a delivered reminder and reloads or opens another device
- **THEN** it remains absent from list/count and subsequent reconciliation cannot regenerate it

#### Scenario: Batch clear and new arrival
- **WHEN** the student clears all with more notifications than one page and another notification delivers after the captured bound
- **THEN** all prior delivered reminders are dismissed, the later arrival remains, and retry has the same scope

#### Scenario: Unauthorized access
- **WHEN** a second account requests another owner's settings, notification ID, page cursor, read or clear mutation directly
- **THEN** access is denied, no private counts/content are exposed and no other owner's state changes
