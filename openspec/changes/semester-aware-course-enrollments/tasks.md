# Tasks

## 1. Database foundation and migration

- [ ] 1.1 Add the recurring semester calendar and a database resolver for the current semester and start-year academic year; verify every term start and gap date in an isolated database.
- [ ] 1.2 Add durable semester-specific enrollment history and the `verify_courses` queue with owner-managed review status; verify constraints, indexes, submitter ownership, and unknown-course submissions in migration tests.
- [ ] 1.3 Extend course offerings with course number, section, and professor first/last name while preserving existing IDs and reviews; verify exact-offering uniqueness and reuse for duplicate enrollments.
- [ ] 1.4 Backfill legacy course memberships as unverified without granting review eligibility and retain `user_courses` as the planner compatibility mirror; verify academic-item foreign keys remain intact and no legacy class is treated as current.
- [ ] 1.5 Implement an atomic enrollment save and owner-approval promotion path that validates the catalog, resolves the active term, creates/reuses exact offerings for catalog matches, and queues catalog misses; verify all-or-nothing batch behavior and both catalog outcomes.

## 2. Enrollment entry and dashboard

- [x] 2.1 Update manual class entry to require section and professor first/last name for every row; verify incomplete rows block the whole save and retain editable form values.
- [x] 2.2 Update schedule-import confirmation to collect professor first/last name per row without changing OCR extraction; verify imported drafts cannot save until every required field is present.
- [x] 2.3 Wire both entry flows to the atomic enrollment API and display catalog verification status for saved classes; verify known and unknown courses remain visible in the dashboard.
- [ ] 2.4 Load dashboard classes by the resolved active semester/year and retain historical rows when the term changes; verify a new term starts with an empty current schedule and no stale selection.

## 3. Course evaluations and review access

- [x] 3.1 Browse and display offerings by exact course, professor, section, semester, and year, excluding unverified courses; verify search and offering details distinguish sections and terms.
- [ ] 3.2 Enforce review submission against a verified historical enrollment for the exact offering while preserving one review per student/offering; verify eligible past-term enrollment succeeds and nonmatching or unverified enrollment is denied.
- [ ] 3.3 Expose anonymous published reviews through an allow-listed public read projection and keep reviewer identifiers private; verify anonymous reads work and no identity fields are returned.
- [ ] 3.4 Preserve existing review IDs and data through the migration and document owner-run migration ordering; verify existing review rows still reference their original offerings.

## 4. Current-term integrations and rollout

- [ ] 4.1 Update classmate discovery and course recommendations to use current-semester enrollment while retaining their existing response and privacy contracts; verify prior-term-only peers are excluded.
- [ ] 4.2 Update friend course controls and shared-course messaging authorization to use current-semester enrollment without changing friendship or message semantics; verify historical shared classes do not grant current-course access.
- [x] 4.3 Add migration and application setup guidance, including manual catalog population and owner-managed verification queue handling; verify documented apply order matches migration dependencies and requires no automated Supabase execution.
- [ ] 4.4 Run integration checks for semester boundaries, enrollment persistence, catalog misses, exact offering reuse, discovery filtering, historical review access, anonymous reads, and duplicate review rejection in an isolated local database; record results before deployment.
