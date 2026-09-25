# Spec Delta

## Purpose

Help students find campus study space by viewing and contributing shared, timestamped crowd reports for specific locations.

## ADDED Requirements

### Requirement: Browse study locations
The application SHALL provide a crowd-meter entry point alongside the existing dashboard and list North Reading Room, Central Reading Room, Second Floor Core, Main Stacks, Galleria, and Music Library. Each location SHALL show its latest reported level and update age, or No reports yet. Selecting a location SHALL open its details with a way back to the list. Existing sample dashboard behavior SHALL remain usable without the backend.

#### Scenario: Browse and select
- **WHEN** a user opens the crowd meter and selects Galleria
- **THEN** the list contains all six locations and the detail view identifies Galleria with its latest report and history

#### Scenario: First use
- **WHEN** a location has no reports
- **THEN** it displays No reports yet with no invented crowd level or timestamp

### Requirement: Submit a crowd report
Users SHALL be able to submit Empty, Low, Moderate, Busy, or Full with an optional note of at most 200 characters after trimming. Each accepted report SHALL receive a unique identifier and a server-assigned submission timestamp. Submitting again SHALL append a new report and update the location rather than overwrite historical reports. Invalid levels, non-string notes, oversized notes, and unknown locations SHALL be rejected without saving. Notes SHALL render as text.

#### Scenario: Submit and update
- **WHEN** a user submits Low with the note "many seats available" and later submits Busy
- **THEN** Busy becomes the latest level and both timestamped reports remain in history

#### Scenario: Optional or invalid note
- **WHEN** a user submits a supported level with no note or whitespace only
- **THEN** the report is accepted with no displayed note
- **WHEN** a user submits an unsupported level, a non-string note, a note longer than 200 trimmed characters, or an unknown location
- **THEN** a clear error is returned and no report is added

### Requirement: Current summary and recent history
The latest accepted report SHALL determine the displayed level and last update; acceptance order SHALL resolve timestamp ties. Details SHALL show up to the ten latest reports newest first, including level, note when present, and submission time. Relative ages SHALL refresh at least every minute while visible and exact timestamps SHALL be available. The UI SHALL label values as student-reported rather than measured live occupancy.

#### Scenario: History and aging
- **WHEN** eleven reports exist for a location
- **THEN** its details show the newest ten and the current level matches the newest report
- **AND** elapsed-time labels advance without a page reload and exact submission times can be inspected

### Requirement: Shared durable updates
Successfully saved reports SHALL be shared among clients connected to the same backend and survive browser refresh and server restart with the same storage. The submitting view SHALL update after successful submission. Other active views SHALL request updated data at intervals no greater than 15 seconds while connected and refresh on returning to the foreground.

#### Scenario: Two users
- **WHEN** user A submits a report while user B has that location open against the same backend
- **THEN** A sees the accepted report immediately after success and B sees it on the next successful refresh

#### Scenario: Restart
- **WHEN** the server restarts using the same report storage
- **THEN** previously successful reports and their original timestamps remain available

### Requirement: Reliable accessible interaction
The UI SHALL provide loading, empty, submitting, and error states with retry options. Failed submissions SHALL preserve the draft and SHALL NOT display a false success. Duplicate activation SHALL be disabled while submitting. Failed refreshes SHALL flag displayed data as potentially out of date. Location changes SHALL not display another location's late responses. Controls SHALL be labeled and keyboard operable, crowd levels SHALL use text as well as color, and the flow SHALL fit a 375-pixel viewport without horizontal page scrolling.

#### Scenario: Backend unavailable
- **WHEN** a fetch or submission fails
- **THEN** the user sees an error and retry option, any draft remains available, and the existing profile/course dashboard remains usable

#### Scenario: Navigate during a request
- **WHEN** the user changes locations before a previous request resolves
- **THEN** the selected location never displays the previous location's report data

#### Scenario: Mobile and keyboard
- **WHEN** a user completes the flow at 375 pixels wide or using only the keyboard
- **THEN** location selection and report submission remain usable with visible focus and readable level labels
