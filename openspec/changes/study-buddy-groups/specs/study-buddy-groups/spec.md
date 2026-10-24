# Study buddy groups

## Purpose

Let eligible students find classmates in a shared saved course, create persistent groups, and compare members' recurring weekly availability.

## Requirements

### Requirement: Course-scoped group creation

The system SHALL let an eligible student create a group for a course they have saved and invite one to seven distinct eligible classmates who have also saved that course. A group SHALL have a name between 1 and 80 characters. An invitation SHALL NOT add a student as a member until that student accepts.

#### Scenario: Create group with classmates

- **WHEN** an eligible student creates a named group for a saved course and invites classmates found in that course
- **THEN** the creator becomes an accepted owner and each invitee receives a pending invitation

#### Scenario: Reject invalid or unrelated invitees

- **WHEN** group creation includes a duplicate, self, ineligible, or non-classmate invitee, or an invalid group name
- **THEN** creation is rejected without creating a partial group

### Requirement: Invitation consent and group membership

The system SHALL allow only the invited student to accept or decline their pending invitation. Acceptance SHALL require that the student still has the group's course saved. Pending invitees SHALL NOT read member availability. Accepted members MAY leave, and ownership SHALL transfer to another accepted member when the owner leaves; a group with no accepted members SHALL be deleted.

#### Scenario: Accept or decline invitation

- **WHEN** an invitee responds to their pending invitation
- **THEN** only that invitee's membership is accepted or removed, and other members remain unchanged

#### Scenario: Leave group

- **WHEN** an accepted member leaves
- **THEN** their membership and availability are removed, and the group remains available to its other accepted members

### Requirement: Private member availability

The system SHALL let each accepted member save up to 56 recurring weekly time windows with minute-level precision. An exact duplicate window for the same weekday SHALL NOT be added twice. A member SHALL be able to change only their own availability. Only accepted members of that group SHALL be able to read its availability. The system SHALL NOT infer availability from course codes or sections.

#### Scenario: Save and share weekly availability

- **WHEN** an accepted member saves valid availability
- **THEN** the member's previous windows are replaced and the new windows are visible to accepted members of that group

#### Scenario: Protect availability from outsiders and invitees

- **WHEN** a nonmember or pending invitee requests group availability
- **THEN** no availability data is returned

### Requirement: Calculate common meeting windows

The system SHALL calculate the intersection of saved availability across every accepted member and show only windows at least as long as the requested meeting duration. It SHALL support whole-minute durations from 1 to 1,440 minutes and clearly identify day and local time range.

#### Scenario: Find common weekly time

- **WHEN** every accepted member has saved availability and the windows overlap for at least the selected duration
- **THEN** the page shows the shared weekday and time window

#### Scenario: No common time or missing member schedule

- **WHEN** the accepted members have no sufficiently long overlap, or any member has not saved availability
- **THEN** the page explains that no result can be shown and does not suggest a time that excludes a member
