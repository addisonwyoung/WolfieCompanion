# Spec Delta

## Purpose

Allow eligible authenticated students to discover limited profile summaries of other students who saved the same course, while preserving private account records.

## ADDED Requirements

### Requirement: Authorized course-scoped discovery
The system SHALL provide one authenticated discovery RPC accepting a course code and deriving caller identity exclusively from the session. It SHALL normalize course codes consistently with saved enrollments, require existing student eligibility and a saved caller membership, and reject invalid codes or unauthorized calls. Results SHALL contain only other eligible users with a profile and a saved membership in the same normalized course code, once per user, across sections. Results SHALL exclude the caller on the database side and SHALL be ordered deterministically by name and student identifier.

#### Scenario: Shared course and distinct sections
- **WHEN** eligible students A and B save equivalent normalized course codes with different or multiple sections and A requests that course
- **THEN** B appears exactly once, A is excluded, and users saving only other courses are excluded

#### Scenario: Unauthorized or invalid lookup
- **WHEN** an anonymous or ineligible caller requests discovery, an eligible caller requests a course they have not saved, or the code is invalid
- **THEN** access or input validation fails without returning any classmate information

#### Scenario: Ineligible peer
- **WHEN** a matching saved membership belongs to an account that no longer meets trusted student eligibility
- **THEN** that account is omitted from discovery

### Requirement: Limited profile projection and preserved ownership
The RPC SHALL return only a stable student identifier, name, and nullable major. The interface SHALL display only name and major as classmate profile information, using an unset-major placeholder as needed. The RPC SHALL NOT return email, year, interests, residence, avatar references, timestamps, sections, or other course memberships. Existing owner-only profile, enrollment, section, and avatar access and mutation policies SHALL remain unchanged.

#### Scenario: Limited peer information
- **WHEN** a student retrieves classmates whose profiles contain additional personal fields
- **THEN** the response contains exactly identifier, name, and major, and the cards display name and major only

#### Scenario: Direct access remains private
- **WHEN** a student shares a saved course with another user and attempts direct reads or writes of that user's profile, courses, sections, or avatar
- **THEN** existing owner-only authorization still denies access

### Requirement: Explicit prototype visibility limitations
The interface and setup documentation SHALL explain that name and major are visible to eligible students sharing a saved course, that public/private settings and opt-out controls are deferred in this MVP, and that memberships are self-reported without term or official enrollment verification. Discovery SHALL NOT be presented as a public directory or proof of official registration.

#### Scenario: Understand restricted visibility
- **WHEN** a student uses the classmate discovery area
- **THEN** visible explanatory text identifies shared-course name/major visibility and the lack of profile visibility controls, and describes saved memberships as self-reported without semester verification
