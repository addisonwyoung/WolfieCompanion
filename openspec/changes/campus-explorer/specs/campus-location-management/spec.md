# Spec Delta

## Purpose

Maintain a persistent, manually verified campus resource catalog with database-enforced editor permissions while allowing eligible students to read only published locations.

## ADDED Requirements

### Requirement: Persistent independent resource records
The system SHALL persist each resource as an independent record with ID, coordinates, name, one of the five supported categories, optional building/floor, required directions, optional nullable description, optional access note, source/verification details, draft/published state, authoritative creation/update timestamps and a revision. Database and editor validation SHALL accept an absent description, normalize blank editor descriptions to null, and limit supplied descriptions to 2000 characters. Publication SHALL require provenance and a verification timestamp but SHALL NOT require a description. Records SHALL survive reload and be shared across authorized clients. Database constraints SHALL reject invalid categories, blank required text, oversized fields and non-finite/out-of-range coordinates. Multiple records SHALL be permitted per building, category or coordinate. Valid residential and off-academic-campus coordinates SHALL be accepted. Hours, schedules and real-time availability SHALL NOT be stored as resource fields.

#### Scenario: Persist multiple resources
- **WHEN** an editor publishes a printer and a water station in the same building and later reloads
- **THEN** both records retain their distinct IDs/details and are available to other eligible students

#### Scenario: Validate location input
- **WHEN** a direct request submits an unsupported category, blank required name/directions, excessive text or invalid coordinate
- **THEN** the database rejects the write without partial persistence
- **WHEN** the request instead contains complete valid details and residential coordinates
- **THEN** the database does not reject it because it lies outside the academic campus

#### Scenario: Publication requires verification
- **WHEN** an editor tries to publish without a source URL or source note, or without a verification timestamp
- **THEN** the database rejects publication while a valid unpublished draft can still be maintained

#### Scenario: Description is optional
- **WHEN** an editor saves otherwise valid details with an absent or blank description
- **THEN** the editor accepts the input and persists a null description, including on publication when provenance and verification requirements are met
- **AND** a direct database write with a null description is accepted, while missing directions or a description exceeding 2000 characters is rejected

### Requirement: Database-enforced editor permission
The database SHALL authorize location inserts, updates and deletes only for an eligible authenticated user on a private trusted-owner-managed editor allowlist. Eligible regular students SHALL read published records only; eligible editors SHALL also read drafts. Signed-out/ineligible users SHALL have no location access. Students and editors SHALL NOT grant themselves or others editor membership through application credentials. Capability checks SHALL identify only the caller and fail closed. Subsequent writes after membership revocation SHALL be denied independently of stale frontend visibility or JWT capability hints.

#### Scenario: Direct unauthorized write
- **WHEN** a regular student bypasses UI controls and directly requests an insert, update, delete or publication change
- **THEN** database authorization denies the operation and published data remains unchanged

#### Scenario: Draft privacy
- **WHEN** a regular eligible student queries locations directly
- **THEN** published records are readable and drafts are not returned
- **WHEN** an eligible editor queries them
- **THEN** both publication states are readable

#### Scenario: Self-promotion and revocation
- **WHEN** an authenticated user attempts to alter the allowlist or supply another user ID to a capability check
- **THEN** they cannot gain editor powers
- **WHEN** the trusted owner revokes an editor and that user's old editor screen submits another write
- **THEN** the database denies the subsequent write

#### Scenario: No eligible session
- **WHEN** a signed-out or ineligible caller queries or mutates location data
- **THEN** location access is denied regardless of known record IDs

### Requirement: Automatic coordinate capture with accessible placement
Authorized editors SHALL explicitly enter placement mode before a map-background click/tap captures coordinates into an unsaved draft and temporary marker. They SHALL be able to enter details, create a draft or publish a complete verified record, edit/reposition an existing record, or cancel. Keyboard users SHALL have an equivalent map-center capture action without manually typing coordinates. Marker/control activation SHALL NOT create a placement. Temporary placement SHALL NOT persist until successful save.

#### Scenario: Capture and save a point
- **WHEN** an editor enters Add location mode and clicks a map-background point
- **THEN** its geographic coordinates populate the draft automatically and a temporary marker previews the point
- **WHEN** the editor submits valid details successfully
- **THEN** the returned persistent record replaces the temporary placement

#### Scenario: Keyboard placement and cancellation
- **WHEN** an editor pans with keyboard controls and activates Use map center
- **THEN** the center coordinates populate the temporary placement without coordinate entry
- **WHEN** the editor cancels
- **THEN** no database record is created and the temporary marker disappears

#### Scenario: Edit and reposition
- **WHEN** an editor opens an existing resource, changes details and captures a new position in reposition mode
- **THEN** successful save updates the same resource ID and authoritative revision/timestamp
- **AND** clicking existing markers or map controls does not accidentally create another location

### Requirement: Safe mutation and removal behavior
The editor SHALL require confirmation before permanent removal, disable duplicate submission while a write is pending, show success only after an affected record is confirmed, and retain unsaved details/coordinates on recoverable failure. Conflicting edits/removals SHALL NOT silently overwrite newer data. Sign-out/account changes SHALL clear drafts; capability loss SHALL prevent further writes and explain the failure without claiming success. Ordinary edits SHALL NOT falsely advance resource verification.

#### Scenario: Failed or conflicting save
- **WHEN** saving fails, authorization has been revoked, or another editor changed the record since it was loaded
- **THEN** the draft and coordinates are retained for review, no false success is shown, and conflict/permission failures offer an appropriate reload or recovery path

#### Scenario: Confirm or cancel removal
- **WHEN** an editor cancels removal confirmation
- **THEN** the record remains unchanged
- **WHEN** the editor confirms and the database returns the deleted record ID
- **THEN** the resource disappears from editor and subsequently refreshed student results

#### Scenario: Preserve verification meaning
- **WHEN** an editor corrects a description without explicitly verifying the resource again
- **THEN** updated_at/revision advance but the previous verification timestamp remains unchanged

### Requirement: Manually verified provenance
Initial published resources SHALL be manually verified, focusing on academic-campus locations without restricting future coverage. University printer and water maps SHALL be treated as reference leads, not presumed importable datasets. Source information SHALL distinguish provenance from live availability. Unavailable archived references SHALL require an alternative trustworthy source or on-site verification before publication. No automatic scraping/importing or crowd-report linkage SHALL be introduced.

#### Scenario: Curate a reference location
- **WHEN** a curator uses a university printer or water reference
- **THEN** resource existence, position and indoor directions are checked and source/verification details recorded before publication
- **AND** lab presence alone is not treated as proof of a printer or automatic dataset reuse permission

#### Scenario: Archived source unavailable
- **WHEN** the archived water reference cannot be accessed or its details cannot be confirmed
- **THEN** the resource is not published as verified until an alternative trustworthy source or on-site check confirms it
