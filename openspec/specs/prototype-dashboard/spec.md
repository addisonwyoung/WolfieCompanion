# prototype-dashboard Specification

## Purpose

Provide an interactive Wolfie Companion prototype where students can edit a sample profile and discover fictional classmates through their sample courses.

## Requirements

### Requirement: Branded sample application shell
The application SHALL show a Wolfie Companion dashboard at its root URL, with a sample profile, enrolled courses, and classmates area. It SHALL identify the displayed people and enrollments as demo data and use Wolfie Companion as the document title. Vite starter content SHALL no longer appear.

#### Scenario: Open the prototype
- **WHEN** a visitor opens the root page
- **THEN** they see Wolfie Companion branding, a visible demo-data label, profile, courses, and classmates instead of the starter counter and framework links
- **AND** the page works without authentication or a running backend

### Requirement: Editable sample profile
The application SHALL initially display a fictional student's name, major, interests, and year of study. It SHALL allow editing major, interests, and year of study with explicit Save and Cancel actions. Name and enrollment SHALL remain fixed. Major SHALL be nonblank after trimming, year SHALL be selected from First year, Second year, Third year, Fourth year, or Graduate, and interests SHALL accept an optional comma-separated list with surrounding whitespace and empty entries removed.

#### Scenario: Save profile changes
- **WHEN** the visitor edits the three editable fields and saves valid values
- **THEN** the profile displays the saved values and leaves editing mode
- **AND** selecting a different course does not discard those saved values

#### Scenario: Cancel profile changes
- **WHEN** the visitor edits profile fields and cancels
- **THEN** the previously saved profile remains unchanged
- **AND** reopening the editor starts with those saved values

#### Scenario: Reject blank major
- **WHEN** the visitor attempts to save a major containing only whitespace
- **THEN** an associated validation message is shown and the saved profile remains unchanged

#### Scenario: Clear optional interests
- **WHEN** the visitor saves an empty interests field with otherwise valid values
- **THEN** the profile indicates that no interests have been added

#### Scenario: Reload demo state
- **WHEN** the visitor reloads after editing the profile
- **THEN** the original sample profile is restored
- **AND** the interface explains that profile edits reset on reload

### Requirement: Fixed sample course selection
The application SHALL list exactly CSE 416, CSE 310, AMS 210, and AMS 261 as the sample student's courses, using consistently spaced course codes. CSE 416 SHALL be initially selected. Selecting a course SHALL visibly identify that selection and update the classmates heading and results.

#### Scenario: Select another course
- **WHEN** the visitor selects AMS 210
- **THEN** AMS 210 is indicated as selected and the classmates area identifies AMS 210
- **AND** all four course controls remain available

### Requirement: Course-specific sample classmates
The application SHALL display only fictional students enrolled in the selected course, excluding the current sample user and duplicates. Each classmate SHALL show their name, major, year, and interests. Each of the four courses SHALL have at least two sample classmates, with differing rosters so switching courses demonstrates filtering. The displayed classmate count SHALL match the visible roster.

#### Scenario: View matching classmates
- **WHEN** a visitor selects any of the four sample courses
- **THEN** the visible classmates and count match that course's sample enrollments
- **AND** classmates enrolled only in other courses are excluded

#### Scenario: Student enrolled in multiple courses
- **WHEN** a classmate belongs to two sample courses and the visitor selects each in turn
- **THEN** that classmate appears once in each relevant course's results

#### Scenario: No matching classmates
- **WHEN** the selected course has no other enrolled students in the supplied data
- **THEN** the area shows a zero count and a clear empty-state message rather than stale results

### Requirement: Responsive and keyboard-usable interactions
The application SHALL keep profile editing, course selection, and classmates usable at narrow mobile and desktop viewport widths without page-level horizontal overflow. Form controls SHALL have visible labels, keyboard focus SHALL be visible, and course selection SHALL be exposed programmatically as well as visually.

#### Scenario: Use the dashboard on a narrow screen
- **WHEN** the visitor views the dashboard at a 375-pixel viewport width
- **THEN** all sections and controls remain readable and operable without horizontal page scrolling

#### Scenario: Use only the keyboard
- **WHEN** the visitor tabs through the dashboard and activates controls with the keyboard
- **THEN** they can edit, save or cancel their profile and select each course with visible focus
