# Spec Delta

## Purpose

Provide an accessible notification bell and persistent academic reminder inbox throughout the authenticated student workspace, with reliable read, clear and coursework navigation.

## ADDED Requirements

### Requirement: Workspace bell and independent unread badge
Every eligible signed-in workspace view SHALL offer a labeled notification bell with a badge for the total unread, undismissed delivered academic reminders, including rows beyond the loaded page. The badge SHALL visually cap at 99+ while retaining an accessible meaningful count. Zero unread SHALL show no numeric badge. Opening/closing the bell SHALL toggle an anchored responsive dropdown and SHALL NOT mark every reminder read or clear it. New delivery SHALL update the count/list on successful refresh without auto-opening the dropdown, stealing focus or repeatedly interrupting. Messaging badges and read positions SHALL remain independent. Signed-out/ineligible users SHALL not see private notification controls/content.

#### Scenario: Receive outside the planner
- **WHEN** an academic reminder arrives while the student is reading a chat
- **THEN** the bell updates without opening itself, changing chat focus or altering message unread counts

#### Scenario: Open and close
- **WHEN** the student opens the bell then closes it without selecting a reminder
- **THEN** its unread count remains unchanged and saved notifications remain

### Requirement: Persistent paginated dropdown states
The dropdown SHALL show newest delivered undismissed reminders first, with stable ordering and pages of 20, Load more, course/title/deadline/reminder context, visible unread/read distinction and an individually labeled Clear action separate from opening the row. It SHALL offer Reminder settings and Clear all, with explicit initial-loading, empty, stale/error/retry, paging and mutation states. Read but uncleared entries SHALL stay. Failed requests SHALL not masquerade as empty state or discard prior rows/drafts. Failed paging SHALL retry the same cursor; successful refresh SHALL reconcile cleared/invalidated entries without duplicate rows. Long text and many entries SHALL remain reachable by internal scrolling at 375px and desktop widths without horizontal page overflow.

#### Scenario: Read entries remain
- **WHEN** a student returns after opening a reminder but not clearing it
- **THEN** the entry persists with read styling while the unread badge excludes it

#### Scenario: Load more failure
- **WHEN** loading a later page fails
- **THEN** existing rows remain, a retryable error appears and retry requests the same boundary without skipping reminders

### Requirement: Reminder details and authorized item navigation
Selecting a reminder SHALL close the dropdown, open a named details dialog and attempt to mark only that reminder read. Details SHALL show title, course, type, deadline and reminder context with Close, Clear and View item. A failed read update SHALL preserve saved unread state/count and show retry rather than falsely confirm success. View item SHALL close the details before navigating into the existing populated academic editor by authorized current item identity, even outside the current planner filters/month/completion selection and before its first mount. Existing filter/month context SHALL not be destructively reset solely for navigation. Missing/deleted/inaccessible items SHALL produce an unavailable state with no fictional replacement. Only one modal SHALL be active; navigation SHALL respect existing unsaved-draft guards and never bypass ownership checks.

#### Scenario: Open one reminder
- **WHEN** the student selects one of several unread entries
- **THEN** its details appear, only that entry is marked read on confirmed success and the others remain unread

#### Scenario: Open coursework from another view
- **WHEN** the student uses View item from a reminder while on Dashboard or Messages and the item is outside retained planner filters
- **THEN** Assignments & Exams opens the correct current item in the existing editor without losing retained filters/month or opening overlapping dialogs

#### Scenario: Item no longer available
- **WHEN** a selected notification's item is deleted or becomes inaccessible before navigation
- **THEN** no editor with stale editable content opens and an unavailable state offers safe close/clear behavior

### Requirement: Persistent individual and batch clearing
Students SHALL be able to clear one reminder from the list/details and clear all delivered reminders through the captured batch boundary, including read reminders and unloaded pages. Clearing SHALL dismiss notifications only, never delete or complete academic work. List/count/details SHALL update only after confirmed success; duplicates SHALL be suppressed while pending. Failure SHALL retain visible context and permit retry with the same intended ID/bound. A new delivery after the batch boundary SHALL remain visible/unread. Successful details clearing SHALL close the details and return focus to the bell or another available control. No clear action SHALL mark unrelated message/friend state read.

#### Scenario: Clear an individual
- **WHEN** the student confirms a Clear action by activating its button
- **THEN** server-confirmed dismissal removes it and updates count, the underlying item remains, and it stays cleared after reload

#### Scenario: Clear fails
- **WHEN** an individual or batch clear fails
- **THEN** affected reminders remain with actionable error state and retry cannot accidentally clear later deliveries

### Requirement: Accessible interaction and account-safe lifecycle
The bell SHALL expose expanded state and association to the dropdown. Keyboard users SHALL reach all list/settings/clear actions with visible focus; Escape and outside activation SHALL dismiss the idle dropdown appropriately. Details/settings SHALL use named native modal dialogs with focus containment and logical restoration, no browser alerts or stacked modals. Pending writes SHALL prevent duplicate activation; errors/progress SHALL be announced without repeated polling announcements. Bell/dropdown SHALL respect an existing modal's inert background. Sign-out, eligibility loss or account replacement SHALL clear private counts, rows, dialogs, settings drafts, target navigation and subscriptions/timers; superseded reads/writes SHALL not restore old data/focus or navigate the replacement account. Private caches/drafts SHALL not persist in browser localStorage or URLs. Hidden/unmounted refresh work SHALL stop and foreground/reconnect SHALL reconcile server state. Missing reminder storage SHALL show isolated retryable setup guidance without breaking existing academic CRUD/calendar or messaging.

#### Scenario: Keyboard and mobile
- **WHEN** a student uses keyboard navigation or a 375px screen
- **THEN** bell, dropdown, settings, reminder details and clear/item controls remain reachable, dialogs contain focus and closing restores an available logical control

#### Scenario: Account replacement during pending action
- **WHEN** the account changes during refresh, details load, settings save, read, clear or View item resolution
- **THEN** all old reminder UI/targets disappear and late results cannot populate, clear or navigate the new account
