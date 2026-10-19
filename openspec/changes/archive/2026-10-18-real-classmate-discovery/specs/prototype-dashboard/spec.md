# Spec Delta

## MODIFIED Requirements

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
