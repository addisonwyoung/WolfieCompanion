# Semester-aware enrollments: owner setup

This change adds a follow-up migration. The app never applies SQL automatically; review and run the migration manually in the Supabase SQL editor.

## Apply order

The migration expects the existing account, course review/offering, classmate discovery/profile, academic item, friend request/friendship, course recommendation, and course catalog migrations to have been applied first. In particular, apply `supabase/migrations/202610240003_course_catalog.sql` and manually populate `course_catalog` before applying `supabase/migrations/202610250001_semester_aware_enrollments.sql`.

After that migration, apply `supabase/migrations/202610250002_course_review_insert_privilege.sql`. It restores the column-limited insert grant required by the review form; the existing row-level security policy still requires a verified enrollment in the exact offering.

Apply `supabase/migrations/202610250003_hide_demo_course_offerings.sql` to remove the original demo offerings (CSE 416, BIO 201, and MAT 210) from Course Evaluations. It marks those offerings unverified so they are no longer listed, while preserving any reviews and enrollment references already attached to them.

Apply `supabase/migrations/202610250004_course_review_class_feedback.sql` to add a 1–5 class rating and a required take-again yes/no answer for new reviews. Existing reviews remain intact and have no values for these new fields.

Then apply `supabase/migrations/202610250005_course_review_recommendation_label.sql` to rename the yes/no field to match the “Would you recommend this class?” question. This preserves existing answers and refreshes the public review projection.

Apply `supabase/migrations/202610250006_section_scoped_classmates.sql` to make dashboard classmate lists, recommendations, section-based friend actions, and classmate profile access require the same current course section. The application displays each course section separately. Course evaluations already use section-specific offerings and do not need a separate section change.

Apply `supabase/migrations/202610260001_course_professor_verification.sql` after the semester-aware enrollment migration. It adds the owner-managed `course_professors` list and updates the atomic enrollment/approval functions. The manual and OCR course-entry flows both use this list. A listed professor creates or reuses a section/term-specific evaluation offering; an unlisted professor is saved to the dashboard as pending and does not create an offering until verified.

Apply `supabase/migrations/202610260002_verified_section_classmates.sql` after the professor-verification migration. It keeps pending and rejected courses on the dashboard but requires verified current-semester enrollment before classmate, recommendation, profile, and course-based friend functions allow access. Once an enrollment is verified, those lists become available on the next request or page reload.

Review the new migration before running it. It preserves the existing `course_offerings` IDs and `course_reviews` references. It keeps `user_courses` and `user_course_sections` as planner compatibility links because `academic_items` references those rows. It does not delete planner items or legacy course rows.

## Catalog and unknown-course review

Add and maintain `course_catalog` rows through owner-controlled database access. Students cannot add catalog entries through the application. Add approved professors to `course_professors` with the course prefix, course number, first name, and last name; the professor list is shared by every section and term for that course. Students cannot edit this allow-list.

If a student chooses **Other**, the application saves the course on the dashboard as awaiting verification and adds a pending `verify_courses` row. To approve an unlisted professor, first ensure the course is in `course_catalog`, then set the submission's status to `approved` and `reviewed_at` to the current timestamp. The trigger adds that professor to `course_professors`, creates/reuses the exact section/term offering, and links the enrollment. Other pending submissions for the same course and professor are promoted too. Setting the status to `rejected` leaves the class visible on the dashboard but does not create an offering or grant review eligibility.

## Semester dates

The migration seeds the recurring `semester_calendar` rules: Fall (Aug 20–Dec 20), Winter (Jan 2–Jan 22), Spring (Jan 25–May 20), and Summer (May 22–Aug 14). All date resolution uses `America/New_York`; in the gaps, the preceding term remains current. Academic year is the calendar year in which that term starts. To change these recurring dates, update the four owner-managed rows in `semester_calendar`.

## After applying

The dashboard and course-scoped classmate/recommendation/friend controls use only current-term `course_enrollments`. Historical verified enrollments remain available for exact-offering reviews. Planner items remain linked to `user_courses` and are not assigned a semester by this change. Anonymous readers can read the allow-listed public review view; reviewer IDs remain available only to authorized database operations, not in that view.
