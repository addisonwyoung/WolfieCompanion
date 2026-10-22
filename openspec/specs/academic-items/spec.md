# academic-items Specification

## Purpose

Help authenticated students privately manage course-linked assignments, exams, quizzes, and projects through a persistent agenda with in-app deadline indicators.

## Requirements

### Requirement: Private course-linked persistence
The system SHALL persist academic items in one private Supabase `academic_items` table. Each item SHALL reference the student's saved course by its actual database UUID. Authenticated course data SHALL preserve that UUID separately from the existing UI course identifier after both loading and saving courses. RLS SHALL restrict reads and writes to eligible owners and verify ownership of the associated course on inserts and updates. Ownership SHALL NOT be transferable. Items SHALL NOT be exposed through classmate discovery.

#### Scenario: Preserve course identity
- **WHEN** a student loads courses or saves manual or reviewed imported courses
- **THEN** each saved course retains both its existing UI identifier and its database UUID, and academic items use the UUID for association

#### Scenario: Reject unauthorized access
- **WHEN** an anonymous, ineligible, or second-user client attempts to read or modify another student's items directly
- **THEN** the database denies access without exposing private content

#### Scenario: Reject course or owner reassignment
- **WHEN** an owner attempts to create or update an item using another student's course or transfer the item to another owner
- **THEN** the database rejects the write and preserves the existing item

### Requirement: Focused item editing and completion
Students SHALL be able to add, view, and edit items with a required saved course, trimmed nonblank title of at most 200 characters, type (assignment, exam, quiz, or project), required date, optional time, optional notes of at most 5000 characters, optional location of at most 200 characters, and completion status. Items SHALL have no section field. Students SHALL be able to mark any item complete and reopen it. Saves SHALL persist across reloads and devices. Cancel SHALL request dismissal without saving; dirty drafts SHALL require the same-dialog discard confirmation specified by `academic-agenda-interface` before being discarded. Failed saves SHALL retain drafts and SHALL NOT report success. Pending writes SHALL prevent duplicate submissions.

#### Scenario: Save and restore an item
- **WHEN** a student saves a valid item with optional location and no time and reloads
- **THEN** the saved course, title, type, date, location, notes, and completion status are restored without an invented time or section

#### Scenario: Validate and retry
- **WHEN** a form has an invalid field or its persistence request fails
- **THEN** the interface identifies the problem, retains the draft, and allows correction or retry without reporting a successful save

#### Scenario: Complete and reopen
- **WHEN** a student marks an assignment, exam, quiz, or project complete and subsequently reopens it
- **THEN** both changes persist and the item returns to its appropriate date group when reopened

### Requirement: Confirmed individual item deletion
Students SHALL be able to delete their own individual academic items, whether pending or completed. Before issuing a delete request, the interface SHALL identify the item and require explicit confirmation, with a cancel option. Cancel SHALL leave storage unchanged. A successful deletion SHALL persist across reloads, remove only the selected item, and leave its course and other items intact. Failed deletion SHALL preserve the displayed item, announce an error, and allow retry without claiming success. Duplicate delete submissions SHALL be prevented while pending. RLS SHALL deny deletion by anonymous, ineligible, and other-user callers.

#### Scenario: Confirm deletion
- **WHEN** a student confirms deletion of their pending or completed item
- **THEN** only that item is removed from storage and the agenda, including after reload, while its course and other items remain

#### Scenario: Cancel deletion
- **WHEN** a student cancels the confirmation
- **THEN** no delete request is issued and the item remains unchanged

#### Scenario: Failed deletion
- **WHEN** a confirmed delete request fails
- **THEN** the item remains displayed with an accessible retryable error and no success announcement

#### Scenario: Unauthorized deletion
- **WHEN** an anonymous, ineligible, or other-user caller attempts direct deletion
- **THEN** the database denies deletion and preserves the item

### Requirement: Authenticated accessible agenda
The authenticated workspace SHALL offer an Assignments & Exams navigation view defaulting to all saved courses, with course and type filters independent of classmate selection. It SHALL display pending items chronologically in Overdue, Today, and Upcoming groups and completed items in a separate Completed view. Rows SHALL expose title, course, type, date, optional time/location, editing, and completion controls. All pending item types SHALL use the same date grouping rules. The interface SHALL retain existing branding and remain keyboard usable at 375-pixel and desktop widths without horizontal page overflow. Controls SHALL have visible labels and focus, and loading, errors, and write results SHALL be announced accessibly.

#### Scenario: Filter the agenda
- **WHEN** a student opens the view and then filters to a saved course and item type
- **THEN** the initial agenda covers all saved courses and subsequent results match both filters without changing the dashboard's classmate selection

#### Scenario: Distinguish empty and failed states
- **WHEN** courses are absent, items are absent, filters have no matches, or loading fails
- **THEN** the interface respectively offers course entry, item creation, clearing filters, or retry without substituting sample items

#### Scenario: Keyboard and mobile use
- **WHEN** a student uses only the keyboard or a 375-pixel viewport
- **THEN** they can filter, add, edit, save, cancel, complete, and reopen items with labeled controls and visible focus without horizontal page scrolling

#### Scenario: Accessible deletion confirmation
- **WHEN** a student deletes an item using only the keyboard
- **THEN** they can reach and operate the confirmation and cancel controls with visible focus, and focus returns to a sensible agenda control after confirmation or cancellation

### Requirement: In-app deadline indicators
The system SHALL use America/New_York campus time for date grouping and clearly label that time zone for timed entries. A pending date-only item SHALL be Today throughout its date and Overdue only on a later campus date. A timed item SHALL be Overdue once its time has passed, Today when its date is today and its time has not passed, and Upcoming when its date is later. Completed items SHALL not appear as overdue. Indicators SHALL update while the view is open and on returning to it. This feature SHALL NOT offer or send email notifications.

#### Scenario: Date-only boundary
- **WHEN** the campus date advances past a pending date-only item's date
- **THEN** the item moves from Today to Overdue without relying on the browser's local time zone

#### Scenario: No default midnight for date-only work
- **WHEN** a student saves an item due October 21 without specifying a time, or clears its previously specified time
- **THEN** the time remains unspecified in storage and display, the item stays Today throughout October 21, and it first becomes Overdue on October 22 in campus time, without a default midnight deadline on October 21

#### Scenario: Timed boundary and completion
- **WHEN** a pending item's campus deadline passes while the agenda is open
- **THEN** it becomes Overdue, while completed items remain in Completed

### Requirement: Preserve academic items on course removal
The database SHALL reject deletion of a saved course while academic items reference it, including completed items. Course removal SHALL NOT cascade into silent item deletion. Any future course-removal interface SHALL explain this restriction and require an explicit resolution before removal; course-removal UI is outside this change.

#### Scenario: Delete a referenced course directly
- **WHEN** a student attempts to delete a saved course with pending or completed academic items
- **THEN** deletion is rejected and both the course and its items remain stored

### Requirement: Session-safe state
The interface SHALL clear private item data and drafts on sign-out or account change and SHALL ignore superseded requests. An item-storage failure SHALL remain isolated from otherwise available profile and course functionality.

#### Scenario: Stale response after account switch
- **WHEN** a load or mutation response for one account completes after sign-out or switching accounts
- **THEN** it does not restore that account's items, draft, or success message in the current workspace

#### Scenario: Storage unavailable
- **WHEN** academic item storage is unavailable
- **THEN** the planner shows an actionable retryable error while the existing dashboard remains usable
