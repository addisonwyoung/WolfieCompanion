# Proposal

## Why

Students can currently discover classmates and course recommendations, but cannot turn those connections into an explicit friendship or manage requests. A friend-request system will let students connect, keep incoming and outgoing request states clear, and find accepted friends in each shared course.

## What Changes

- Add a Friend requests control beneath the signed-in user's profile with a pending incoming count and a dialog listing only requests addressed to that user. Each request shows sender name and major, a privacy-respecting profile view, and Accept and Decline actions.
- Add Add friend actions to course recommendation cards with clear outgoing-pending, incoming-pending, accepted, and declined/resend states. Enforce duplicate prevention in both the interface and database.
- Store pending, accepted, and declined requests in `friend_requests`; store each accepted friendship once using a canonical ordering of the two student IDs in `friendships`.
- Add a Friends in this Class list for the selected course containing accepted friends who also saved that course. A friend may appear in each shared course's list.
- Exclude accepted friends from every course recommendation list. Update the existing recommendation capability through a focused integration delta; do not change `classmate-discovery` requirements or its RPC contract.
- Refresh badges, request states, and course lists after local actions, and use realtime updates where available so a sender sees acceptance or decline without manually refreshing.
- Declined requests leave the pending list, remain as request history, and may be followed by a new request later. Only one pending request per unordered student pair may exist at a time; an incoming pending request is surfaced for response instead of allowing an opposing duplicate.

## Capabilities

### New Capabilities

- `friend-request-and-friendship-system`: Manage privacy-respecting friend requests, accepted friendships, and friends in shared courses.

### Modified Capabilities

<!-- No existing main capability requirements change. Friendship-related recommendation filtering is specified as an integration requirement in the new capability below. -->

## Impact

- Dashboard profile, course recommendation cards, selected-course friend lists, and profile dialogs in `client/src/`.
- New authenticated APIs/RPCs and realtime state updates for request inboxes, pair state, accept/decline actions, and accepted friends by course.
- New `friend_requests` and `friendships` tables with row-level security, canonical pair uniqueness, and transactional request actions in a new Supabase migration. The migration will be reviewable; database application remains manual.
- Existing profile sharing controls determine which optional profile fields are visible in friend-request and friendship profile views. Existing classmate discovery remains unchanged.
