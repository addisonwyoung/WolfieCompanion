# Spec Delta

## Purpose

Let students upload a SOLAR class-list or weekly-calendar screenshot and inspect editable course-code and section results as temporary drafts, with explicit account-backed confirmation supplied by user-enrollments.

## ADDED Requirements

### Requirement: Accessible screenshot selection and explicit extraction
The dashboard SHALL offer Import schedule beside Your courses. It SHALL allow selecting one PNG/JPEG image up to 10 MiB and choosing SOLAR class list or weekly calendar, show a local image preview, and require an explicit Extract classes action before sending the image for OCR. It SHALL explain that processing sends the screenshot to Google and that results are a temporary preview. Invalid or undecodable image selections SHALL show a clear error without sending an OCR request.

#### Scenario: Select a valid screenshot
- **WHEN** a student selects a valid image and layout
- **THEN** the interface shows its preview and enables explicit extraction without sending the image yet

#### Scenario: Invalid image
- **WHEN** a student selects an unsupported, empty, undecodable, or oversized file
- **THEN** the interface explains the restriction and does not send an OCR request

### Requirement: Bounded development upload service
The system SHALL provide an extraction endpoint enabled only by explicit local-development configuration, disabled in production, and restricted to a loopback-bound server. It SHALL validate layout, media type, file signature, nonempty content, and the 10-MiB image limit before calling OCR. Requests SHALL require the expected preview request header and an allowed local browser origin, preventing unrelated websites from triggering paid extraction. The service SHALL process at most one extraction concurrently, use the existing bounded OCR request without automatic retries, and return structured errors without private data.

#### Scenario: Disabled service
- **WHEN** a request reaches the endpoint without development opt-in or in production
- **THEN** extraction is unavailable and the provider is not called

#### Scenario: Invalid or unrelated request
- **WHEN** a request has invalid image/layout data or lacks the expected origin/header
- **THEN** the service rejects it before calling OCR

#### Scenario: Concurrent extraction
- **WHEN** another extraction is already running
- **THEN** the service rejects the new extraction with a retryable busy response rather than starting another provider call

### Requirement: Extract course codes and actual sections
The extraction flow SHALL support course codes with attached sections such as `CSE 310-01`, returning code `CSE 310` and section `01` without losing leading zeros. It SHALL support explicit section labels associated with a course, preserve distinct sections, and merge repeated occurrences of the same course-section pair. It SHALL NOT interpret meeting times such as `Lecture\n8:00 AM` as section numbers or location tokens such as `Science Bldg 120` as courses. Unknown or conflicting sections SHALL remain blank or explicitly flagged for correction rather than guessed. The existing terminal experiment SHALL continue to return its compatible result shape with these parser corrections.

#### Scenario: Calendar sections and locations
- **WHEN** readable source text contains `CSE 310-01`, `COM 120-30`, `CSE 351-01`, `CSE 416-03`, and `AMS 315-01` alongside meeting times and `Science Bldg 120`
- **THEN** the preview contains those five code-section pairs and contains neither `BLDG 120` nor sections inferred from the meeting times

#### Scenario: Missing and conflicting sections
- **WHEN** a course has no readable section or incompatible section evidence
- **THEN** the preview flags the row for review and allows correction without guessing

#### Scenario: Repeated meetings and distinct components
- **WHEN** a calendar repeats a course-section pair or contains separate lecture and lab sections
- **THEN** repeated pairs appear once while distinct sections remain available as separate preview rows

### Requirement: Editable temporary course preview
After successful extraction, the interface SHALL show labeled editable Course code and Section fields only, with add-row and remove-row controls and an unverified-review notice. It SHALL accept missing sections for review and SHALL NOT require course titles or semester/year. It SHALL offer Clear preview or Close without saving. When account persistence is connected it SHALL offer a separate explicit Add to Your courses confirmation, await its result, retain drafts on failure, and prevent duplicate submission while saving. Edits SHALL affect only the current preview and SHALL NOT trigger further OCR calls. Missing-section and ambiguous-result messages SHALL be associated with the relevant rows.

#### Scenario: Correct detected rows
- **WHEN** a student edits a section, removes a false row, or adds a missed class
- **THEN** only the visible temporary preview changes and no additional OCR request is sent

#### Scenario: No semester or title
- **WHEN** OCR identifies a course and section without a title or semester
- **THEN** the preview shows those fields without treating missing title/semester as a blocking error

### Requirement: Reliable extraction lifecycle
The interface SHALL expose loading, successful results, no-text, no-course, disabled-service, and provider-failure states with actionable messages. It SHALL prevent duplicate submission while busy, allow explicit retry after failure, and discard responses from canceled or superseded requests. Selecting a replacement image, changing layout, or clearing/closing the preview SHALL invalidate prior draft results. No automatic retries SHALL be issued.

#### Scenario: Replace image during processing
- **WHEN** the student replaces the image or clears the preview while extraction is in progress
- **THEN** the old response cannot populate the new preview

#### Scenario: OCR fails or returns no classes
- **WHEN** the service fails or successfully returns no readable classes
- **THEN** the interface identifies the condition, shows no stale results, and allows correction of input or explicit retry

### Requirement: Preview does not persist or alter sample courses
The feature SHALL NOT write screenshots, raw OCR text, or unconfirmed drafts to application storage, browser storage, a database, or server logs. Only explicit confirmation SHALL persist reviewed normalized course/section values under user-enrollments. The response SHALL contain only preview-relevant course/section rows and warnings, without raw OCR text. Saved courses, profile enrollment, classmates, and crowd reports SHALL remain unchanged after extraction and draft edits alone. Reloading or clearing the preview SHALL discard its image and results.

#### Scenario: Preview and reload
- **WHEN** a student extracts and edits classes then reloads
- **THEN** the preview is cleared and saved account data remains unchanged unless rows were explicitly confirmed

### Requirement: Responsive and keyboard-accessible preview
File selection, layout choice, extraction, editing, adding/removing rows, and clearing SHALL work with visible keyboard focus and accessible labels. Loading and result/error messages SHALL be announced programmatically. The image and fields SHALL fit a 375-pixel viewport without page-level horizontal overflow.

#### Scenario: Mobile and keyboard use
- **WHEN** a student uses the import flow at a narrow viewport or with keyboard navigation
- **THEN** every action is operable, status changes are accessible, and the layout remains readable without horizontal page scrolling
