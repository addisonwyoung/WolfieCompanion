# Design

## Context

The app uses authenticated Supabase RPCs for cross-user classmate discovery. `find_classmates` checks the signed-in student's eligibility and saved course, then returns eligible students sharing that course. Saved course and section records do not contain meeting times, so the study-group feature must ask each student to enter free windows.

## Goals

- Persist groups and invitations across sessions.
- Require invitee consent before membership and schedule sharing.
- Let each accepted member manage only their own availability.
- Compute weekly intersections for all accepted members and a user-entered whole-minute duration up to 24 hours.
- Keep all new SQL as a manually reviewed migration.

## Decisions

- A group is tied to one normalized saved course. The creator is the first accepted owner and may invite one to seven classmates. Invitees must accept and still have the saved course before joining.
- An invitee may see the group's name, course, and member names while deciding. Only accepted members receive availability data.
- Authenticated SECURITY DEFINER RPCs are the only client data path. The base tables have RLS enabled and no direct client grants. Each RPC derives identity from `auth.uid()`, checks `private.is_eligible()`, and validates group membership before returning or changing data.
- Availability is stored as recurring weekday windows with minute-level precision. Each accepted member replaces only their own windows; time windows are not inferred from course/section records.
- A forward-only database migration widens existing availability validation to accept minute-level values while preserving saved windows.
- The end-time check is a table-level constraint because it compares two columns; the corrective migration removes its original generated name after replacing it with the minute-precision range check.
- When the owner leaves, ownership transfers to the earliest accepted member. If no accepted member remains, the group is deleted. A member leaving removes their availability through the membership foreign key.
- The client displays only windows long enough for the requested duration. The SQL migration is not applied automatically.

## Risks

- [An RPC could expose schedule data to a pending invitee] → Return availability only when the caller's membership status is accepted, and expose no direct table privileges.
- [A student may mistake course membership for official enrollment] → Describe the association as based on student-saved course records, consistent with current discovery behavior.
- [The client can be deployed before the migration] → RPC failures are shown as retryable group errors; apply the migration before enabling this page for the group.

## Migration Plan

Review and manually apply `supabase/migrations/202610230003_study_buddy_groups.sql` after its prerequisite account, discovery, and classmate-visibility migrations. Do not run it against shared Supabase from the application. If rollback is needed, disable the client page and review a separate rollback SQL before dropping group data.
