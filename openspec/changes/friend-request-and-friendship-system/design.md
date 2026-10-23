# Design

## Context

See proposal.md for motivation and the capability spec for observable behavior. The client is a React app using Supabase Auth and RPCs. Profiles and enrollment records are owner-readable only. `classmate-discovery` returns name and major for eligible shared-course peers; the recommendation capability has a separate safe profile projection and exposes profile fields only according to the existing `share_*` flags. Do not alter the classmate-discovery function or its requirements.

## Goals / Non-Goals

**Goals:**
- Keep request, friendship, and enrollment access behind authenticated, participant-scoped database operations.
- Make acceptance an atomic transition from pending request to a single canonical friendship.
- Keep recommendation status, request inbox counts, and friends-in-course results current without manual reloads.
- Reuse existing profile privacy choices for friend/request profile views.
- Provide a new migration and local SQL verification for the owner to review and apply manually.

**Non-Goals:**
- Change classmate-discovery's API, profile projection, or main capability requirements.
- Add friend removal, blocking, search, external notifications, or new profile privacy controls.
- Treat pending requests as friendship, or show pending-request senders in Friends in this Class.
- Apply SQL to a hosted Supabase database during implementation.

## Decisions

- **Store requests and accepted friendships separately.** `public.friend_requests` keeps request history with UUID id, sender/recipient UUIDs, checked status, created/updated/responded timestamps, distinct endpoints, and status constraints. A partial unique index on `least(sender_id, recipient_id), greatest(...)` for pending rows prevents duplicate and opposite-direction pending requests. A declined request stays historical; retry inserts a new row. `public.friendships` has canonical `user_id < friend_id`, a composite primary key, and `created_at`; it contains accepted pairs only.
- **Keep tables private and expose narrow RPC operations.** Enable RLS. Participants may select only request rows involving their own `auth.uid()` and friendship rows containing their own ID. Revoke direct client writes; security-definer RPCs with an empty search path validate trusted eligibility, selected-course membership, peer eligibility, self/friend/pending constraints, and actor role. The send RPC only accepts a peer eligible for the chosen course. The respond RPC locks a pending request and allows only its recipient to accept or decline. Acceptance updates the request and inserts the canonical friendship in one transaction.
- **Serve dedicated projections instead of client-side peer-table reads.** Provide an incoming-request projection for the signed-in recipient, relationship state for eligible peers in the selected course, and accepted friends enrolled in that course. Each projection derives identity from `auth.uid()`, filters eligibility and course membership server-side, deduplicates peers, and returns only the fields the UI needs. `classmate-discovery` remains unchanged.
- **Respect profile sharing at the friend boundary.** Add a friend-context profile projection that requires either a pending request between caller and target or an accepted friendship. Name and major follow the existing peer summary; optional year, interests, residence, and avatar are returned or resolved only when their existing `share_*` flags are enabled. The existing classmate profile path remains as-is.
- **Integrate friendship state into course recommendations.** Add a later migration replacement for the recommendation projection that excludes canonical accepted friendship pairs in both directions. Pending and declined requests do not exclude candidates. Recommendation cards receive one status per peer (`none`, `outgoing pending`, `incoming pending`, or latest `declined`); the interface allows resend only after decline and delegates incoming responses to the inbox.
- **Use realtime to synchronize other participants.** Add the two relationship tables to the Supabase realtime publication and participant-scoped SELECT policies. The client subscribes for the signed-in user's request and friendship changes, then refreshes inbox, card states, selected-course friends, and recommendation results. Local successful actions update/invalidate these views immediately; unsubscribe on account change or sign-out. If a realtime event is missed, refetch when the app regains focus.
- **Place controls in the existing dashboard.** Render Friend requests and its pending badge under the current user's profile. Use an accessible modal for incoming requests and profile views. Keep Classmates and recommendations as their existing selectable views, and place Friends in this Class as a separate section for the currently selected course.
- **Keep database rollout manual.** Commit a new migration after the accounts, profile-visibility, and course-recommendation migrations. Add isolated SQL assertions following the existing `supabase/tests/` convention. Do not apply the migration to any database; the owner applies it after reviewing.

## Risks / Trade-offs

- [A race can create conflicting or duplicate requests] → Enforce one pending unordered pair with a partial unique index and make the RPC handle the conflict as the existing incoming request state.
- [Accepting a request could leave request and friendship tables inconsistent] → Lock and update the pending request and insert the canonical friendship in a single transaction.
- [Realtime may not be enabled or an event may be missed] → Configure publication membership in the migration and refetch relationship data on app focus; local actions update their own state immediately.
- [A request inbox could expose private profiles] → Return only sender summary fields in the inbox; require a participant relationship and existing share flags for the profile projection.
- [Friend filtering could accidentally change classmates] → Limit the change to a new migration for the recommendation projection and keep `find_classmates` and its tests untouched.

## Migration Plan

Apply the new migration manually only after the existing accounts, classmate-profile visibility, and course-recommendation migrations are installed. The owner must review its RLS policies, RPC grants, realtime publication changes, and local SQL test first. Rollback removes only the new friend RPCs, tables, indexes, policies, and realtime publication membership, and restores the prior course-recommendation function definition. It must not alter classmate-discovery tables, policies, function, or contract.
