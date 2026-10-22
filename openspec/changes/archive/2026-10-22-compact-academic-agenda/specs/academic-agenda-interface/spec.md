# Spec Delta

## Purpose

Provide a compact, accessible agenda and focused modal editing experience for the existing private academic-items workflow, preserving its persistence, deadline semantics, and session protections.

## ADDED Requirements

### Requirement: Compact grouped agenda
The Assignments & Exams interface SHALL display academic items as compact agenda rows with a completion checkbox, readable title and course, a subtle textual type badge, readable deadline, and an actions button. Rows SHALL retain optional location information when present; full notes SHALL remain accessible through editing. Pending rows SHALL retain the existing Overdue, Today, and Upcoming grouping and ordering. Existing course, type, and Pending/Completed status filters SHALL remain available with unchanged semantics, independent of classmate selection. Existing loading, missing-course, empty, no-match, and retryable-error states SHALL remain distinct.

#### Scenario: Scan and filter existing items
- **WHEN** a student filters saved items by course, type, or status
- **THEN** matching items appear as compact rows in the same groups and order as before, with visible textual type labels and no change to the dashboard's selected classmate course

#### Scenario: Empty or unavailable data
- **WHEN** there are no courses, no items, no filter matches, or a load failure
- **THEN** the interface respectively offers course entry, adding an item, clearing filters, or retry without substituting sample data or blocking the existing dashboard

### Requirement: Accessible server-confirmed completion
Each row SHALL expose a labeled native checkbox reflecting persisted completion. Checking a pending item SHALL complete it; clearing a completed item SHALL reopen it, for all four existing types. While a mutation is pending, duplicate or conflicting mutations SHALL be prevented using the existing busy state. Failed completion SHALL retain the last confirmed checked state and announce an accessible retryable error. If a confirmed update removes a focused row from the current view, focus SHALL move to the next logical row control, group heading, or Add item control.

#### Scenario: Complete and reopen
- **WHEN** a student uses a checkbox to complete or reopen an assignment, exam, quiz, or project
- **THEN** the persisted update moves it to the appropriate existing view/group only after confirmation and preserves a sensible keyboard focus position

#### Scenario: Completion fails or is pending
- **WHEN** a completion write is pending or fails
- **THEN** repeat writes are prevented, and failure leaves the checkbox at its previous confirmed value with an announced error

### Requirement: Keyboard-operable item actions
Each row SHALL have a three-dot button with an item-specific accessible name and programmatic expanded/menu state, opening Edit and Delete actions. At most one menu SHALL be open. Enter or Space SHALL open it and focus its first action; Up/Down arrows SHALL navigate actions, Home/End SHALL move to the first/last action, and Enter/Space SHALL activate the focused action. Escape SHALL close the menu and restore its trigger's focus. Tab/Shift+Tab SHALL dismiss the menu and continue logical page navigation. Pointer interaction outside the menu SHALL dismiss it without activating an action. Edit SHALL open the item editor; Delete SHALL open the native confirmation dialog specified below while retaining the existing owner-scoped delete mutation.

#### Scenario: Edit through the menu
- **WHEN** a student opens an item's actions with the keyboard and chooses Edit
- **THEN** the menu closes and the modal opens with that item's existing values, retaining its actions button as the return-focus target

#### Scenario: Dismiss a menu
- **WHEN** a student presses Escape, tabs away, clicks outside the menu, or opens another row's menu
- **THEN** the menu closes without modifying an item, with Escape restoring the original trigger and Tab continuing navigation

#### Scenario: Delete through the menu
- **WHEN** a student chooses Delete from a row's actions
- **THEN** the menu closes, the native Delete confirmation opens for that item, and its persistent actions button is retained as a possible return-focus target

### Requirement: Consistent native confirmation dialogs
All confirmation interactions in Assignments & Exams SHALL use styled native `showModal()` dialogs or content views within them, never `window.confirm()` or `window.alert()`. Delete confirmation and unsaved-draft confirmation SHALL share consistent surfaces, backdrops, heading/description styling, action alignment, destructive styling, visible focus, and responsive behavior. Both SHALL have accessible names/descriptions, initially focus the safe action, block background interaction, contain Tab/Shift+Tab, and ignore backdrop clicks. Only one modal SHALL be active: unsaved confirmation SHALL remain inside the Add/Edit dialog, and Delete SHALL not open over it. Ordinary Save, Mark Complete, and Reopen SHALL NOT add confirmation prompts.

#### Scenario: Safe and consistent confirmation entry
- **WHEN** a student opens Delete confirmation or the unsaved-draft confirmation view
- **THEN** the named native dialog initially focuses Cancel or Keep Editing respectively, uses consistent confirmation styling, and leaves background content inert with no second active modal

#### Scenario: Ordinary mutations need no confirmation
- **WHEN** a student saves valid changes, marks an item complete, or reopens one
- **THEN** the existing validation/mutation flow runs directly without an additional confirmation or browser alert

### Requirement: Native Delete confirmation and retry
Choosing Delete SHALL open a custom accessible native dialog identifying the academic item and stating that deletion cannot be undone, with Cancel and a clearly styled destructive Delete button. Cancel and Escape when idle or after failure SHALL close it without issuing a delete request and restore focus to the item's actions button or an available agenda fallback. Only explicit Delete activation SHALL issue the existing mutation. Pending deletion SHALL retain the dialog, announce progress within it, prevent duplicate Delete activation, disable dismissal, and ignore Escape. Failure SHALL preserve the row and item context, keep the dialog open, announce an error inside it, and re-enable Cancel and Delete for explicit retry. Only server-confirmed success SHALL remove the selected item and close the dialog, preserving its course/sibling items and moving focus to a sensible remaining agenda control. Stale responses SHALL not close or populate another account's UI.

#### Scenario: Cancel deletion safely
- **WHEN** a student opens Delete confirmation and activates the initially focused Cancel, presses Escape, or presses Enter while Cancel has focus
- **THEN** no delete request is issued, the item stays unchanged, the dialog closes, and focus returns to the originating actions button or a visible fallback

#### Scenario: Confirm deletion and prevent duplicates
- **WHEN** a student explicitly activates Delete and then repeats activation or attempts dismissal before its outcome
- **THEN** exactly one existing delete mutation runs, the dialog remains open with announced progress, and only server-confirmed success removes the selected row and closes it

#### Scenario: Deletion fails and is retried
- **WHEN** the delete mutation fails
- **THEN** the row remains, the same dialog retains its item identification and announces the error, Cancel/Escape can close without another request, and a subsequent explicit Delete retries the mutation

#### Scenario: Delete backdrop interaction
- **WHEN** a student clicks the Delete confirmation backdrop before, during, or after a failed request
- **THEN** the confirmation stays open without changing its context or issuing a request

### Requirement: Readable campus-time deadlines
Deadline presentation SHALL use readable calendar dates and optional readable times, clearly identifying America/New_York for timed entries. Formatting SHALL NOT shift a stored calendar date with the browser's time zone, alter stored values, change grouping or sorting, or invent a time for date-only items. Date-only items SHALL remain due throughout their campus calendar date and become overdue only the following day. Existing periodic and return-to-view date refresh SHALL remain in effect. This change SHALL introduce no custom DST disambiguation, reminder frequency setting, or email notification.

#### Scenario: Display an untimed deadline in another time zone
- **WHEN** a student views an item due October 21 without a time using a browser outside the campus time zone
- **THEN** the displayed date remains October 21 with no midnight default, and existing campus-day grouping remains unchanged

#### Scenario: Timed deadline and refresh
- **WHEN** a timed deadline passes or the student returns to the agenda
- **THEN** its readable time remains labeled for America/New_York and its group updates according to the existing deadline rules

### Requirement: Accessible modal editor and optional details
Add and Edit SHALL use one native modal dialog opened using `showModal()`, named by its visible heading. The editor SHALL contain title, saved course, type, required due date, optional campus time, completion status, Save, Cancel, and a labeled Close button. Location and notes SHALL be available under a keyboard-operable Optional details disclosure; values SHALL survive collapsing it. The disclosure SHALL start expanded when editing populated optional details or when necessary to reveal a validation error. Validation and limits SHALL match the existing workflow, with field labels, error associations, and focus moved to the first invalid control as appropriate. Opening Add with a course filter SHALL retain course prefill.

While the modal is open, background interaction SHALL be blocked, Tab/Shift+Tab SHALL remain within the active dialog content, and initial focus SHALL enter the Title field. Backdrop clicks SHALL NOT close the dialog, prompt to discard, or change the draft. The dialog SHALL preserve existing optional-time null behavior and contain no section or reminder controls.

#### Scenario: Open and operate the editor
- **WHEN** a student opens Add or Edit
- **THEN** focus enters the labeled modal, the background is inert, focus stays within the dialog, and the student can reach all fields and actions using the keyboard

#### Scenario: Collapsible details
- **WHEN** a student edits an item containing notes/location or collapses and reopens optional details
- **THEN** existing values remain available, populated details initially open, and disclosure changes alone do not mark the draft dirty

#### Scenario: Backdrop interaction
- **WHEN** a student clicks or taps the backdrop with a clean or dirty editor
- **THEN** the editor stays open with its draft unchanged and no discard confirmation

### Requirement: Same-dialog unsaved-draft confirmation
Cancel, Close, and Escape SHALL request dismissal through a shared draft check. A clean draft SHALL close without confirmation. A dirty draft SHALL show a named confirmation inside the same native dialog with Keep Editing and Discard Changes; a second modal and browser confirmation SHALL NOT be used for unsaved drafts. Only the confirmation controls SHALL be active while it is displayed, with initial focus on Keep Editing. Keep Editing and Escape from the confirmation SHALL restore the editor and draft; Discard Changes SHALL close without a save request. Dirtiness SHALL compare editable values against opening values without requiring successful validation; reverted values SHALL become clean and generated timestamps/disclosure state SHALL not independently create dirtiness.

#### Scenario: Attempt to dismiss a dirty draft
- **WHEN** a student changes any editable value and uses Cancel, Close, or Escape
- **THEN** the same dialog asks whether to discard, Keep Editing retains every field and returns focus into the editor, and Discard Changes closes without persisting the draft

#### Scenario: Revert or keep editing
- **WHEN** a student restores all editable values to their opening state, or presses Escape in discard confirmation
- **THEN** the restored draft can close as clean, or Escape returns to editing without discarding respectively

### Requirement: Save lifecycle and focus restoration
The modal SHALL submit through the existing persistence/mutation boundary and close only after server-confirmed success. During a save, it SHALL announce progress, prevent repeated submissions, disable editing/dismissal actions, and ignore Escape dismissal. On failure, it SHALL remain open with all draft values preserved, announce the error inside the modal, and permit retry or an explicitly confirmed discard. On successful save or dismissal, focus SHALL return to Add item or the originating row's actions button; if that row no longer exists in the current view, focus SHALL go to a logical agenda fallback. No focus SHALL be restored into an obsolete account or disconnected control.

#### Scenario: Save succeeds or fails
- **WHEN** an Add/Edit save succeeds or fails
- **THEN** success updates the agenda, closes the dialog, and restores logical focus; failure keeps the draft and an accessible error inside the open dialog without claiming success

#### Scenario: Save is still pending
- **WHEN** a student repeats Save, presses Escape, or tries Cancel/Close while saving
- **THEN** exactly one mutation is issued and the editor remains open until its outcome or account teardown

#### Scenario: Saved item leaves the current filter
- **WHEN** a successful edit changes course, type, or completion so the original row disappears
- **THEN** the modal closes and focus moves to an available agenda control instead of a removed trigger

### Requirement: Session and responsive regression safety
The presentation SHALL preserve the existing Supabase adapter, mutation hook, payloads, authentication boundary, course UUID associations, RLS, migrations/schema, CRUD semantics, and account-keyed async protections. Sign-out, session loss, or account replacement SHALL immediately tear down menus, editor/unsaved confirmation, Delete confirmation including pending deletion, errors, and private drafts without requiring confirmation or allowing stale responses to restore them. Modal cleanup SHALL release background inertness and any scroll lock. At desktop and 375-pixel widths, long titles, badges, menus, and modal fields SHALL remain operable without page-level horizontal overflow; modal content SHALL scroll with all actions reachable, visible focus, and adequately sized control targets.

#### Scenario: Account changes during editing or save
- **WHEN** sign-out, session loss, or account replacement occurs while a draft, discard confirmation, save, Delete confirmation, or delete request is active
- **THEN** the old private UI disappears without confirmation, pending results do not close or populate the new workspace, and focus/background state is not restored into the previous account

#### Scenario: Narrow screen and long content
- **WHEN** the interface is used at 375 pixels with long titles, notes, and expanded optional details
- **THEN** rows wrap sensibly, action menus stay within the viewport, modal content scrolls, all controls remain keyboard/touch usable, and no page-level horizontal scrolling occurs
