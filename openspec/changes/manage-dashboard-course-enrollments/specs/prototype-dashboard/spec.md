# Spec Delta

## ADDED Requirements

### Requirement: Edit and remove dashboard courses
The dashboard SHALL provide an edit action and a delete action for each of the authenticated student's current-semester course entries. The edit form SHALL be prefilled with the selected entry and provide validation, Save, and Cancel. Delete SHALL require an accessible confirmation that identifies the course. Successful changes SHALL refresh the course list and selected-course state; removal or changing the selected course SHALL clear stale classmates and recommendations. Failed saves SHALL preserve the displayed entry and allow retry. Controls SHALL remain keyboard usable and fit the existing responsive dashboard layout.

#### Scenario: Open a course for editing
- **WHEN** the student chooses Edit for a dashboard course
- **THEN** an editable form opens with that course's current values and the student can save corrections or cancel without changing the saved course

#### Scenario: Update selected course
- **WHEN** the student successfully edits the selected course
- **THEN** the corrected course remains selected, its heading reflects the corrected details, and no results from its old identity remain visible

#### Scenario: Confirm or cancel course removal
- **WHEN** the student chooses Delete for a course
- **THEN** an accessible confirmation names the course; confirming removes it and canceling leaves it unchanged

#### Scenario: Handle mutation failure
- **WHEN** a course edit or removal request fails
- **THEN** the course remains listed with an accessible error and retry path

#### Scenario: Keyboard and narrow-screen use
- **WHEN** a student uses the edit or delete controls with a keyboard or at a 375-pixel viewport
- **THEN** every control and confirmation remains reachable, labeled, and operable without horizontal page scrolling
