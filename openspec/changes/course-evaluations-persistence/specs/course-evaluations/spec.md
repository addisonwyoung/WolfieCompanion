# Spec Delta

## MODIFIED Requirements

### Requirement: View offering-specific evaluation summaries
The application SHALL populate its offering dropdown and class metadata from the existing `evaluationData.ts` offerings. Those stable IDs SHALL match valid catalog rows in the database. When a student selects an offering, the application SHALL show only reviews joined to that offering ID. It SHALL calculate average weekly hours, average difficulty, and review count from individual review rows. Student-facing results SHALL NOT expose reviewer names, email addresses, user IDs, or other reviewer-identifying information. An offering with no reviews SHALL show an explicit empty state rather than zero averages.

#### Scenario: Distinguish same-course offerings
- **WHEN** two catalog offerings have the same course and term but different professor-specific IDs
- **THEN** each shows only its own reviews and independently calculated averages

#### Scenario: Read any published offering
- **WHEN** an eligible student reads persisted reviews
- **THEN** the results include review content and class metadata but no reviewer identity fields

#### Scenario: Offering has no evaluations
- **WHEN** a selected offering has no reviews
- **THEN** the application shows an empty state and no misleading averages

### Requirement: Submit one anonymous evaluation per offering
The application SHALL allow an authenticated eligible student to submit weekly hours (0–40), an individual difficulty rating (integer 1–5), and optional review text (up to 1,000 characters) for an existing offering ID. `course_reviews` SHALL contain exactly these columns: generated UUID `id`, `offering_id`, session-derived `user_id`, `weekly_hours`, individual `difficulty`, `review`, and generated `created_at`. Course and professor metadata SHALL live only in `course_offerings`. A foreign key SHALL reject offering IDs absent from the catalog. A unique `(user_id, offering_id)` constraint SHALL allow at most one review per student for each exact offering while allowing different offering IDs for the same course and term. The database SHALL derive identity from the authenticated session and reject client-selected identity. Successful reviews SHALL remain anonymous to students.

#### Scenario: Submit a valid review
- **WHEN** an eligible student selects a catalog offering and submits valid values
- **THEN** the database stores only the selected offering ID and review fields, generating the review ID, reviewer identity, and timestamp, and the review appears under that offering

#### Scenario: Prevent duplicate review for an offering
- **WHEN** a student submits another review for an offering they already reviewed
- **THEN** the unique constraint rejects it and the UI explains the duplicate

#### Scenario: Review another offering with the same course code
- **WHEN** a student has reviewed one course/term offering and submits for a separate offering ID taught by another professor
- **THEN** the second review is accepted and displayed separately

#### Scenario: Reject invalid review fields
- **WHEN** hours, difficulty, or review length exceeds the allowed bounds
- **THEN** the application shows field validation feedback and does not submit

## REMOVED Requirements

### Requirement: Keep prototype submissions in session state
**Reason**: Student reviews need durable storage and database-enforced ownership.
**Migration**: Existing sample evaluations may remain labeled as samples; student submissions persist in Supabase.

## ADDED Requirements

### Requirement: Persist reviews without changing existing account schema
The versioned migration SHALL add `course_offerings`, `course_reviews`, and narrowly scoped access controls/projection. It SHALL NOT drop, rename, recreate, or modify existing tables or policies, including `profiles`, `user_course_sections`, and `user_courses`. The migration SHALL be created for owner review only and SHALL NOT be executed or applied by this change.

#### Scenario: Preserve existing functionality
- **WHEN** the additive migration is reviewed
- **THEN** existing authentication, account, profile, and enrollment schema and policies remain intact

### Requirement: Enforce eligibility, ownership, and anonymity in the database
The database SHALL allow inserts only for eligible authenticated students. It SHALL derive `user_id` from the authenticated Supabase session, deny clients permission to set or read reviewer identity, and enforce uniqueness per `(user_id, offering_id)`. Review reads SHALL use an explicit projection excluding user IDs and profile fields. The projection SHALL use invoker security so the querying student's base-table grants and RLS policies apply. Anonymous and ineligible users SHALL NOT read reviews.

#### Scenario: Reject identity spoofing
- **WHEN** a client attempts to provide a reviewer user ID
- **THEN** database privileges reject the insert

#### Scenario: Deny ineligible access
- **WHEN** anonymous or ineligible users attempt review reads or submissions
- **THEN** database access controls deny the operation

### Requirement: Validate offering references and persist individual values
The review table SHALL contain exactly seven columns: generated UUID ID, offering ID, session-derived user ID, weekly hours, individual difficulty, review, and generated timestamp. An offering catalog SHALL store class code/title, professor, semester, and academic year once per stable offering ID. Review submissions SHALL reference a valid catalog row and SHALL NOT accept class metadata from the client. Average difficulty, average hours, and counts SHALL be calculated from the individual reviews.

#### Scenario: Reject invalid offering
- **WHEN** a client submits an offering ID absent from the catalog
- **THEN** the foreign key rejects the review and the draft remains available for retry

#### Scenario: Calculate summaries from reviews
- **WHEN** the application displays offering statistics
- **THEN** each average and review count is calculated from the individual rows for that offering without storing aggregate values per review

#### Scenario: Keep the feature available before migration
- **WHEN** the course-review migration has not yet been applied and Supabase review queries fail
- **THEN** the application still displays offerings from `evaluationData.ts`, existing sample evaluations, and the submission form, while showing a separate storage error and retaining any unsaved draft
