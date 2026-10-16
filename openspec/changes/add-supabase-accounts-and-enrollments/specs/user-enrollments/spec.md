# Spec Delta

## Purpose

Persist each student's confirmed course and section membership in Supabase and restore the student's course list automatically after login.

## ADDED Requirements

### Requirement: Save user-owned courses and sections
Students SHALL be able to explicitly save manually entered or reviewed imported course/section pairs to their own Supabase enrollment records. Course codes SHALL contain 2–4 letters and three digits and normalize to uppercase with one separating space. Sections SHALL remain strings, preserve leading zeros, trim whitespace, normalize to uppercase, and be at most 20 alphanumeric or hyphen characters; a missing section SHALL be accepted. Duplicate pairs SHALL be idempotent, distinct sections SHALL be retained, and repeating a save SHALL NOT create duplicate records. Confirming a batch SHALL either save all valid rows or leave stored enrollment unchanged. Validation failures SHALL identify rows requiring correction.

#### Scenario: Save reviewed rows
- **WHEN** a student confirms `cse310` section `01`, the same pair again, and section `02`
- **THEN** storage contains one `CSE 310` membership with each distinct section represented once

#### Scenario: Missing section or manual entry
- **WHEN** a student manually enters a valid course without a section and confirms
- **THEN** the class is saved without requiring OCR, a title, or semester information

#### Scenario: Persistence fails
- **WHEN** saving a batch fails or contains invalid rows
- **THEN** no partial batch is committed, the draft remains available, and the interface does not report successful enrollment

### Requirement: Restore personal classes automatically
After login or valid-session restoration, the application SHALL load all saved course/section records belonging to the current student without another upload. It SHALL group sections under their course and select a valid first course deterministically. A new account SHALL have no sample enrollments. Loading, empty, and failure states SHALL be distinct; failures SHALL offer retry without overwriting stored data.

#### Scenario: Return on another device
- **WHEN** a student with saved classes signs in on another device
- **THEN** all saved classes and sections automatically populate the dashboard

#### Scenario: Empty or failed loading
- **WHEN** the student has no enrollments or retrieval fails
- **THEN** the dashboard shows an add-classes empty state or retryable error respectively, without stale selection or rendering errors

### Requirement: Extraction remains a draft until confirmation
Selecting, extracting, editing, clearing, or closing a schedule preview SHALL NOT persist enrollments. Only explicit confirmation SHALL save normalized course/section rows. Screenshots and raw OCR text SHALL NOT be persisted by this feature. Clearing the preview after a successful save SHALL NOT remove saved enrollments. The development-only OCR service restrictions SHALL remain in force.

#### Scenario: Review without saving
- **WHEN** a student extracts and edits a schedule then closes or reloads before confirmation
- **THEN** no enrollment changes are stored

#### Scenario: Clear after saving
- **WHEN** the student successfully confirms reviewed rows and clears the preview
- **THEN** the saved classes remain available after reload
