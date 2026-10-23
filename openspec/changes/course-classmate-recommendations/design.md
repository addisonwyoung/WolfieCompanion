# Design

## Context

See proposal.md for motivation. The current dashboard selects one saved course at a time. `find_classmates` authenticates the caller, validates eligibility and normalized course membership, excludes the caller, and returns one row per peer with only name and major. `get_classmate_profile` exposes optional year, interests, and residence only when the peer opted in. Owner-only row policies prevent direct client reads of peer profiles, enrollments, and section records.

## Goals / Non-Goals

**Goals:**
- Add a separate recommendation data flow and UI that follows the selected course and reuses the existing eligibility, enrollment, and sharing rules.
- Ensure hidden values are never returned to the recommendation client and never participate in a score.
- Keep existing classmate-discovery requirements, RPC response, and roster behavior unchanged.
- Deliver any required SQL as a reviewable migration under `supabase/migrations/` for the owner to apply manually.

**Non-Goals:**
- Change existing classmate-discovery APIs or requirements.
- Read other students' profile, enrollment, or section tables directly from the client.
- Add sharing preferences or alter the meaning/defaults of existing profile privacy flags.
- Execute or install Supabase changes.

## Decisions

- Add a dedicated authenticated, read-only recommendation projection that validates the session-derived caller, eligibility, normalized course code, and caller course membership. It will derive distinct eligible peers from the existing course and section records, excluding the caller, and return only name, major, and optional values whose profile sharing flags are enabled. Keep this contract separate from `find_classmates` so its existing projection stays unchanged. A client-side loop over `get_classmate_profile` was considered but would create one request per peer and inconsistent loading states.
- Reuse the current visibility model: name and major are available under the existing same-course rule; year, interests, and residence are only available when each student has opted in. Also gate the signed-in student's own comparison fields by their respective share flags. Do not expose privacy flags or hidden values in the new projection; absence/null means unavailable to the comparison layer.
- Calculate scores in client recommendation logic from the caller's own loaded profile and the safe peer projection. Normalize major and interest text by trimming and case-folding; count each distinct shared interest once. Award 8 per match up to 40, and award the full factor weight only for an exact normalized major, year, or residence match.
- Use a fixed 100-point denominator for every candidate. A private or unavailable factor earns no points and does not reduce the denominator. An available but empty interests array and a missing or private factor both earn zero interest/factor points. A candidate with no available comparison factors receives 0/100.
- Keep recommendation data separate from roster data and tie both views to the active course selection. Show public candidate details and the public shared-interest intersection only; do not show fields that the candidate kept private.
- Present the existing roster and recommendations as mutually exclusive selected-course views, with accessible Classmates and People you may connect with buttons. Default to the classmates roster.
- Provide the migration under `supabase/migrations/` during implementation, but do not execute or apply database changes. The owner can review and manually apply it.

## Risks / Trade-offs

- [A dedicated projection can accidentally expose private values] → Build an explicit allowlist conditioned on the existing share flags, preserve authenticated execute privileges, and validate projection behavior with privacy-focused database cases.
- [Client and database eligibility logic could diverge] → Reuse the existing eligibility and normalized course-membership checks wherever possible, and test course membership, self-exclusion, and duplicate sections against the existing discovery behavior.
- [Students with sparse public profiles can earn fewer points] → Use the same fixed 100-point maximum for every candidate, as requested, while never exposing private values.
- [A student can change privacy choices while a recommendation request is in flight] → Refresh recommendations on selected-course or profile changes and avoid retaining stale results after identity/course changes.

## Migration Plan

No SQL is applied to a Supabase database as part of this work. Produce an owner-review migration under `supabase/migrations/`, then have the owner manually apply it. Deploy the client only after the corresponding function is available. Roll back the client and manually revert the separately reviewed function if needed; leave existing classmate-discovery functions and policies unchanged.
