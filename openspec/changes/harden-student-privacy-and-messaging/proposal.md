# Proposal

## Why

Student discoverability and communication consent currently use inconsistent authorization boundaries. Students need reversible profile privacy, enforceable messaging preferences, blocking, and voluntary collaboration without losing historical work or messages.

## What Changes

- Add private profiles: existing profiles remain public during migration; new accounts default private. Hide private students from general discovery while retaining authorized friendship and shared-group contexts.
- Permit private students to create and join Study Buddies. Require explicit invitation acceptance and verified current-semester course/section/professor matching for new admission; preserve accepted memberships.
- **BREAKING** Replace `allow_new_dms` with mutual `eligible_students`, `friends_only`, and `no_one` authorization on every send, including existing conversations. Preserve participant history and established-contact authorization under `eligible_students`.
- Add bilateral communication/discovery effects from directed user blocks; remove friendships and invalidate pending friend requests without restoring them on unblock.
- Separate group-addition consent from DM preferences. Add acceptance-based messaging-group invitations for private accepted friends through authorized friendship interfaces.
- Add messaging-group self-leave, deterministic management succession, preserved original creator metadata, and inaccessible retained abandoned groups.
- Enforce every supported and legacy database path; provide privacy notices, read-only explanations, and comprehensive authorization/concurrency regression coverage.

## Capabilities

### New Capabilities

- `student-profile-privacy`: Reversible discoverability, contextual profile access, defaults, notices, and preserved academic functionality.
- `student-communication-authorization`: Mutual DM preferences, blocking, preserved history, migration, and common authorization boundaries. Extends implemented but unsynchronized direct-messaging and friendship capabilities without duplicating their persistence/UI contracts.
- `private-student-collaboration`: Private voluntary Study Buddies participation, messaging invitations, blocked-pair admission checks, and messaging-group departure/succession. Extends implemented but unsynchronized study/group capabilities.

### Modified Capabilities

- `classmate-discovery`: Verified offering scope, private/blocked target exclusion, and accurate visibility explanations replace historical across-section discovery and deferred privacy controls.

## Impact

- Supabase: additive settings, directed blocks, messaging invitations, manager metadata; RPC/helper/grant/RLS review; legacy entry-point retirement or equivalent enforcement; preserved data and manual deployment.
- React: account/profile/onboarding, discovery, friendship dialogs, Study Buddies, Messages, invitation management, read-only/block/leave controls, refresh and notification state.
- Express avatar endpoints and service-role resolvers must apply the same contextual authorization.
- Tests: fresh full-migration SQL suites, mutation concurrency, client/server authorization and lifecycle tests, academic/group regressions, managed Realtime acceptance.
- Historical changes remain untouched. This change explicitly supersedes earlier new-DM-only, original-creator-only management, mandatory public participation, and no-profile-opt-out behavior. Reconcile unsynchronized prerequisite specs before future sync/archive; artifact completion is not deployment or implementation.
