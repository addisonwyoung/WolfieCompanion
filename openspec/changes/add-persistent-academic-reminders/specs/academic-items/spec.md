# Spec Delta

## MODIFIED Requirements

### Requirement: Focused item editing and completion
Students SHALL be able to add, view, and edit items with a required saved course, trimmed nonblank title of at most 200 characters, type (assignment, exam, quiz, or project), required date, optional time, optional notes of at most 5000 characters, optional location of at most 200 characters, and completion status. Items SHALL have no section field. Each item SHALL also persist Use my defaults or a validated explicit reminder-offset selection including Off, according to `academic-reminders`; item fields and reminder override SHALL save atomically. Reminder configuration SHALL participate in validation, dirty-draft handling and restoration across devices. Students SHALL be able to mark any item complete and reopen it. Saves SHALL persist across reloads and devices. Cancel SHALL request dismissal without saving; dirty drafts SHALL require the same-dialog discard confirmation specified by `academic-agenda-interface` before being discarded. Failed saves SHALL retain drafts and SHALL NOT report success. Pending writes SHALL prevent duplicate submissions.

#### Scenario: Save and restore an item
- **WHEN** a student saves a valid item with optional location and no time and reloads
- **THEN** the saved course, title, type, date, location, notes, and completion status are restored without an invented time or section

#### Scenario: Validate and retry
- **WHEN** a form has an invalid field or its persistence request fails
- **THEN** the interface identifies the problem, retains the draft, and allows correction or retry without reporting a successful save

#### Scenario: Complete and reopen
- **WHEN** a student marks an assignment, exam, quiz, or project complete and subsequently reopens it
- **THEN** both changes persist and the item returns to its appropriate date group when reopened, completion invalidates active/future reminders and reopening does not replay terminal delivered or cleared occurrences

#### Scenario: Save reminder configuration atomically
- **WHEN** a student saves valid item fields with an override or the save fails
- **THEN** both fields and reminder choice persist together on success, or neither is partially committed and the draft remains for retry

