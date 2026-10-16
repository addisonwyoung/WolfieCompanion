# Spec Delta

## MODIFIED Requirements

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
The application SHALL keep existing fictional classmate demonstrations separate from real account records and label them as fictional. Demo results SHALL include only fictional students matching the selected course, exclude the current user and duplicates, show name, major, year, and interests, and display an accurate count. It SHALL NOT expose another real student's private profile or enrollments through this demonstration.

#### Scenario: View matching classmates
- **WHEN** a selected course matches fictional roster entries
- **THEN** matching entries appear once with an accurate count and a visible fictional-data label

#### Scenario: Student enrolled in multiple courses
- **WHEN** a fictional classmate belongs to two loaded courses and the student selects each in turn
- **THEN** that fictional classmate appears once in each relevant demonstration roster

#### Scenario: No matching classmates
- **WHEN** the selected course has no demo classmates
- **THEN** a labeled empty state replaces previous results
