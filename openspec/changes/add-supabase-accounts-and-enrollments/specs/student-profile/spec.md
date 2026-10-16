# Spec Delta

## Purpose

Let students maintain personal and academic information and a profile picture that remain available across authenticated sessions and devices.

## ADDED Requirements

### Requirement: Persistent editable profile
Students SHALL be able to view and edit their name, major, year of study, interests, and residence status with explicit Save and Cancel actions. Name SHALL be nonblank after trimming and at most 100 characters. Major SHALL be optional and at most 120 characters. Year SHALL be unset or First year, Second year, Third year, Fourth year, or Graduate. Residence status SHALL be unset, commuter, or dormer. Interests SHALL be optional, trimmed, deduplicated case-insensitively, and limited to 20 entries of at most 50 characters each. The system SHALL save accepted values to the student's Supabase profile and load them on subsequent sessions. Academic fields SHALL remain optional so students can customize later. Editable profile data SHALL NOT alter authentication identity or eligibility.

#### Scenario: First profile
- **WHEN** an eligible student signs in for the first time
- **THEN** a profile is initialized with the available Google display name or an editable student placeholder, and optional fields remain unset

#### Scenario: Save and restore
- **WHEN** a student saves valid edits and signs in on another device
- **THEN** the saved values are automatically displayed

#### Scenario: Cancel or reject edits
- **WHEN** a student cancels edits or submits invalid values
- **THEN** saved data remains unchanged and invalid fields have associated messages

#### Scenario: Save failure
- **WHEN** a profile write fails
- **THEN** the editor preserves the draft, reports failure, and offers retry without claiming success

### Requirement: Private profile picture management
Students SHALL be able to upload, replace, and remove their picture. Pictures SHALL be stored in private Supabase Storage and referenced by the profile. The system SHALL accept only decodable JPEG/PNG images up to 5 MiB, validate access and file restrictions beyond browser controls, and use initials when no picture is saved or available. A failed upload or profile update SHALL preserve the previous saved picture and provide retry. An uploaded object SHALL NOT be shown as saved before its profile reference is committed.

#### Scenario: Picture survives login
- **WHEN** a student successfully saves a picture and later signs in
- **THEN** the saved picture is loaded through authorized access

#### Scenario: Replace or remove picture
- **WHEN** a student saves a replacement or removes a picture
- **THEN** the profile displays the replacement or initials, and obsolete owned objects are removed or queued for cleanup

#### Scenario: Invalid picture
- **WHEN** a student submits an oversized, unsupported, or undecodable image
- **THEN** the system rejects it with an actionable message and preserves the saved picture
