# Tasks

## 1. Calendar dates and shared view state

- [x] 1.1 Add pure calendar month/date grouping helpers using stored date keys, bounded year/month arithmetic, and campus today. Verify tests cover weekday alignment, leap February, December/January, years 0001–0099, bounds through 9999, stable ordering, and no browser-zone/DST deadline shifts.
- [x] 1.2 Add Agenda/Calendar tab state, accessible tab relationships and keyboard navigation, shared course/type filters, independent completion selectors, and retained calendar month/day to `AcademicPlanner.tsx`. Verify component tests cover Agenda default, Calendar All default, filter preservation, menu dismissal, tab keyboard behavior, and no extra API loads or writes on presentation changes.
- [x] 1.3 Document tab defaults, status/filter behavior, campus dates, and session-only view memory in `docs/academic-items.md`; verify descriptions match the implemented controls and date helper tests.

## 2. Responsive calendar presentation

- [x] 2.1 Build `AcademicCalendar.tsx` with named month/year, Previous/Next/Today controls, weekday-aligned cells, current-day indication, full dated event lists, course/type/time/completion labels, and stable item identities. Verify component tests include all four types, completed versus pending work, dense same-date entries, empty months, bounded navigation, and correctly placed deadlines.
- [x] 2.2 Add responsive styling and phone selected-date/full-list interaction without unreachable overflow or hidden duplicate controls. Verify date selection, full event names, keyboard reachability, and current-day refresh; extend the synthetic browser fixture to cover long titles and crowded dates at 375px and desktop widths.
- [x] 2.3 Integrate common no-courses/loading/error states and navigable calendar empty/no-match states with recovery controls. Verify tests distinguish failures from empty data, allow month navigation with zero entries, clear filters appropriately, and never inject sample items.
- [x] 2.4 Document month controls, phone date selection, empty states, and how completed entries are identified in `docs/academic-items.md`; verify the documented navigation flow in the synthetic fixture.

## 3. Existing editor and synchronized mutations

- [x] 3.1 Route calendar event activation to the existing populated `AcademicItemDialog` using original item IDs and existing mutations; keep Add item accessible with course prefill in both tabs. Verify click/Enter/Space editing, all populated fields, unchanged date-only null time, and duplicate-save prevention with component tests.
- [x] 3.2 Extend post-modal focus restoration to visible Calendar event/date controls and heading fallbacks while preserving Agenda behavior. Verify cancellation returns to the opener, moving month/course/type/completion outside the active view uses a visible calendar fallback, and no hidden Agenda control receives focus.
- [x] 3.3 Verify shared saved state across tabs using integration tests for add, edit, due-date moves across months, completion/reopening in the editor, and Agenda deletion. Confirm edits produce one new occurrence only after server confirmation and retain the viewed month/filters; failed saves retain draft and original entry, and dirty discard leaves saved data unchanged.
- [x] 3.4 Extend account teardown tests for Calendar entries and editor/discard/pending save; verify external sign-out/account replacement clears date context and private UI, ignores late results, and releases native modal state. Document calendar editing, focus/rescheduling behavior, and unchanged privacy/persistence in `docs/academic-items.md`.

## 4. Integration acceptance

- [x] 4.1 Run the complete client tests, lint, and production build; record results and verify existing agenda CRUD, confirmations, deadline grouping, and account lifecycle regressions remain passing without backend/schema changes.
- [x] 4.2 Run synthetic native Chrome checks at desktop and 375px, including a browser outside the campus zone, tab keys, month navigation, dense dates, editor focus containment, saved rescheduling, reload persistence, failure/retry, and teardown. Record screenshots and outcomes separately from real-account testing.
- [x] 4.3 Add an owner-run live acceptance checklist for loading personally saved items across both tabs, editing/reloading a deadline, and verifying account isolation. Mark live outcomes pending unless actually executed; verify deployment guidance states no additional migration or secrets are required.
