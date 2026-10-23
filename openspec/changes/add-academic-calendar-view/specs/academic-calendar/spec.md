# Spec Delta

## Purpose

Let students view their own saved academic deadlines by calendar date and edit them directly while preserving the private agenda's persistence and campus-time rules.

## ADDED Requirements

### Requirement: Calendar tab and view state
Assignments & Exams SHALL offer accessible Agenda and Calendar tabs, with Agenda selected initially. Switching tabs SHALL preserve shared course/type filters, the Agenda Pending/Completed selection, and the calendar's viewed month and separate All/Pending/Completed selection during the current account workspace. Calendar SHALL initially select All statuses and the current America/New_York month, covering all saved courses and types unless the student has already set course/type filters. Tab changes SHALL close any agenda actions menu without changing saved items or the dashboard's selected classmate course.

#### Scenario: Switch views without losing context
- **WHEN** a student filters to a course/type, opens Calendar, browses another month, then switches to Agenda and back
- **THEN** both views retain the shared filters, Calendar retains its month and status choice, and Agenda retains its separate completion choice

### Requirement: Personal monthly deadline placement
The calendar SHALL show only the signed-in student's saved academic items, including assignments, exams, quizzes, and projects, placed on their exact stored due dates. All statuses SHALL show both pending and completed entries; Pending and Completed SHALL narrow them appropriately. Completed entries SHALL be textually distinguishable and SHALL NOT be labeled overdue. Each item SHALL be reachable even when many items share a date, with an accessible identity containing title, course, type, due date, optional campus time, and completion state. Entries within a date SHALL use existing deadline ordering with a stable identifier tie-breaker. Notes SHALL remain in the editor.

#### Scenario: Multiple types and completion states
- **WHEN** the student opens a month containing a pending assignment, completed exam, quiz, and project
- **THEN** All shows each on its saved date, the completion filters narrow results correctly, and no other student's items or sample entries appear

#### Scenario: Crowded date
- **WHEN** many saved items share one due date or have long titles
- **THEN** every item remains reachable and individually editable without relying solely on hover, color, or clipped text

### Requirement: Month navigation and campus dates
The calendar SHALL label its month/year, expose Previous month, Next month, and Today controls, and visually and programmatically identify the current campus date. Navigation SHALL cross month/year boundaries correctly, handle leap days, and avoid invalid months outside the supported stored-date range. Today SHALL return to the current campus month/date without altering filters or saved deadlines. Date placement SHALL NOT shift with browser time zone or daylight saving transitions. Optional times SHALL remain labeled America/New_York; date-only items SHALL have no invented time and retain their full-campus-day semantics. Campus today and deadline indicators SHALL refresh on the existing periodic and return-to-view updates without resetting a manually browsed month.

#### Scenario: Year boundary and leap month
- **WHEN** a student browses from December into January or a February in a leap year
- **THEN** the labeled month, weekday alignment, valid dates, and placed deadlines remain correct

#### Scenario: Browser outside campus time zone
- **WHEN** a student views a date-only item or timed item from another browser time zone across a DST or campus-midnight boundary
- **THEN** the entry remains on its saved due date, campus today updates correctly, and no midnight time is added to a date-only item

### Requirement: Edit calendar items through the existing modal
Pointer activation or Enter/Space on a calendar item SHALL open the existing Edit modal populated with that saved item's identity and values. The modal SHALL retain current validation, optional-details disclosure, completion controls, same-dialog dirty-draft confirmation, pending-save protection, and retry behavior. Only a confirmed save SHALL update the common saved item state and both views. Changing a due date SHALL remove the old occurrence and place the item on its new date without duplicates. The viewed month and filters SHALL remain unchanged even when the item leaves them. Cancel/discard SHALL leave the saved entry unchanged; failed saves SHALL retain the draft and original saved entry. Existing Add item SHALL remain usable from either tab with existing course prefill; clicking an empty date SHALL NOT create an item in this change.

#### Scenario: Reschedule an item
- **WHEN** a student opens a calendar item, changes its due date to another month, and saves successfully
- **THEN** both views reflect the saved date, the old occurrence disappears, and the current calendar month remains selected

#### Scenario: Failed save and discarded draft
- **WHEN** a calendar edit fails or a student discards unsaved changes
- **THEN** failure keeps the populated draft available for retry, and discard leaves the last saved calendar item unchanged

### Requirement: Accessible responsive calendar
Tabs SHALL expose tablist/tab/tabpanel relationships and support Left/Right and Home/End navigation with one selected tab. The calendar SHALL expose weekday/date relationships, readable day labels, visible keyboard focus, and keyboard-operable month controls and item buttons. At 375-pixel and desktop widths it SHALL remain usable without page-level horizontal overflow. On narrow screens a compact month/date selector with the selected day's full item list SHALL retain access to every date and item. Focus after editing SHALL return to the originating visible item or a logical visible calendar fallback when the item moved or was filtered out. Hidden tab controls SHALL NOT receive focus.

#### Scenario: Keyboard and phone editing
- **WHEN** a student uses only the keyboard or a 375-pixel screen to navigate months, select a day, and activate an item
- **THEN** the chosen date and entries are identifiable, every item is reachable, the editor is operable, and closing restores focus within the active view

### Requirement: Shared load state and account isolation
Agenda and Calendar SHALL use the same account-scoped loaded item collection and mutation results. Switching tabs or months SHALL NOT create another persistence store or write deadlines. Loading, absent courses, no saved items, no month/filter matches, and retryable failures SHALL remain distinct with appropriate recovery actions; empty months SHALL remain navigable. Account replacement, sign-out, or session loss SHALL clear calendar entries, selected-date context, and edit drafts and ignore old asynchronous results, preserving existing owner authorization.

#### Scenario: Empty month and unavailable storage
- **WHEN** a selected month has no matching items or storage cannot load
- **THEN** the interface respectively shows a navigable empty calendar with clear filter context, or an actionable retryable error without sample data

#### Scenario: Account replacement during editing
- **WHEN** authentication changes while a calendar item is open or a save is pending
- **THEN** the previous account's calendar and modal disappear immediately and late responses cannot repopulate the new workspace
