# Spec Delta

## Purpose

Provide a local experiment that extracts readable text and reviewable draft classes from SOLAR class-list and weekly-calendar screenshots before enrollment integration.

## ADDED Requirements

### Requirement: Local screenshot extraction command
The system SHALL provide a developer-invoked command accepting one local PNG or JPEG screenshot and a required layout selection of `class-list` or `weekly-calendar`. It SHALL reject missing, unreadable, empty, unsupported, or larger-than-10-MiB inputs before contacting the OCR service. Successful invocations SHALL return one JSON object on standard output containing recognized text, draft classes, warnings, the chosen layout, and `requiresReview: true`.

#### Scenario: Extract a class list
- **WHEN** a developer invokes the command with a valid SOLAR class-list screenshot and `class-list` layout
- **THEN** the command returns recognized text and draft classes using the class-list interpretation

#### Scenario: Extract a weekly calendar
- **WHEN** a developer invokes the command with a valid weekly-calendar screenshot and `weekly-calendar` layout
- **THEN** the command returns recognized text and draft classes using the calendar interpretation

#### Scenario: Reject invalid invocation
- **WHEN** a file is invalid or the layout selection is missing or unsupported
- **THEN** the command exits nonzero, reports an actionable error on standard error, produces no success JSON, and does not contact the OCR service

### Requirement: Server-side OCR credentials and failure handling
The experiment SHALL use locally configured cloud credentials for its OCR calls, without placing credentials in frontend code or requiring a committed credential file. It SHALL make one document-OCR request per valid invocation with a bounded 30-second provider deadline and no automatic retries. Credential failures, provider errors, and timeouts SHALL produce nonzero exit status and actionable standard-error messages without printing credentials or producing successful empty results.

#### Scenario: Missing credentials
- **WHEN** valid input is supplied but cloud credentials are unavailable
- **THEN** the command reports authentication setup guidance and exits nonzero

#### Scenario: Provider rejects the request
- **WHEN** the provider reports an error in either the request failure or annotation response
- **THEN** the command reports failure and does not present an empty class list as successful extraction

#### Scenario: Provider times out
- **WHEN** the OCR service does not complete within the configured deadline
- **THEN** the command exits nonzero with retry guidance and does not automatically send another request

### Requirement: Normalize course candidates with source evidence
The system SHALL extract department-and-number course candidates from OCR text and spatially related tokens, normalizing spacing, case, and separator variants such as `cse416`, `CSE-416`, and `CSE 416` to `CSE 416`. Each candidate SHALL contain department, course number, canonical code, nullable title and term, an array of explicitly associated section/component records, source text and available source positions, and review warnings. Candidates SHALL be identified as unverified rather than catalog matches or verified enrollments. The system SHALL preserve the recognized text and SHALL NOT invent missing values or silently repair ambiguous letter/digit substitutions.

#### Scenario: Normalize course-code variants
- **WHEN** OCR recognizes `cse416`, `CSE-416`, or spatially related `CSE` and `416` tokens
- **THEN** the parser returns the canonical code `CSE 416` with evidence of the recognized occurrence

#### Scenario: Preserve missing details
- **WHEN** a course code is readable but its title, section, or semester is absent
- **THEN** the parser retains the code, leaves unavailable details empty or null, and flags missing term information for review

#### Scenario: Avoid guessing an ambiguous code
- **WHEN** OCR recognizes an ambiguous value such as `CSE 4I6`
- **THEN** the parser preserves it in recognized text and emits a review warning without silently converting it to `CSE 416`

### Requirement: Interpret both layouts without duplicate courses
The system SHALL associate class-list metadata using row/block context and calendar metadata using calendar-block context rather than globally joining adjacent text. Within one screenshot it SHALL merge repeated occurrences of the same canonical course code and explicit term into one candidate while retaining evidence and distinct section/component records. Distinct explicit terms SHALL remain separate. Conflicting or uncertain metadata associations SHALL produce review warnings instead of silently choosing a value. Calendar occurrences without section or term information SHALL remain identifiable course candidates.

#### Scenario: Repeated calendar meetings
- **WHEN** the same course appears on Monday, Wednesday, and Friday in one calendar
- **THEN** the result contains one course candidate with evidence from all recognized meetings

#### Scenario: Lecture and lab
- **WHEN** a class list shows a lecture and a lab for the same course and term
- **THEN** the result contains one course candidate retaining both explicitly associated components

#### Scenario: Neighboring calendar cells
- **WHEN** neighboring cells contain different courses and section labels
- **THEN** labels are associated only where supported by their source context and uncertain associations are flagged

#### Scenario: Different terms
- **WHEN** the same course appears with two different explicitly associated terms
- **THEN** the parser retains separate candidates rather than merging semester enrollments

### Requirement: Successful empty results are reviewable
The command SHALL distinguish successful OCR with no readable text from successful OCR with text but no recognizable course candidates. Both cases SHALL return success JSON with an empty classes array, `requiresReview: true`, and a specific warning identifying the condition. Every extraction SHALL require human review before any future enrollment use.

#### Scenario: Image contains no text
- **WHEN** OCR succeeds but recognizes no text
- **THEN** the result warns that no readable text was detected and suggests a clearer screenshot

#### Scenario: Text contains no course codes
- **WHEN** OCR succeeds with text but the parser detects no supported course codes
- **THEN** the result preserves the text and warns that no classes were identified

### Requirement: Experiment leaves application state unchanged
The experiment SHALL NOT modify enrollments, profiles, databases, or existing dashboard behavior. It SHALL NOT persist input images or OCR output automatically, expose a paid public upload endpoint, or log image contents outside the explicitly requested command output. Repository fixtures SHALL contain synthetic or anonymized data without student identifiers.

#### Scenario: Run the experiment
- **WHEN** a screenshot is processed successfully or unsuccessfully
- **THEN** application enrollments and stored crowd reports remain unchanged and no screenshot or OCR-result file is automatically written

### Requirement: Reproducible evaluation for both formats
The project SHALL provide offline checks for class-list and calendar extraction, normalization, duplicate merging, metadata ambiguity, and failure conditions without paid cloud calls. It SHALL document a live evaluation procedure comparing expected course codes and metadata to results for each layout, recording missed courses, false additions, duplicates, and required corrections. Live evaluation SHALL be opt-in and SHALL report unavailable credentials or missing representative screenshots as unverified rather than claiming extraction accuracy.

#### Scenario: Offline verification
- **WHEN** a developer runs the default server test suite
- **THEN** extraction fixtures and mocked provider failures are checked without requiring credentials or contacting Google

#### Scenario: Live evaluation
- **WHEN** a developer runs opt-in evaluation on representative screenshots with expected classes
- **THEN** the evaluation records results separately for each layout and identifies incorrect or missing fields without committing private screenshots or raw text
