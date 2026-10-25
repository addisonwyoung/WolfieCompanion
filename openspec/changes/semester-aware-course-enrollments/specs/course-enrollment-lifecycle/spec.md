# Spec Delta

## Purpose

Define semester-aware class entry, import confirmation, and durable enrollment history. Keep current-term dashboard and discovery behavior separate from historical enrollment records used to authorize course reviews.

## ADDED Requirements

### Requirement: Resolve the current semester from calendar dates
The system SHALL maintain semester calendar entries for Fall (August 20 through December 20), Winter (January 2 through January 22), Spring (January 25 through May 20), and Summer (May 22 through August 14). The prior semester SHALL remain current during the gaps until the next semester's start date. The academic year SHALL be the calendar year in which the semester starts. New enrollment records and offerings SHALL use the semester and academic year resolved from the current date, not values supplied by OCR or the student.

#### Scenario: Resolve a term inside its date range
- **WHEN** a student saves a class during Spring 2027
- **THEN** the saved enrollment is assigned Spring and academic year 2027

#### Scenario: Keep the prior term current during a gap
- **WHEN** a student saves or views classes during December 21 through January 1
- **THEN** Fall remains the current semester until Winter begins on January 2

#### Scenario: Transition to the following semester
- **WHEN** the date reaches the next semester's start date
- **THEN** new class saves use that semester and its start calendar year

### Requirement: Require section and instructor names before saving classes
Manual class entry and schedule-import confirmation SHALL require a nonblank section, professor first name, and professor last name for every class row before saving. Import extraction SHALL remain a temporary draft; students SHALL enter instructor names during confirmation when the source schedule does not contain them. An incomplete row SHALL prevent the batch from being saved, preserve the draft, and identify the missing fields.

#### Scenario: Save manually entered classes
- **WHEN** a student enters a course, section, professor first name, and professor last name for every row
- **THEN** the complete batch can be saved to the current semester dashboard and enrollment history

#### Scenario: Confirm an imported schedule
- **WHEN** OCR returns course and section rows without professor names
- **THEN** the preview asks the student to supply both names for every row before enabling save

#### Scenario: Prevent incomplete save
- **WHEN** any class row has a missing section or professor name
- **THEN** no rows in that save batch are persisted and the student can correct the retained draft

### Requirement: Preserve semester-specific enrollment history
The system SHALL retain each student's saved course-section enrollment across semesters and academic years. An enrollment SHALL identify its student, course code and number, section, professor first and last name, semester, and academic year. Saving the same class in a later semester SHALL create a distinct historical enrollment. The system SHALL NOT delete past enrollments when the current semester changes.

#### Scenario: Retain enrollment at semester transition
- **WHEN** a new semester begins
- **THEN** the student's previous enrollment remains stored with its original semester and year

#### Scenario: Save a repeated course in a new semester
- **WHEN** a student saves CSE 416 in Fall 2026 and again in Spring 2027
- **THEN** both semester-specific enrollments remain available as distinct history

#### Scenario: Save multiple sections
- **WHEN** a student takes separate sections or components of one course
- **THEN** each distinct section and its professor are retained as a separate enrollment

### Requirement: Show only current-semester classes on the dashboard
The dashboard SHALL show enrollments for the currently resolved semester and academic year only. At the next semester's start date, the dashboard SHALL show no classes for the new semester until the student saves them. Hiding prior classes SHALL NOT delete or alter historical enrollments. Course selection and class-scoped features SHALL not use historical enrollments as current membership.

#### Scenario: Start a new semester with an empty dashboard
- **WHEN** the calendar advances to a new semester for which the student has not saved classes
- **THEN** the dashboard shows the add-classes prompt and no prior-term courses

#### Scenario: Preserve the old schedule in history
- **WHEN** the dashboard switches to a new semester
- **THEN** prior classes remain available for evaluation eligibility but are not listed as current classes

#### Scenario: Ignore historical classes for current discovery
- **WHEN** a student requests classmates or recommendations for a course saved only in a prior semester
- **THEN** the prior enrollment does not satisfy current-semester membership

### Requirement: Validate course catalog entries and queue unknown courses
The system SHALL validate each submitted course code and number against the owner-managed `course_catalog`. Students SHALL NOT be able to add or modify catalog rows directly. A class absent from the catalog SHALL still be saved to the student's dashboard and history, SHALL NOT create or appear as a course evaluation offering, and SHALL create a `verify_courses` submission containing the course code, course number, section, professor first and last name, submitting student, semester, academic year, submission time, and review status.

#### Scenario: Save a catalog course
- **WHEN** a submitted course code and number match `course_catalog`
- **THEN** the enrollment is marked as catalog-verified and may be linked to a course offering

#### Scenario: Save an unknown course for manual verification
- **WHEN** a submitted course does not match `course_catalog`
- **THEN** it remains on the student's dashboard and history, a pending `verify_courses` row is recorded, and no evaluation offering is created

#### Scenario: Keep catalog owner-managed
- **WHEN** a student attempts to insert or edit a course catalog row through the application
- **THEN** the operation is denied and the student may submit a verification request instead

### Requirement: Create one evaluation offering per exact class instance
For a catalog-verified course, the system SHALL find or create one course offering identified by course code and number, professor first name, professor last name, section, semester, and academic year. Repeated saves by other students for the same exact instance SHALL reuse that offering. Different sections, instructors, semesters, or academic years SHALL be separate offerings. Creating an offering SHALL NOT create a course review.

#### Scenario: Add a new offering from a saved class
- **WHEN** a student saves a catalog-verified class instance that has no matching offering
- **THEN** one offering is added to Course Evaluations with its course name and exact section, professor, semester, and academic year

#### Scenario: Reuse an existing offering
- **WHEN** another student saves the same course, section, professor, semester, and year
- **THEN** the existing offering is reused and is not duplicated

#### Scenario: Distinguish different class instances
- **WHEN** two saved classes differ in section, professor, semester, or academic year
- **THEN** they are represented by distinct course offerings

#### Scenario: Do not create a review on enrollment
- **WHEN** an offering is created from a saved class
- **THEN** it appears as an offering with no review until an enrolled student submits one
