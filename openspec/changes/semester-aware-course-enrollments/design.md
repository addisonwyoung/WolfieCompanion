# Design

## Context

See proposal.md for motivation. Current `user_courses` has a unique `(user_id, course_code)` key and `user_course_sections` stores sections separately; neither records instructor or term. `course_offerings` already identifies offerings by a text ID and stores course, professor, semester, and year, but has no section. `course_reviews` references offering IDs, enforces one review per student/offering, and its current insert rule does not verify enrollment. The `course_catalog` migration is present in the repository for owner application, but the save flow does not yet use it. Manual entry and OCR confirmation currently save only course code and section.

The dashboard, classmate discovery, recommendations, and course-scoped access checks query the same course membership data. Converting that data to historical records requires each current-course consumer to use only the active semester. The schedule OCR experiment remains a temporary course/section extractor; professor names are not present in its screenshot input.

## Goals / Non-Goals

**Goals:**

- Make the database the authoritative resolver for semester and academic year.
- Preserve every semester-specific student enrollment while showing only the active semester on the dashboard.
- Retain existing course review and offering identities while adding exact section and instructor matching for new offerings.
- Keep the course catalog owner-managed and record unknown submissions for manual review.
- Enforce review eligibility and anonymity in the database, including public reading without sign-in.
- Produce follow-up SQL migration files only; the owner applies them manually.

**Non-Goals:**

- Extracting professor names from schedule images or changing the OCR provider/parser.
- Automatically importing the entire Stony Brook course catalog.
- Building an in-app administrator review console for `verify_courses`.
- Deleting past enrollment or review data when a semester changes.

## Decisions

### Resolve recurring terms from a campus-local calendar

Use an owner-maintained `semester_calendar` table with recurring start/end month and day values for the four terms. A database resolver SHALL evaluate the current date in `America/New_York`, choose the latest semester start that has occurred, and assign the calendar year of that start as `academic_year`. This matches the user's selected gap behavior: for example, Fall remains current from December 21 through January 1, then Winter becomes current on January 2. The same rule applies to the other gaps. A client-only clock was rejected because browser dates can differ and can be bypassed; the save function and current-enrollment queries need one shared authoritative result.

### Keep durable enrollment history separate from the current dashboard view

Add a canonical `course_enrollments` history relation with one row per student, exact section/instructor, and semester. Store the course prefix and number, semester/year, optional `course_offering_id`, and verification state. A verified class links to its offering; an unknown class remains a durable enrollment with no offering link. The dashboard, classmate discovery, recommendations, and other course-scoped authorization query this relation for the resolver's current semester/year. Do not clear or copy rows on a transition—the new term simply has no matching rows until the student saves classes.

Make the new history relation canonical for dashboard, discovery, recommendations, and course-scoped access. Keep `user_courses` and `user_course_sections` as a compatibility mirror because `academic_items` has a restrictive foreign key to `user_courses`; existing and newly saved course codes must retain a corresponding row so planner links continue to work. Planner items remain attached to a course code and are not semester-tagged by this change. Backfill existing memberships as `legacy_unverified`: their old rows do not contain reliable semester or instructor values, so they must not grant review access until the student confirms the missing details. Preserve legacy rows during rollout and never delete them as part of a term transition.

### Validate the catalog, then create or reuse a precise offering

Continue using `course_catalog` as the owner-managed source with its `(course_code, course_number)` key and course name. A single server-side save operation resolves the active term, validates each row, and processes the whole batch atomically. For a catalog match, it creates or reuses `course_offerings` by catalog course, professor first/last name, section, semester, and academic year, then stores the enrollment with that offering ID. Keep existing offering IDs and review foreign keys; extend the offering projection rather than recreating the table.

For a catalog miss, save the enrollment without an offering ID and add a row to `verify_courses`. That queue records the submitted course code/number, section, professor names, submitter, term/year, status, and timestamps. Students may submit a request and inspect their own status but cannot edit the catalog or mark a request approved. After an owner adds the course to `course_catalog` and approves the queued submission, the server-side promotion path may create/reuse the exact offering and attach the existing enrollment. Until approval, the class remains on the dashboard/history but cannot be reviewed or listed in Course Evaluations.

The class identity includes section: different sections in the same course, professor, and term are separate offerings, while multiple students in the same exact class reuse one offering row. Enrollment insertion never creates a `course_reviews` row.

### Capture instructor details during confirmation

Keep manual entry and schedule-import preview as separate inputs to the same enrollment save contract. Manual entry collects section and professor first/last names per row. OCR continues to return temporary course/section drafts; the import confirmation UI adds required professor first/last fields for each row. The same validation applies to both paths, and a batch with an incomplete row is not partially saved. This avoids changing OCR parsing for fields the screenshot does not contain.

### Enforce review eligibility while keeping reviews public and anonymous

Keep `course_reviews.offering_id` as the stable foreign key and preserve existing review rows and uniqueness. Change the write authorization so an eligible signed-in student can insert only when `course_enrollments` has their verified matching `course_offering_id`; retain the one-review-per-student/offering rule. Historical enrollment grants access after a term ends, but current-term membership alone does not grant access to other sections or instructors.

Expose reviews through a narrow public projection containing only offering metadata and anonymous review fields. Grant public/anonymous read access to that projection, not to the raw review table or its `user_id`. The projection must not require `private.is_eligible()` so unauthenticated visitors can read; it must use a controlled view/function that only exposes allow-listed columns. Authenticated users continue to submit through the existing review path and read the same public projection.

### Update every current-course consumer as part of the enrollment cutover

Replace direct historical membership checks in classmate discovery, course recommendations, friend-request course controls, and shared-course messaging authorization with current-semester membership checks. This is integration required by the new history model; profile projections, friendship rows, request status rules, and the classmate-discovery response fields remain unchanged. Course evaluations are the exception: review authorization intentionally checks historical matching enrollment.

## Risks / Trade-offs

- **Existing rows lack term/instructor metadata** → Backfill them as legacy/unverified, preserve source rows, and require confirmation before they can qualify for reviews.
- **Course codes or professor names may be entered inconsistently** → Normalize case and whitespace for matching; preserve readable display names and make the unique offering tuple explicit.
- **Semester transitions vary by local time and daylight saving** → Resolve calendar dates in `America/New_York` at the database boundary and test every start date and gap.
- **Public review access expands beyond authenticated users** → Grant anonymous reads only through a narrow projection that omits reviewer IDs and private data; keep insert privileges and enrollment checks restricted.
- **Catalog rows may be missing when users add valid classes** → Keep the class in dashboard/history, collect it in `verify_courses`, and withhold offering/review eligibility until owner approval.
- **Legacy offering rows do not have section identities** → Preserve their existing IDs and reviews as legacy offerings; new offerings use the full identity tuple and legacy rows do not grant matching-enrollment review access.

## Migration Plan

1. Owner applies the catalog migration and populates `course_catalog` manually. No Codex operation connects to or changes Supabase.
2. Owner reviews and applies a new follow-up migration after the existing account, course review, and catalog migrations. It adds semester definitions, history/verification structures, new offering fields and uniqueness, safe access controls, and updated database functions. It preserves old table rows and offering IDs.
3. The migration copies existing memberships into `course_enrollments` as legacy/unverified. Existing course review rows remain intact; no old row gains eligibility until its enrollment details are confirmed.
4. Deploy the updated class entry/import flows and course-consumer queries after the migration is available. The application must show a recoverable storage/setup error and retain drafts if required schema is unavailable.
5. Validate calendar boundaries, atomic enrollment saves, catalog misses, offering reuse, current-term discovery, historical review eligibility, public anonymous reads, duplicate review rejection, and planner foreign-key preservation in an isolated local database. The owner manually runs the migration in Supabase after reviewing it.

Rollback should stop writes through the new enrollment API and restore the previous application version. Preserve new history, `verify_courses`, offerings, and reviews while rolling back; do not automatically delete user-submitted or evaluation data. The old membership tables remain available during the initial rollout for data reconciliation.
