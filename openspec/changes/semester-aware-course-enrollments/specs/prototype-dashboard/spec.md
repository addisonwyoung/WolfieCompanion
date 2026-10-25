# Spec Delta

## MODIFIED Requirements

### Requirement: Fixed sample course selection
The dashboard SHALL list only the authenticated student's saved courses for the semester and academic year currently resolved from the semester calendar, using consistently spaced course codes and retaining each distinct section. Initial selection SHALL reference a loaded current-semester class, and changing selection SHALL update the heading and results. At a semester transition, prior-term classes SHALL disappear from the dashboard without deleting their enrollment history. An empty current-semester course list SHALL show an add-classes prompt without a selected-course heading or stale roster. No fixed set of courses SHALL be assigned to new accounts.

#### Scenario: Select another course
- **WHEN** a student selects a different loaded class in the active semester
- **THEN** that selection is visibly and programmatically indicated and the corresponding heading and results update

#### Scenario: No saved classes
- **WHEN** the calendar advances to a new semester and the student has not saved classes for it
- **THEN** the dashboard offers class entry and does not show prior-semester courses or a stale selected-course heading

#### Scenario: Keep past classes in history
- **WHEN** a student's dashboard switches to a new semester
- **THEN** previous enrollments remain stored for historical review authorization

#### Scenario: Do not assign demo courses
- **WHEN** a new account has no saved current-semester classes
- **THEN** no fixed or sample set of courses is assigned to that account
