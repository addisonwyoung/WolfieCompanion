# Semester-aware enrollments: owner setup

This change adds a follow-up migration. The app never applies SQL automatically; review and run the migration manually in the Supabase SQL editor.

## Apply order

The migration expects the existing account, course review/offering, classmate discovery/profile, academic item, friend request/friendship, course recommendation, and course catalog migrations to have been applied first. In particular, apply `supabase/migrations/202610240003_course_catalog.sql` and manually populate `course_catalog` before applying `supabase/migrations/202610250001_semester_aware_enrollments.sql`.

Review the new migration before running it. It preserves the existing `course_offerings` IDs and `course_reviews` references. It keeps `user_courses` and `user_course_sections` as planner compatibility links because `academic_items` references those rows. It does not delete planner items or legacy course rows.

## Catalog and unknown-course review

Add and maintain `course_catalog` rows through owner-controlled database access. Students cannot add catalog entries through the application. When a saved course does not match the catalog, the application stores the enrollment for the current dashboard and adds a pending `verify_courses` row. Review queue rows include the course prefix/number, section, professor names, submitter, semester/year, and status.

To approve a submission, first add the matching catalog row, then set the matching `verify_courses.status` to `approved`. The migration trigger creates or reuses its exact offering and links the enrollment. Setting the status to `rejected` leaves the class visible in the dashboard but does not create an offering or grant review eligibility.

## Semester dates

The migration seeds the recurring `semester_calendar` rules: Fall (Aug 20–Dec 20), Winter (Jan 2–Jan 22), Spring (Jan 25–May 20), and Summer (May 22–Aug 14). All date resolution uses `America/New_York`; in the gaps, the preceding term remains current. Academic year is the calendar year in which that term starts. To change these recurring dates, update the four owner-managed rows in `semester_calendar`.

## After applying

The dashboard and course-scoped classmate/recommendation/friend controls use only current-term `course_enrollments`. Historical verified enrollments remain available for exact-offering reviews. Planner items remain linked to `user_courses` and are not assigned a semester by this change. Anonymous readers can read the allow-listed public review view; reviewer IDs remain available only to authorized database operations, not in that view.
