# Spec Delta

## MODIFIED Requirements

### Requirement: Preserve academic items on course removal
The database and application SHALL preserve a student's academic items when a dashboard course membership is removed. Removing a course SHALL NOT silently delete, orphan, or make the student's assignments and exams inaccessible. The personal course reference needed to view and manage those items SHALL remain available in the academic agenda, separate from active course membership and its classmate or recommendation access. Editing a course SHALL retain its associated academic items with the corrected course record. Course membership removal SHALL NOT delete academic items, friendships, or direct messages.

#### Scenario: Remove a course with linked academic items
- **WHEN** a student removes a dashboard course that has pending or completed academic items
- **THEN** the course disappears from active dashboard membership while all linked items remain available to that student in the academic agenda

#### Scenario: Correct a course with linked academic items
- **WHEN** a student edits a course entry that has linked academic items
- **THEN** the items remain associated with the corrected course record and are still available for editing and completion

#### Scenario: Keep removal private
- **WHEN** a course membership is removed while its academic items remain stored
- **THEN** other students cannot access those personal items, and the removed membership no longer grants course-based discovery access
