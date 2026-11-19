# Proposal

## Why

Student discoverability and communication consent currently use inconsistent authorization boundaries. Students need reversible profile privacy, enforceable messaging preferences, blocking, and voluntary collaboration without losing historical work or messages.

## What Changes

- Add private profiles: new and existing accounts default public, with voluntary private mode. Support university-wide search for public students across majors/courses, hide private students from general search and autocomplete, and retain authorized friendship and limited shared-group identity.
- Permit private students to create and join Study Buddies. Require explicit invitation acceptance and verified current-semester course-section membership for new admission, with public classmates and private friends in the existing section-based selection flow; preserve accepted memberships.
- **BREAKING** Replace `allow_new_dms` with mutual `eligible_students`, `friends_only`, and `no_one` authorization on every send, including existing conversations. Preserve participant history and established-contact authorization under `eligible_students`.
- Add bilateral communication/discovery effects from directed user blocks; remove friendships and invalidate pending friend requests without restoring them on unblock.
- Separate group-addition consent from DM preferences. Preserve the group picker UI with friend suggestions and university-wide public-student search, plus authorized private friends. Any active member may add eligible students; first-time additions are automatic, including authorized private friends, and re-addition after voluntary leave requires acceptance.
- Use equal messaging-group member permissions, voluntary self-leave, membership history and inactive retained final-member groups. Creator attribution grants no authority; members can remove only themselves, with no administrator, owner, manager, succession or peer-removal role. Former members have no in-app rejoin-request or self-rejoin flow; any private request for a new invitation remains subject to normal DM authorization.
- Enforce every supported and legacy database path; provide privacy notices, read-only explanations, and comprehensive authorization/concurrency regression coverage.

## Capabilities

### New Capabilities

- `student-profile-privacy`: Reversible discoverability, contextual profile access, defaults, notices, and preserved academic functionality.
- `student-communication-authorization`: Mutual DM preferences, blocking, preserved history, migration, and common authorization boundaries. Extends implemented but unsynchronized direct-messaging and friendship capabilities without duplicating their persistence/UI contracts.
- `private-student-collaboration`: Private voluntary Study Buddies participation, messaging invitations, blocked-pair admission checks, and member-managed messaging groups, departure and consent-based rejoining. Extends implemented but unsynchronized study/group capabilities.

### Modified Capabilities

- `classmate-discovery`: Verified offering scope, private/blocked target exclusion, and accurate visibility explanations replace historical across-section discovery and deferred privacy controls.

## Impact

- Supabase: additive settings, directed blocks, conditional messaging invitations and membership history; RPC/helper/grant/RLS review; legacy entry-point retirement or equivalent enforcement; preserved data and manual deployment.
- React: account/profile/onboarding, discovery, friendship dialogs, Study Buddies, Messages, invitation management, read-only/block/leave controls, refresh and notification state.
- Express avatar endpoints and service-role resolvers must apply the same contextual authorization.
- Tests: fresh full-migration SQL suites, mutation concurrency, client/server authorization and lifecycle tests, academic/group regressions, managed Realtime acceptance.
- Historical changes remain untouched. This change explicitly supersedes earlier new-DM-only, original-creator-only management, mandatory public participation, private-by-default onboarding, and no-profile-opt-out behavior. Reconcile unsynchronized prerequisite specs before future sync/archive; artifact completion is not deployment or implementation.

## Review status

The final group-chat decisions are captured consistently: equal active-member permissions, automatic first admission including private friends, self-leave only, consent-based re-addition, durable internal membership history and inactive empty groups. No group-chat product questions remain. No apply or deployment is authorized by this documentation revision.
