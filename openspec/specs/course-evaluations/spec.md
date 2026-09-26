# course-evaluations Specification

## Purpose
Provide a sample-data course evaluation experience that lets students compare published evaluations for specific course offerings and publish one anonymous review per offering during a session.

## Requirements

### Requirement: Search and browse published course offerings
The application SHALL provide five published sample course offerings using CSE 416, BIO 201, and MAT 210. Each offering SHALL identify its course code, professor, semester, and four-digit year, and at least two offerings SHALL share the CSE 416 course code while differing in semester and professor. Students SHALL be able to search offerings by course code or title using case-insensitive partial matching, and an empty search SHALL show all offerings.

#### Scenario: Search by course code
- **WHEN** a student enters a case-insensitive partial course code
- **THEN** the application shows matching published offerings with their course, professor, semester, and year

#### Scenario: View all offerings
- **WHEN** the search field is empty
- **THEN** the application shows all five published offerings

#### Scenario: No matching offerings
- **WHEN** a search has no matching course offerings
- **THEN** the application shows a clear empty state and does not show stale results

### Requirement: View offering-specific evaluation summaries
When a student selects an offering, the application SHALL show only anonymous evaluations belonging to that exact course, professor, semester, and year combination. It SHALL show average weekly hours, average difficulty, and each written review. Students SHALL be able to read evaluations for any published offering without authentication or enrollment verification. An offering with no evaluations SHALL show an explicit no-evaluations state rather than zero-valued averages.

#### Scenario: Distinguish same-course offerings
- **WHEN** a student switches between the two CSE 416 offerings
- **THEN** each offering shows only its own evaluations and independently calculated averages

#### Scenario: Read any published offering
- **WHEN** a student selects any published offering
- **THEN** its anonymous evaluations are readable regardless of whether the student submitted a review for that offering

#### Scenario: Offering has no evaluations
- **WHEN** the selected offering has no evaluations
- **THEN** the application shows a no-evaluations message and does not present misleading averages

### Requirement: Submit one anonymous evaluation per offering
The application SHALL provide a form that submits an evaluation for one of the existing sample offerings and collects weekly hours, a difficulty rating, and a written review. Hours SHALL accept values from 0 through 40 per week, difficulty SHALL be an integer from 1 through 5, and written reviews SHALL be limited to 1,000 characters. A student SHALL be allowed to publish at most one review for each exact course offering, while remaining free to review other offerings. A valid submission SHALL be published immediately, remain anonymous, and update that offering's evaluation list and averages in the current session.

#### Scenario: Submit a valid review
- **WHEN** a student selects an existing offering, enters valid hours and difficulty, and submits a review
- **THEN** the review is immediately visible under that offering, contributes to its averages, and contains no student identity

#### Scenario: Prevent duplicate review for an offering
- **WHEN** a student has already submitted a review for an offering and attempts to submit another for that same offering
- **THEN** the application rejects the submission and explains that only one review is allowed for that offering

#### Scenario: Review another offering with the same course code
- **WHEN** a student has reviewed one CSE 416 offering and submits a review for the other CSE 416 offering
- **THEN** the second submission is accepted because the offerings are distinct

#### Scenario: Reject invalid review fields
- **WHEN** hours, difficulty, or review length is outside the permitted range
- **THEN** the application shows field-level validation feedback and does not publish the review

### Requirement: Keep prototype submissions in session state
Evaluation data SHALL be held in React state for the current session only. The application SHALL NOT require authentication, enrollment verification, backend APIs, database persistence, or browser storage for this capability. Reloading the page SHALL restore the original sample evaluations and remove reviews submitted during the prior session.

#### Scenario: Reload resets submissions
- **WHEN** a student reloads after publishing a review
- **THEN** the original sample evaluation data is restored and the submitted review is no longer present
