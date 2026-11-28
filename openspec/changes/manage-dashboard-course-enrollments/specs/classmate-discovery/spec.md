# Spec Delta

## MODIFIED Requirements

### Requirement: Authorized course-scoped discovery
The system SHALL provide authenticated discovery operations that derive caller identity exclusively from the session. They SHALL normalize course codes consistently with saved enrollments, require existing student eligibility and an active current-semester course membership, and reject invalid or unauthorized calls. Results SHALL contain only other eligible users with a profile and a corresponding active current-semester membership, once per user, and SHALL be ordered deterministically. Results SHALL exclude the caller on the database side. Editing or removing a membership SHALL immediately stop it from authorizing classmates, recommendations, classmate profile lookup, or other course-scoped discovery; independent active memberships and existing friendships or direct-message access SHALL remain unaffected.

#### Scenario: Shared active course
- **WHEN** eligible students A and B have active current-semester memberships in the same course, including different sections when the requested discovery scope permits it, and A requests that course
- **THEN** B appears once, A is excluded, and users with no active matching membership are excluded

#### Scenario: Unauthorized or invalid lookup
- **WHEN** an anonymous or ineligible caller requests discovery, an eligible caller requests a course they have not actively saved for the current semester, or the course identifier is invalid
- **THEN** access or input validation fails without returning classmate information

#### Scenario: Edited or removed membership
- **WHEN** a student's course membership is edited or removed and a course-scoped lookup is made using its old identity
- **THEN** the old membership does not authorize the lookup or return its course-based results

#### Scenario: Independent connections remain
- **WHEN** a course membership is edited or removed but the students already have a friendship or direct-message thread
- **THEN** the existing friendship and direct-message access remain unchanged

#### Scenario: Ineligible peer
- **WHEN** a matching membership belongs to an account that no longer meets trusted student eligibility
- **THEN** that account is omitted from discovery
