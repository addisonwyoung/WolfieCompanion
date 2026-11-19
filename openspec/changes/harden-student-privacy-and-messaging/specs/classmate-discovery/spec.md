# Spec Delta

## MODIFIED Requirements

### Requirement: Authorized course-scoped discovery
The system SHALL derive caller identity from the session and require trusted account eligibility and verified current-semester enrollment in the requested course, section and professor. Results SHALL contain other eligible public students sharing that verified offering, exclude blocked pairs in either direction and the caller, deduplicate students, and order deterministically by name and identifier. Private callers SHALL retain authorized discovery of public targets. Current and retained legacy entry points SHALL enforce equivalent restrictions or be unavailable; course-only and section-only inputs SHALL NOT bypass offering authorization.

#### Scenario: Shared course and distinct sections
- **WHEN** eligible students save equivalent courses but have different sections or professors
- **THEN** the unrelated offering does not authorize classmate discovery

#### Scenario: Unauthorized or invalid lookup
- **WHEN** an anonymous/ineligible caller requests discovery, input is invalid, or the caller lacks verified current requested offering membership
- **THEN** no classmate information is returned

#### Scenario: Ineligible peer
- **WHEN** a matching account loses eligibility or has pending/rejected enrollment
- **THEN** it is omitted

#### Scenario: Private or blocked peer
- **WHEN** an otherwise matching peer is private or either student blocks the other
- **THEN** the peer is omitted from database discovery responses including legacy calls

### Requirement: Explicit prototype visibility limitations
The interface and documentation SHALL explain public versus private discoverability, verified current offering scope, owner-controlled optional sharing and retained contextual identity in friendships, shared groups and historical contributions. They SHALL NOT claim profile opt-out is unavailable, private students cannot voluntarily collaborate, or verification proves official university registration.

#### Scenario: Understand restricted visibility
- **WHEN** a student uses discovery, onboarding or privacy settings
- **THEN** explanations distinguish general discoverability from voluntary participation and historical identity, with public-by-default new and existing accounts and accessible voluntary private mode

## ADDED Requirements

### Requirement: Distinct general search and section candidates
University-wide public-student search SHALL NOT require shared major, course, section or friendship. Course discovery SHALL NOT reveal private non-friends. Study Buddies candidates SHALL be scoped to verified current-semester course-section membership and include public classmates and private accepted friends through relationship authorization. Professor matching in classmate discovery SHALL NOT constrain university-wide search or impose a professor requirement on Study Buddies.

#### Scenario: Search across academic boundaries
- **WHEN** two public eligible students have different majors, courses and sections
- **THEN** university-wide search can find them while Study Buddies selection remains confined to the chosen section

#### Scenario: Course enrollment is not privacy consent
- **WHEN** private friend and non-friend classmates share the caller's section
- **THEN** only the friend can appear in the authorized section invitation picker and neither becomes generally searchable
