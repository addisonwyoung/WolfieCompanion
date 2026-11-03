# Spec Delta

## MODIFIED Requirements

### Requirement: Search and browse published course offerings
The application SHALL list course offerings created for catalog-verified course instances, including the course code and name, professor first and last name, section, semester, and academic year. It SHALL NOT require a fixed set of sample offerings. Anyone SHALL be able to search offerings by course code or title using case-insensitive partial matching, and an empty search SHALL show all published offerings. A class absent from the owner-managed course catalog SHALL NOT appear as an offering.

#### Scenario: Search by course code
- **WHEN** a visitor enters a case-insensitive partial course code
- **THEN** the application shows matching verified offerings with their course, professor, section, semester, and year

#### Scenario: View all offerings
- **WHEN** the search field is empty
- **THEN** the application shows all published catalog-verified offerings

#### Scenario: No matching offerings
- **WHEN** a search has no matching offerings
- **THEN** the application shows a clear empty state and does not show stale results

#### Scenario: Unknown course is not offered for evaluation
- **WHEN** a student saves a course that is not in `course_catalog`
- **THEN** it is sent for manual verification and is not shown as a course evaluation offering

### Requirement: View offering-specific evaluation summaries
When a visitor selects an offering, the application SHALL show only anonymous evaluations belonging to that exact course code and number, professor first and last name, section, semester, and academic year. It SHALL show average weekly hours, average difficulty, review count, and each written review. Anyone, including an unauthenticated visitor, SHALL be able to read published reviews without enrollment verification. Reviewer identity SHALL never appear in the public results. An offering with no reviews SHALL show an explicit no-evaluations state rather than zero-valued averages.

#### Scenario: Distinguish same-course offerings
- **WHEN** a visitor switches between offerings that differ by section, professor, semester, or year
- **THEN** each offering shows only its own evaluations and independently calculated averages

#### Scenario: Read any published offering
- **WHEN** an unauthenticated visitor selects any published offering
- **THEN** its anonymous evaluations and aggregate values are readable

#### Scenario: Hide reviewer identity
- **WHEN** any visitor reads an evaluation
- **THEN** the result contains no reviewer name, email, user ID, or other identifying profile data

#### Scenario: Offering has no evaluations
- **WHEN** the selected offering has no reviews
- **THEN** the application shows a no-evaluations message and no misleading averages

### Requirement: Submit one anonymous evaluation per offering
The application SHALL allow an authenticated eligible student to submit an evaluation only when that student's persistent enrollment history contains a catalog-verified enrollment matching the exact offering by course, professor, section, semester, and academic year. The form SHALL collect weekly hours from 0 through 40, a difficulty rating from 1 through 5, and optional written review text up to 1,000 characters. A student SHALL be allowed at most one review per exact offering while remaining free to review other offerings for which they have a matching enrollment. A valid submission SHALL persist, remain anonymous to all readers, and update that offering's review list and averages. Enrollment in an unknown or unverified course SHALL NOT grant review access.

#### Scenario: Submit a valid review
- **WHEN** an eligible student submits valid review fields for an offering matching a saved enrollment from any semester
- **THEN** the review is persisted under that offering and is visible without the student's identity

#### Scenario: Reject a student without a matching enrollment
- **WHEN** an eligible student attempts to review an offering without a matching saved enrollment
- **THEN** the submission is denied and no review is stored

#### Scenario: Prevent duplicate review for an offering
- **WHEN** a student attempts another review for an offering they already reviewed
- **THEN** the application rejects it and explains that only one review is allowed for that offering

#### Scenario: Review another offering with the same course code
- **WHEN** a student has reviewed one offering and has a matching enrollment for another offering
- **THEN** the second submission is accepted as a distinct review

#### Scenario: Reject invalid review fields
- **WHEN** hours, difficulty, or review length is outside the permitted range
- **THEN** the application shows field-level validation feedback and does not publish the review

## REMOVED Requirements

### Requirement: Keep prototype submissions in session state
**Reason**: Course reviews and enrollment eligibility are persistent across sessions and semesters.
**Migration**: Preserve existing review rows and offering IDs; keep new submissions in the persistent review store and derive eligibility from historical enrollments.
