# Proposal

## Why

Student discoverability and communication consent currently use inconsistent authorization boundaries. Students need reversible profile privacy, enforceable messaging preferences, blocking, and voluntary collaboration while preserving private messages and avoiding unnecessary collaboration-retention infrastructure.

## What Changes

- Add private profiles: new and existing accounts default public, with voluntary private mode. Support university-wide search for public students across majors/courses, hide private students from general search and autocomplete, and retain authorized friendship and limited shared-group identity.
- Permit private students to create and join Study Buddies. Reuse the existing invitation/acceptance flow and allow any accepted member to invite additional classmates. Require the group's authoritative verified course, section, professor, semester and academic year for candidates and new admission. Limit each group to eight accepted members plus pending invitees combined; declined invitations consume no capacity. Preserve each actual inviter independently of ownership and retain accepted memberships on owner departure. Do not add Study Buddies messaging.
- **BREAKING** Replace `allow_new_dms` with mutual `eligible_students`, `friends_only`, and `no_one` authorization on every send, including existing conversations. Preserve participant history and established-contact authorization under `eligible_students`.
- Add bilateral communication/discovery effects from directed user blocks; remove friendships and invalidate pending friend requests without restoring them on unblock.
- Separate group-addition consent from DM preferences. Preserve the group picker UI with friend suggestions and university-wide public-student search, plus authorized private friends. Addition permission is All Members by default or Creator Only while the original creator remains active with unrevoked privileges; first-time additions are automatic, including authorized private friends, and re-additions after voluntary leave are also automatic under current authorization.
- Use configurable All Members/Creator Only addition permission, voluntary self-leave, reused sequence-floor history protection and inactive retained final-member groups. The original active creator may configure addition permission until their first departure; departure permanently switches the group to All Members without transfer; members can remove only themselves, with no administrator, owner, manager, succession or peer-removal role. Former members have no in-app rejoin-request or self-rejoin flow; any private request for a new invitation remains subject to normal DM authorization.
- Preserve the three-person messaging-group creation minimum and 50-member maximum. Below three eligible active members, retain history/membership, allow authorized additions and self-leave, and disable genuinely new group messages with a generic explanation. Reject invalid creation/addition batches atomically rather than silently excluding students; do not disclose which privacy, block or authorization restriction caused failure.
- Apply bilateral blocks between the actual adding/inviting member and each target. Independent third parties may add/invite students who have blocked one another if all other eligibility/privacy/consent requirements pass. Only the blocker receives a private, deduplicated shared-group warning in the notification interface and a dismissible group-view banner with a leave action; no warning or block direction is exposed to other members. Direct messaging and general profile restrictions remain unchanged.
- Expose private members' display names, profile pictures and basic identity only to authorized active group-chat members; preserve historical message attribution without exposing full profiles.
- Keep Study Buddy acceptance and exact verified offering scope; isolate pending invitees from member-only information, remove active membership/availability on leave, and preserve remaining members' existing tasks/notes and group data. Retain the existing final-member deletion allowance without archives or contribution recovery; pending-only departure edge cases require explicit resolution before implementation.
- Enforce every supported and legacy database path; provide privacy notices, read-only explanations, and comprehensive authorization/concurrency regression coverage.

## Capabilities

### New Capabilities

- `student-profile-privacy`: Reversible discoverability, contextual profile access, defaults, notices, and preserved academic functionality.
- `student-communication-authorization`: Mutual DM preferences, blocking, preserved history, migration, and common authorization boundaries. Extends implemented but unsynchronized direct-messaging and friendship capabilities without duplicating their persistence/UI contracts.
- `private-student-collaboration`: Private voluntary Study Buddies participation, any-accepted-member invitations within eight-person capacity, verified offering acceptance, actor-target block checks, automatic messaging additions/re-additions, minimum-size send restrictions and simple departure. Extends implemented but unsynchronized study/group capabilities.

### Modified Capabilities

- `classmate-discovery`: Verified offering scope, private/blocked target exclusion, and accurate visibility explanations replace historical across-section discovery and deferred privacy controls.

## Impact

- Supabase: additive settings, directed blocks, reused group memberships and message-sequence boundaries, authoritative Study offering/inviter provenance and owner-only warning acknowledgement; RPC/helper/grant/RLS review; legacy entry-point retirement or equivalent enforcement; preserved data and manual deployment.
- React: account/profile/onboarding, discovery, friendship dialogs, Study Buddies invitation acceptance, Messages automatic additions, read-only/block/leave controls, refresh and notification state.
- Express avatar endpoints and service-role resolvers must apply the same contextual authorization.
- Tests: fresh full-migration SQL suites, mutation concurrency, client/server authorization and lifecycle tests, academic/group regressions, managed Realtime acceptance.
- Historical changes remain untouched. This change explicitly supersedes earlier new-DM-only, original-creator-only management, mandatory public participation, private-by-default onboarding, and no-profile-opt-out behavior. Reconcile unsynchronized prerequisite specs before future sync/archive; artifact completion is not deployment or implementation.

## Review status

Stage 3 supersedes the previous prohibition on third-party admission of blocked pairs and the section-only/no-professor Study rule. It includes ongoing invitations by any accepted Study member, eight occupied places including pending invitations, immutable actual-inviter provenance, private blocker-only warnings and the three-eligible-member group-send threshold. The prior Study/warning decisions are now resolved: preserve unknown legacy provenance without fabrication, honor eligible pending invitations after inviter departure/ineligibility with original-inviter restrictions, delete Study groups when no accepted members remain, and deduplicate private warnings by group/block episode with membership-episode rearming. Their implementation is deferred beyond Stage 3A. Stage 1-2B protections and completed work are retained. The later Stage 3A implementation authorization is limited to the messaging work below; this specification update does not authorize Study/warning implementation or hosted deployment.

Stage 3A implements only messaging membership permission selection/change, actor-target admission, self-leave, permanent creator departure and minimum-size send restrictions. Study Buddies, warnings, notification-bell integration and blocking UI remain later-stage work.
