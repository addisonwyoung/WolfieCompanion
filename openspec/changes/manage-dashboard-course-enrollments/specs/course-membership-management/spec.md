# Spec Delta

## Purpose

Let students correct or remove their own current-semester dashboard course memberships while ensuring stale memberships no longer grant access to course-based discovery.

## ADDED Requirements

### Requirement: Owner-managed current-semester course memberships
The system SHALL let an eligible authenticated student edit or remove each of their own current-semester course entries. Editing SHALL start with the saved course, section, and professor values and SHALL validate and persist the corrected values as one operation. Removing SHALL require explicit confirmation. Only the selected owner's current-semester membership may be changed; past-term records and other students' memberships SHALL remain unchanged.

#### Scenario: Edit a mistyped course entry
- **WHEN** a student saves valid corrections to a course entry on the dashboard
- **THEN** the saved entry and dashboard display reflect the corrected values, and the old course membership no longer grants course-scoped access

#### Scenario: Reject invalid or duplicate edit
- **WHEN** a student submits invalid details or details that conflict with another course entry in the same semester
- **THEN** the change is rejected, the saved course remains unchanged, and the student receives an actionable error

#### Scenario: Cancel course removal
- **WHEN** a student cancels the removal confirmation
- **THEN** no membership change is made and the course remains on the dashboard

#### Scenario: Confirm course removal
- **WHEN** a student confirms removal of a current-semester course
- **THEN** that membership is removed from the dashboard and no longer authorizes access to that course

#### Scenario: Preserve other users and past terms
- **WHEN** a student edits or removes one current-semester course entry
- **THEN** no other student's enrollment or the student's enrollment in a different semester is changed

#### Scenario: Failed mutation
- **WHEN** an edit or confirmed removal fails to save
- **THEN** the saved entry remains unchanged, the dashboard keeps the course available for retry, and no success is announced

### Requirement: Revoke access derived from an old course membership
After a successful edit or removal, the old membership SHALL no longer authorize classmates, recommendations, classmate profile lookup, or other course-scoped actions. The interface SHALL clear old course results and ignore pending responses for the old selection. Editing SHALL retain personal assignments and exams. Removing the last active current-term membership for a planner course SHALL delete its assignments, exams, reminders, and the owner's review for the exact offering after confirmation. Other owners' reviews and the student's reviews for other offerings SHALL remain. Existing friendships and direct messages SHALL remain.

#### Scenario: Old course lookup after edit or removal
- **WHEN** the student or another caller attempts a course-scoped lookup that depends on the changed or removed membership
- **THEN** authorization fails unless an independent current membership grants access

#### Scenario: Clear old selection and pending results
- **WHEN** a selected course is edited or removed while classmate or recommendation data is visible or loading
- **THEN** old course data disappears immediately and a late response cannot restore it

#### Scenario: Keep unrelated social and review records
- **WHEN** a course membership is edited or removed
- **THEN** existing friendships, direct messages, reviews by other owners, and the student's reviews for other offerings remain available and unchanged

#### Scenario: Remove course work, reminders, and matching review
- **WHEN** a student confirms removal of the last active current-term membership for a planner course
- **THEN** linked assignments, exams, reminder notifications, and the student's review for the exact course offering are deleted, and the course is no longer offered in assignment tasks
