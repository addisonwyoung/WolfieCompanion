# Tasks

## 1. Persist private relationship state

- [x] 1.1 Add `friend_requests` and canonical `friendships` tables, constraints, pending-pair uniqueness, participant-scoped RLS, and required realtime publication membership in a new manual migration; verify the schema and grants in local SQL checks.
- [x] 1.2 Implement authenticated send and respond operations with eligibility/course validation, duplicate prevention, recipient-only accept/decline, and atomic friendship creation; verify self, unrelated, ineligible, reverse-pending, accept, decline, and retry cases in local SQL tests.
- [x] 1.3 Add narrow incoming-request, relationship-state, friends-in-course, and friend-context profile projections; verify participant authorization, section deduplication, eligibility filtering, and opt-in profile-field omission in local SQL tests.

## 2. Add the request inbox

- [x] 2.1 Add a Friend requests button beneath the profile with the pending incoming count and an accessible dialog of incoming requests; verify the badge and list include only requests addressed to the signed-in student.
- [x] 2.2 Add sender profile viewing and accept/decline actions using only shared profile fields; verify successful actions update the inbox and count, failures preserve confirmed state with a retryable message, and pending requests never appear as friends.
- [x] 2.3 Add client API and UI tests for empty/loading/error states, keyboard operation, profile privacy, acceptance, decline, and resending after decline.

## 3. Integrate friend state into course views

- [x] 3.1 Add relationship-state labels and Add friend/send-again actions to recommendation cards; verify pending requests cannot be duplicated, incoming requests point to the inbox, accepted friends are reflected, and declines permit a later retry.
- [x] 3.2 Update only the course recommendation projection to exclude accepted friends in both directions; verify pending and declined requests remain eligible and existing `find_classmates` results and contract remain unchanged.
- [x] 3.3 Add a Friends in this Class section for accepted friends enrolled in the selected course; verify pending requests are excluded and a friend appears once in every shared course.

## 4. Keep views synchronized and document rollout

- [x] 4.1 Subscribe to participant-scoped request and friendship changes and refresh inbox counts, recommendation statuses, and selected-course friends; verify local mutations update immediately and remote decisions synchronize without manual refresh, with focus refetch as fallback.
- [x] 4.2 Document migration prerequisites, manual application, local-only SQL checks, realtime setup, and rollback; verify the guide never instructs applying changes to a hosted database and does not change classmate-discovery requirements.
- [x] 4.3 Run focused friendship and dashboard tests plus the production build; review request lifecycle, account switching, stale results, privacy, multi-course friends, and accessible responsive controls.
