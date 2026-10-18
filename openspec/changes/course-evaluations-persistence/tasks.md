# Tasks

## 1. Supabase schema and access control

- [x] 1.1 Create/update the versioned migration for the new offering catalog and the exactly seven-column `course_reviews` table; ensure existing tables/policies are untouched. Create the SQL artifact only; do not execute or apply it to Supabase.
- [x] 1.2 Define catalog FK, session-derived insert identity, eligible read/insert RLS, unique `(user_id, offering_id)`, and an invoker-security review projection backed by column-limited grants that exclude reviewer identity. Migration is unapplied; isolated database verification remains below.
- [x] 1.3 Add isolated SQL tests for exact review columns, valid/invalid offering IDs, field bounds, duplicate rejection, professor-specific offerings, anonymity, eligibility, and existing account schema/policies. Execute only in isolated local Postgres; never shared Supabase.
- [x] 1.4 Document the migration as an owner-reviewed/manual SQL Editor artifact and preserve existing authentication, account, profile, and enrollment setup.

## 2. Persistent course evaluation experience

- [x] 2.1 Keep dropdown and offering display sourced from `evaluationData.ts`; use its stable IDs for Supabase review reads/writes and submit no caller identity or client-supplied class details.
- [x] 2.2 Query anonymous reviews by `offering_id`; use the joined catalog for course/professor/term/year display. Keep professor-specific offering summaries distinct and expose no reviewer identity to rendering code.
- [x] 2.3 Persist individual hours, difficulty, and text; retain existing UI, validation, duplicate/error states, and drafts. Let the database generate review ID and creation time.
- [x] 2.4 Add/run client tests for valid and invalid offering IDs, duplicates, individual-rating averages, anonymous projection/UI, and retained drafts; verify tests and build pass.
- [x] 2.5 Update user-facing course-evaluation and Supabase setup documentation for the offering catalog and seven-column review model; emphasize manual owner application only.

## 3. Integrated verification

- [ ] 3.1 Run the migration and SQL tests against an isolated local Postgres database to verify FK/RLS/uniqueness/anonymity and unchanged account schema. Do not execute or apply it to shared Supabase.
