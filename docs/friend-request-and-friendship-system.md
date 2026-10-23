# Friend requests and friendships

The friend system is a separate dashboard capability. `public.friend_requests` keeps pending, accepted, and declined request history. `public.friendships` stores accepted pairs once in canonical UUID order. Pending and declined requests are not friendships. After a decline, a later attempt inserts a new request row. Only one pending request can exist for a pair at a time.

The UI exposes incoming requests beneath the signed-in student's profile, actions on course recommendation cards, and a Friends in this Class list for each selected course. Names and majors follow the existing classmate summary. Optional profile fields and pictures follow the existing `share_*` controls. The `find_classmates` function and `classmate-discovery` contract stay unchanged; only the separate `course_recommendation_profiles` projection filters accepted friends.

## Manual migration

Review `supabase/migrations/202610220004_friend_requests.sql`. Apply it manually only after the accounts, classmate profile visibility, and course recommendation migrations. This implementation does not connect to or execute SQL against a Supabase database. The migration enables RLS, grants authenticated users participant-scoped reads, exposes authenticated RPCs for relationship actions, and adds the two relationship tables to `supabase_realtime` when that publication exists.

The client will report retryable errors for friend features until the migration is installed. Classmate discovery remains independent. The avatar route additionally requires the server's existing Supabase service role configuration to resolve a permitted friend picture; the browser never receives the service role key.

## Local verification

`supabase/tests/friend_requests.sql` is intended for an isolated disposable local Postgres test database only. It expects `supabase/tests/bootstrap.sql` and prerequisite migrations through `202610220003_course_classmate_recommendations.sql`. It checks eligibility and course boundaries, pending uniqueness, sender/recipient authorization, inbox privacy, decline and retry history, atomic acceptance, canonical storage, section deduplication, recommendation exclusion, profile privacy, and the unchanged classmates projection. Do not point it at any hosted database.

## Rollback

If this migration has been manually installed and must be rolled back, remove the `friend_request_inbox`, `course_friend_relationships`, `friends_in_course`, `get_friend_profile`, `resolve_friend_avatar`, `send_friend_request`, and `respond_to_friend_request` RPCs, then remove this migration's realtime publication memberships, policies, indexes, and the two friend tables. Restore `public.course_recommendation_profiles(text)` from `supabase/migrations/202610220003_course_classmate_recommendations.sql`. Do not drop or modify `find_classmates`, the classmate visibility policies, or other classmate-discovery objects. Release the corresponding client/server code rollback separately.
