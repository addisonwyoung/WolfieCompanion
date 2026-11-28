# Spec Delta

## MODIFIED Requirements

### Requirement: Remove coursework when its last active course membership is removed
After explicit confirmation, removing a student's last active current-term membership for a planner course SHALL atomically delete that course's academic items and their reminder occurrences. If another active current-term membership still uses the same planner course, its items SHALL remain available. Planner choices SHALL include only courses with active current-term memberships. Editing a course SHALL retain its associated academic items with the corrected course record. Course removal SHALL NOT delete friendships, direct messages, or the student's reviews for other offerings.

#### Scenario: Remove the last membership with linked academic items
- **WHEN** a student confirms removal of the last active current-term membership for a planner course that has academic items
- **THEN** the membership and planner choice disappear, and all linked academic items and reminder occurrences are deleted in the same transaction

#### Scenario: Another current membership still uses the planner course
- **WHEN** a student removes one membership while another active current-term membership still references the same planner course
- **THEN** the selected membership disappears while the planner choice, academic items, and reminders remain

#### Scenario: Correct a course with linked academic items
- **WHEN** a student edits a course entry that has linked academic items
- **THEN** the items remain associated with the corrected course record and are still available for editing and completion

#### Scenario: Failed cleanup
- **WHEN** coursework or reminder cleanup fails during confirmed removal
- **THEN** the transaction rolls back and the membership, planner choice, items, and reminders remain unchanged
