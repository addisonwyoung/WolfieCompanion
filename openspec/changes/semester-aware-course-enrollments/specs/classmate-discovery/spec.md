# Spec Delta

## MODIFIED Requirements

### Requirement: Authorized course-scoped discovery
The system SHALL provide one authenticated discovery RPC accepting a course code and deriving caller identity exclusively from the session. It SHALL normalize course codes consistently with saved enrollments, require existing student eligibility and a caller enrollment in the currently active semester, and reject invalid codes or unauthorized calls. Results SHALL contain only other eligible users with a profile and an enrollment in the same normalized course code for the currently active semester, once per user, across sections. Results SHALL exclude the caller on the database side and SHALL be ordered deterministically by name and student identifier. Historical enrollments SHALL NOT satisfy current-semester discovery membership.

#### Scenario: Shared course and distinct sections
- **WHEN** eligible students A and B save equivalent normalized course codes in the active semester with different or multiple sections and A requests that course
- **THEN** B appears exactly once, A is excluded, and users enrolled only in other courses or prior semesters are excluded

#### Scenario: Unauthorized or invalid lookup
- **WHEN** an anonymous or ineligible caller requests discovery, an eligible caller requests a course they have not saved for the current semester, or the code is invalid
- **THEN** access or input validation fails without returning any classmate information

#### Scenario: Ineligible peer
- **WHEN** a matching enrollment belongs to an account that no longer meets trusted student eligibility
- **THEN** that account is omitted from discovery
