# Spec Delta

## MODIFIED Requirements

### Requirement: Compact grouped agenda
The Agenda tab within Assignments & Exams SHALL display academic items as compact agenda rows with a completion checkbox, readable title and course, a subtle textual type badge, readable deadline, and an actions button. Rows SHALL retain optional location information when present; full notes SHALL remain accessible through editing. Pending rows SHALL retain the existing Overdue, Today, and Upcoming grouping and ordering. Existing course, type, and Pending/Completed status filters SHALL remain available with unchanged semantics, independent of classmate selection. Existing loading, missing-course, empty, no-match, and retryable-error states SHALL remain distinct.

#### Scenario: Scan and filter existing items
- **WHEN** a student filters saved items by course, type, or status
- **THEN** matching items appear as compact rows in the same groups and order as before, with visible textual type labels and no change to the dashboard's selected classmate course

#### Scenario: Empty or unavailable data
- **WHEN** there are no courses, no items, no filter matches, or a load failure
- **THEN** the interface respectively offers course entry, adding an item, clearing filters, or retry without substituting sample data or blocking the existing dashboard

### Requirement: Save lifecycle and focus restoration
The modal SHALL submit through the existing persistence/mutation boundary and close only after server-confirmed success. During a save, it SHALL announce progress, prevent repeated submissions, disable editing/dismissal actions, and ignore Escape dismissal. On failure, it SHALL remain open with all draft values preserved, announce the error inside the modal, and permit retry or an explicitly confirmed discard. On successful save or dismissal, focus SHALL return to Add item, the originating Agenda row's actions button, or the originating Calendar item button; if that trigger no longer exists or is hidden in the current view, focus SHALL go to a logical visible fallback in the active Agenda or Calendar tab. No focus SHALL be restored into an obsolete account or disconnected control.

#### Scenario: Save succeeds or fails
- **WHEN** an Add/Edit save succeeds or fails
- **THEN** success updates the shared item state for Agenda and Calendar, closes the dialog, and restores logical focus; failure keeps the draft and an accessible error inside the open dialog without claiming success

#### Scenario: Save is still pending
- **WHEN** a student repeats Save, presses Escape, or tries Cancel/Close while saving
- **THEN** exactly one mutation is issued and the editor remains open until its outcome or account teardown

#### Scenario: Saved item leaves the current filter
- **WHEN** a successful edit changes course, type, or completion so the original row or calendar item disappears
- **THEN** the modal closes and focus moves to an available control in the active Agenda or Calendar tab instead of a removed trigger

#### Scenario: Calendar item moves outside the active month
- **WHEN** a successful calendar edit moves an item to another month or outside the active filters
- **THEN** the calendar stays on the viewed month and focus moves to a visible date or calendar heading instead of a hidden Agenda trigger

