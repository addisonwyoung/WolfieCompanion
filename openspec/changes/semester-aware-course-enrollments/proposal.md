# Proposal

## Why

Dashboard classes currently have no semester, instructor, or durable history, while course evaluations are keyed to offerings that are maintained separately. Semester-aware enrollments will make schedule confirmation reliable, preserve each student's prior classes for review eligibility, and let the dashboard move to a new term without deleting history.

## What Changes

- Add a configurable semester calendar using Fall (Aug 20–Dec 20), Winter (Jan 2–Jan 22), Spring (Jan 25–May 20), and Summer (May 22–Aug 14). The prior term remains current in the gaps until the next term starts. Academic year is the calendar year in which the semester starts.
- Require a section and professor first and last name for every class before manual or imported schedule rows can be saved. Professor names are entered by the student during confirmation; schedule OCR continues to extract only the fields supported by its input.
- Store enrollment history across semesters and years. The dashboard shows only enrollments for the current semester; when the next semester starts, its dashboard list is empty until the student adds classes for that term. Old enrollment records remain available for review authorization.
- Validate the department/course-number pair against the owner-managed `course_catalog`. A catalog match creates or reuses one course offering keyed by course, professor, section, semester, and academic year. A non-match is still saved to the dashboard and history, and is added to a `verify_courses` review queue; it is excluded from Course Evaluations until verified and added to the catalog.
- Permit review submission only for a student with a saved historical enrollment matching the exact offering. Preserve anonymous reviews and one review per student per offering, and make published reviews readable by anyone.
- Update course-scoped discovery and recommendation queries to use current-semester enrollment, so historical classes do not appear as current classmates or grant current-course access.
- Add all database work as a follow-up migration for owner review. Do not apply SQL or make direct changes in Supabase.

## Capabilities

### New Capabilities

- `course-enrollment-lifecycle`: Semester resolution, class entry and confirmation, catalog validation, persistent student enrollment history, and unverified-course submissions.

### Modified Capabilities

- `prototype-dashboard`: Show only current-semester enrollments and clear the displayed schedule at term transitions while retaining history.
- `course-evaluations`: Discover term-specific offerings, allow writes only to students enrolled in the exact offering, and allow anyone to read anonymous published reviews.
- `classmate-discovery`: Keep its course-scoped discovery behavior, but define shared membership as current-semester enrollment because enrollment records will now include history.

## Impact

- Client: `ManualClasses`, `ScheduleImportPreview`, `account.ts`, `useAccount.ts`, `CourseBrowser`, and course-evaluation UI/API.
- Database: follow-up migration after the existing catalog and evaluation migrations; semester calendar, semester-specific enrollments, expanded offerings, `verify_courses`, and revised review authorization/read grants. Existing `course_reviews` rows and offering IDs must remain valid.
- Course-scoped RPCs and access checks that read `user_courses` must filter by the current semester, including recommendations and shared-course messaging checks. Friendships themselves are unchanged.
- Existing schedule-import extraction remains temporary and OCR continues to parse course/section only; professor first and last names are captured in the confirmation form.
- The current `user_courses` records have no term or professor data. Migration planning must preserve existing rows and mark unavailable legacy instructor/semester metadata as unverified or otherwise prevent it from granting review eligibility until confirmed.
