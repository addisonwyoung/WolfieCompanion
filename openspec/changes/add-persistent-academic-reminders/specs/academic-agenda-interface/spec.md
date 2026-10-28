# Spec Delta

## MODIFIED Requirements

### Requirement: Readable campus-time deadlines
Deadline presentation SHALL use readable calendar dates and optional readable times, clearly identifying America/New_York for timed entries. Formatting SHALL NOT shift a stored calendar date with the browser's time zone, alter stored values, change grouping or sorting, or invent a time for date-only items. Date-only items SHALL remain due throughout their campus calendar date and become overdue only the following day. Existing periodic and return-to-view date refresh SHALL remain in effect. Deadline grouping SHALL remain unchanged. Reminder delivery timing and validated reminder settings SHALL follow `academic-reminders`, independently of overdue labels; no email notification SHALL be sent.

#### Scenario: Display an untimed deadline in another time zone
- **WHEN** a student views an item due October 21 without a time using a browser outside the campus time zone
- **THEN** the displayed date remains October 21 with no midnight default, and existing campus-day grouping remains unchanged

#### Scenario: Timed deadline and refresh
- **WHEN** a timed deadline passes or the student returns to the agenda
- **THEN** its readable time remains labeled for America/New_York and its group updates according to the existing deadline rules

### Requirement: Accessible modal editor and optional details
Add and Edit SHALL use one native modal dialog opened using `showModal()`, named by its visible heading. The editor SHALL contain title, saved course, type, required due date, optional campus time, completion status, Save, Cancel, and a labeled Close button. Location and notes SHALL be available under a keyboard-operable Optional details disclosure; values SHALL survive collapsing it. The disclosure SHALL start expanded when editing populated optional details or when necessary to reveal a validation error. Validation and limits SHALL match the existing workflow, with field labels, error associations, and focus moved to the first invalid control as appropriate. Opening Add with a course filter SHALL retain course prefill.

While the modal is open, background interaction SHALL be blocked, Tab/Shift+Tab SHALL remain within the active dialog content, and initial focus SHALL enter the Title field. Backdrop clicks SHALL NOT close the dialog, prompt to discard, or change the draft. The dialog SHALL preserve existing optional-time null behavior, contain no section field, and offer a labeled Reminders section with Use my defaults, Customize and the effective allowed offsets/Off. Three-hour reminders SHALL require a due time. Clearing time SHALL visibly remove an explicit three-hour selection from the unsaved draft. Reminder changes SHALL participate in existing dirtiness, validation, pending-save, failure/retry and same-dialog discard behavior. Personal defaults SHALL be configurable through the notification center; inherited and overridden choices SHALL be distinguishable.

#### Scenario: Open and operate the editor
- **WHEN** a student opens Add or Edit
- **THEN** focus enters the labeled modal, the background is inert, focus stays within the dialog, and the student can reach all fields and actions using the keyboard

#### Scenario: Collapsible details
- **WHEN** a student edits an item containing notes/location or collapses and reopens optional details
- **THEN** existing values remain available, populated details initially open, and disclosure changes alone do not mark the draft dirty

#### Scenario: Backdrop interaction
- **WHEN** a student clicks or taps the backdrop with a clean or dirty editor
- **THEN** the editor stays open with its draft unchanged and no discard confirmation

#### Scenario: Reminder draft controls
- **WHEN** a student customizes reminders and cancels, saves or experiences a failure
- **THEN** existing same-dialog discard, atomic server-confirmed save and retained-draft retry behavior covers reminder choices as well as item fields


### Requirement: Session and responsive regression safety
The presentation SHALL extend the existing Supabase adapter, mutation hook, validated payloads and additive schema only as required for atomic reminder configuration and reminder-target editing, while preserving the authentication boundary, course UUID associations, owner RLS, core CRUD semantics and account-keyed async protections. Reminder View item navigation SHALL resolve the current authorized item, close the reminder dialog before opening the existing editor, avoid duplicate opens, and preserve retained planner filters/month even when the target is outside them. Editor closure SHALL restore a visible planner fallback instead of a stale closed notification row. Sign-out, session loss, or account replacement SHALL immediately tear down menus, editor/unsaved confirmation, Delete confirmation including pending deletion, errors, and private drafts without requiring confirmation or allowing stale responses to restore them. Modal cleanup SHALL release background inertness and any scroll lock. At desktop and 375-pixel widths, long titles, badges, menus, and modal fields SHALL remain operable without page-level horizontal overflow; modal content SHALL scroll with all actions reachable, visible focus, and adequately sized control targets.

#### Scenario: Account changes during editing or save
- **WHEN** sign-out, session loss, or account replacement occurs while a draft, discard confirmation, save, Delete confirmation, or delete request is active
- **THEN** the old private UI disappears without confirmation, pending results do not close or populate the new workspace, and focus/background state is not restored into the previous account

#### Scenario: Narrow screen and long content
- **WHEN** the interface is used at 375 pixels with long titles, notes, and expanded optional details
- **THEN** rows wrap sensibly, action menus stay within the viewport, modal content scrolls, all controls remain keyboard/touch usable, and no page-level horizontal scrolling occurs

#### Scenario: Notification-origin editor
- **WHEN** an authorized reminder target arrives before the planner mounts or outside its retained filters/month
- **THEN** one current populated editor opens through the existing workflow, and stale account targets or deleted items never open an editable replacement

