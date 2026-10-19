# prototype-dashboard Specification

## Purpose

Provide an interactive Wolfie Companion prototype where students can edit a sample profile and discover fictional classmates through their sample courses.

## Requirements

### Requirement: Branded sample application shell
The application SHALL use Wolfie Companion branding and document title at its root URL. It SHALL show sign-in to unauthenticated visitors and the authenticated student's profile, enrolled courses, and classmates area after session resolution. Personal data SHALL come from the authenticated workspace. Any remaining fictional classmates SHALL be explicitly labeled as demo data; the personal profile and classes SHALL NOT be labeled sample data. Missing Supabase configuration SHALL show an actionable setup error without silently reverting to a sample identity.

#### Scenario: Open the prototype
- **WHEN** an unauthenticated visitor opens the root page
- **THEN** they see the branded Google sign-in flow without a fictional personal identity

#### Scenario: Open an authenticated workspace
- **WHEN** an eligible student's session and saved data resolve
- **THEN** their profile and courses are displayed and any fictional classmates are separately labeled

### Requirement: Editable sample profile
The dashboard SHALL display the authenticated student's saved profile and provide editable name, major, year, interests, residence status, and picture as specified by student-profile. Save SHALL persist valid changes and Cancel SHALL discard draft changes. Selecting courses SHALL NOT discard saved edits. Reloading SHALL restore Supabase data rather than the original fictional profile.

#### Scenario: Save profile changes
- **WHEN** a student saves profile changes, selects another course, and reloads
- **THEN** the saved profile values remain available

#### Scenario: Cancel profile changes
- **WHEN** a student cancels an edit
- **THEN** the previous saved values remain displayed

#### Scenario: Reject blank major
- **WHEN** a student saves a blank major with a valid name
- **THEN** the optional major is cleared rather than rejected, superseding the prototype's required-major restriction

#### Scenario: Clear optional interests
- **WHEN** a student saves an empty interests field with otherwise valid values
- **THEN** the saved profile indicates that no interests have been added

#### Scenario: Reload demo state
- **WHEN** a student reloads after saving profile edits
- **THEN** the saved Supabase profile is restored rather than the original sample identity

### Requirement: Fixed sample course selection
The dashboard SHALL list the authenticated student's saved courses using consistently spaced course codes and retain distinct sections. Initial selection SHALL reference a loaded course, and changing selection SHALL update the heading and results. An empty course list SHALL show an add-classes prompt without a selected-course heading or stale roster. No fixed set of courses SHALL be assigned to new accounts.

#### Scenario: Select another course
- **WHEN** a student selects a different loaded course
- **THEN** that selection is visibly and programmatically indicated and the corresponding heading and results update

#### Scenario: No saved classes
- **WHEN** a student's course list is empty
- **THEN** the dashboard offers class entry and does not attempt to render an undefined selected course

### Requirement: Course-specific sample classmates
The authenticated dashboard SHALL show live classmates for the selected saved course using the classmate-discovery contract. It SHALL display only name and major, exclude the current user and duplicates, and derive the displayed count from successful results. Fictional or seeded demonstration profiles SHALL remain separate from live results and SHALL NOT be merged into, substituted for, or used as fallback for an empty or failed lookup. No minimum roster size SHALL be assumed. Course changes SHALL clear old results immediately and expose an accessible loading state; errors SHALL offer retry and remain distinct from successful empty results. Account changes, sign-out, and superseded requests SHALL NOT leave or restore stale classmate data. With no saved course selected, the system SHALL show the existing add-classes prompt without issuing discovery requests.

#### Scenario: View matching classmates
- **WHEN** a student selects a saved course and the lookup succeeds
- **THEN** only matching real classmates appear once with name and major and an accurate count, without fictional-data labeling

#### Scenario: Student enrolled in multiple courses
- **WHEN** a real classmate shares two saved courses with the viewer and the viewer selects each in turn
- **THEN** that classmate appears once in each appropriate roster

#### Scenario: No matching classmates
- **WHEN** a successful lookup returns no other students
- **THEN** the dashboard shows zero classmates and a real-data empty state without seeded substitutions

#### Scenario: Loading, failure, and retry
- **WHEN** a course lookup is pending or fails
- **THEN** the dashboard shows loading or a retryable error respectively, without presenting an empty success count or the previous roster
- **AND** retry requests the currently selected course

#### Scenario: Stale responses and session changes
- **WHEN** a request completes after the selection or authenticated account changes or the student signs out
- **THEN** it does not populate the current roster

#### Scenario: No saved classes
- **WHEN** no saved course is available
- **THEN** the dashboard shows the add-classes prompt without a selected-course roster or discovery request

### Requirement: Responsive and keyboard-usable interactions
The application SHALL keep profile editing, course selection, and classmates usable at narrow mobile and desktop viewport widths without page-level horizontal overflow. Form controls SHALL have visible labels, keyboard focus SHALL be visible, and course selection SHALL be exposed programmatically as well as visually.

#### Scenario: Use the dashboard on a narrow screen
- **WHEN** the visitor views the dashboard at a 375-pixel viewport width
- **THEN** all sections and controls remain readable and operable without horizontal page scrolling

#### Scenario: Use only the keyboard
- **WHEN** the visitor tabs through the dashboard and activates controls with the keyboard
- **THEN** they can edit, save or cancel their profile and select each course with visible focus
