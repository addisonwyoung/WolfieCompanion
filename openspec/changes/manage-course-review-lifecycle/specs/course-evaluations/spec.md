# Spec Delta

## MODIFIED Requirements

### Requirement: Submit one anonymous evaluation per offering
The application SHALL allow an authenticated eligible student with a verified enrollment in an exact published course offering to submit weekly hours from 0 through 40, an integer difficulty rating from 1 through 5, an integer class rating from 1 through 5, a yes-or-no recommendation, and optional written review text up to 1,000 characters. The system SHALL allow at most one active review per student and offering. A valid submission SHALL be stored persistently, remain anonymous in student-facing results, and update that offering's review list and summaries. Deleting the active review SHALL permit the student to submit a replacement for the same offering, subject to the same eligibility and validation rules.

#### Scenario: Submit a valid review
- **WHEN** an eligible student with a verified enrollment submits valid review fields for a published offering
- **THEN** the review is saved for that offering, appears without reviewer identity, and contributes to its displayed results

#### Scenario: Prevent duplicate review for an offering
- **WHEN** a student with an active review attempts to submit another review for the same offering
- **THEN** the submission is rejected and the existing review remains available to its author for editing or deletion

#### Scenario: Review another offering with the same course code
- **WHEN** a student has reviewed one offering and submits a review for a different offering ID, including another term, section, or professor for the same course
- **THEN** the new review is accepted if the student satisfies that offering's eligibility requirements

#### Scenario: Submit again after deletion
- **WHEN** a student deletes their review for an offering and then submits a valid replacement
- **THEN** the replacement is accepted and becomes the student's one active review for that offering

#### Scenario: Reject invalid review fields
- **WHEN** hours, either rating, recommendation, or review length is outside the permitted values
- **THEN** the application gives validation feedback and does not publish the review

### Requirement: View offering-specific evaluation summaries
When an eligible authenticated student selects a published offering, the application SHALL show only anonymous reviews belonging to that exact offering. It SHALL calculate average weekly hours, average difficulty, average class rating, recommendation results, and the main review count from the current appropriate reviews for that offering; flagged reviews SHALL remain separate and SHALL NOT affect those summaries. After a successful edit or deletion, the application SHALL refresh the review list and recalculate every displayed result from the current persisted review rows. An offering with no appropriate reviews SHALL show no stale or zero-valued averages, and SHALL continue to present any flagged reviews separately.

#### Scenario: Distinguish same-course offerings
- **WHEN** a student switches between two offerings with the same course code but different professor, section, or term
- **THEN** each offering shows only its own reviews and independently calculated summaries

#### Scenario: Read any published offering
- **WHEN** an eligible authenticated student selects a published offering
- **THEN** its anonymous reviews and offering-specific summaries are readable without requiring enrollment in that offering or a prior submission for that offering

#### Scenario: Offering has no evaluations
- **WHEN** a selected offering has no appropriate or flagged reviews
- **THEN** the application shows an explicit no-evaluations state and no averages

#### Scenario: Refresh results after editing a review
- **WHEN** a student successfully edits their review's ratings, recommendation, or text
- **THEN** the offering's review list and all applicable summaries reflect the saved values

#### Scenario: Refresh results after deleting a review
- **WHEN** a student successfully deletes a review that contributes to the offering's results
- **THEN** the review is removed and all applicable averages, recommendation results, and counts reflect the remaining current reviews

#### Scenario: Reclassify an edited review
- **WHEN** moderation changes an edited review from appropriate to flagged or flagged to appropriate
- **THEN** the review moves to the matching display section and only appropriate reviews contribute to main summaries and counts

#### Scenario: Remove the last appropriate review
- **WHEN** a student deletes the last appropriate review for an offering
- **THEN** its averages are no longer displayed, the main review count becomes zero, and any remaining flagged reviews stay separate

## ADDED Requirements

### Requirement: Authors can manage their own past evaluation submissions
The application SHALL let an authenticated author view, edit, or delete their own review for any offering they previously reviewed, including past terms and offerings for which they are no longer currently enrolled. It SHALL allow changes only to the review fields; the author SHALL NOT be able to transfer the review to another offering or change its owner. The system SHALL enforce ownership for every owner-only read and mutation, SHALL keep reviewer identity out of public review results, and SHALL re-moderate edited text under the existing review moderation rules. A failed edit or deletion SHALL leave the persisted review unchanged and preserve retryable user input. A successful deletion SHALL require explicit confirmation before the review is permanently removed.

#### Scenario: Find a review from a past offering
- **WHEN** an author opens their review history
- **THEN** their reviews for past and current offerings are available even if the offering is not a current enrollment

#### Scenario: Edit an owned review
- **WHEN** an author changes valid fields on their own review and saves
- **THEN** the same review is updated, its offering and ownership remain unchanged, and edited text follows the existing moderation behavior

#### Scenario: Delete an owned review
- **WHEN** an author confirms deletion of their own review
- **THEN** the review is removed from persisted results and no longer blocks a replacement submission

#### Scenario: Reject management of another student's review
- **WHEN** a student attempts to read or mutate a review they do not own
- **THEN** the operation is denied and no review data or mutation is returned

#### Scenario: Preserve saved review when an edit fails
- **WHEN** validation, moderation, or persistence prevents an edit from saving
- **THEN** the existing saved review remains unchanged and the author's edit draft remains available for retry

#### Scenario: Preserve saved review when deletion fails
- **WHEN** deletion cannot be completed
- **THEN** the saved review remains visible and the application reports that deletion failed
