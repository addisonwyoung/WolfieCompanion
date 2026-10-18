# Design

## Context

Course evaluations currently use `sampleEvaluations` and local React state. Existing `Course`, `user_courses`, and `user_course_sections` structures contain course codes and optional sections, but no professor or term. `evaluationData.ts` is the existing offering source: its stable IDs identify class, professor, semester, and year. The existing account migration supplies authenticated eligibility through `private.is_eligible()` and should remain untouched.

## Goals / Non-Goals

**Goals:** Persist reviews, distinguish professor-specific offerings by stable IDs, enforce eligibility/ownership/uniqueness in Postgres, and expose anonymous reviews.

**Non-Goals:** Catalog administration, reviewer identity display, review edits/moderation, enrollment verification, or changes to authentication, profile, and enrollment behavior.

## Decisions

### Store offering metadata once

The current schema has no offering relation, so the additive migration creates `course_offerings`. Each row has a stable text ID and the course code, course title, professor name, semester, and academic year. Seed the five existing `evaluationData.ts` IDs and descriptors. Keep the UI dropdown and class metadata sourced from `evaluationData.ts`, so it remains usable before the owner applies the migration. Those stable local IDs match the seeded catalog IDs; a foreign key rejects unknown IDs on submission. Review reads join catalog metadata in the anonymous projection, and the ID—not professor display name—defines the offering identity.

`course_reviews` has exactly seven columns: `id uuid primary key default gen_random_uuid()`, `offering_id text not null` referencing `course_offerings(id)`, `user_id uuid not null default auth.uid()` referencing `auth.users(id)`, `weekly_hours`, individual `difficulty`, `review`, and `created_at default now()`. It has no course, professor, term, or year columns and no stored aggregates. A unique `(user_id, offering_id)` constraint allows the same student to review distinct offerings even if their course/term match.

### Enforce access and anonymity

Authenticated eligible students may read the offerings catalog and `course_reviews_public` projection. Both review reads and inserts are governed by RLS. Create the view with `security_invoker = true` so base-table permissions and RLS apply as the querying student; add an eligible-read policy and grant SELECT only on anonymous review columns, never `user_id`. Insert grants omit `user_id`, `id`, and `created_at`, and insert RLS requires `user_id = auth.uid()` plus the eligibility helper. The default derives identity from the Supabase session. No update/delete is granted. The view joins the catalog and allowlists review fields and class metadata. The current-user status function returns only offering IDs for duplicate UI state.

### Keep summaries offering-specific

The application uses the existing local offering data for its dropdown and course/professor/term/year display. Review loads filter solely on the selected offering ID; metadata is joined in the database projection. A missing migration may make persisted reads and writes fail, but must not hide the dropdown, form, or sample evaluations. Show storage errors separately and retain the draft. Calculate averages and review count from individual rows. Existing sample evaluations remain visibly labeled and are not persisted or included in duplicate state.

### Migration lifecycle

The current `202610170001_course_reviews.sql` migration was created for this feature and has not been applied in this workspace; no existing migration depends on it. Update that versioned migration in place to define the catalog and seven-column review table. Keep changes additive and leave all existing tables and policies unchanged. Do not execute the SQL or connect to the shared Supabase database; the owner reviews and applies it manually.

## Verification

Client tests cover catalog mapping, valid and invalid-ID submissions, duplicate conflicts, anonymity, retained drafts, and aggregate calculations. SQL tests cover required columns, catalog FK validity, duplicate and field constraints, session-derived authorship, eligibility, anonymous reads, and unchanged existing account schema/policies. Run SQL tests only in an isolated local Postgres database, never shared Supabase.

## Risks

- Seeded offerings are currently the static set in `evaluationData.ts`; a future catalog management workflow must maintain authoritative offerings and IDs.
- SQL/RLS behavior is not verified unless an isolated Postgres environment is available. Keep that task open if unavailable rather than applying SQL to shared Supabase.
