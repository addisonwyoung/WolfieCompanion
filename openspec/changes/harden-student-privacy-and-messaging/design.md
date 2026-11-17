# Design

## Context

See proposal.md for motivation. The consolidated product decisions supersede the earlier requirement that private students become public to create/join Study Buddies. No such restriction is retained here.

Current implementation anchors:
- `client/src/Profile.tsx` and `account.ts`: owner-saved optional sharing and `allow_new_dms`; stale name/major audience text.
- `202610240002_friend_directory.sql`: global eligible-student directory, direct discoverable-profile lookup, broad service-role avatar resolver. `server/src/friendPicture.ts` separately checks relationship profile access before resolving bytes.
- `202610230001_direct_messaging.sql`: canonical pair conversations, participant SELECT RLS, RPC-only writes, first-send recipient preference check, established-thread bypass, idempotent sends.
- `202610250001_semester_aware_enrollments.sql`: course-level membership accepts pending/rejected enrollment. `202611140001_professor_scoped_classmate_discovery.sql` uses verified current course/section/professor matching, but leaves earlier section RPCs available.
- `202611010002_section_scoped_study_groups.sql` and `202611010003_study_group_roles_and_tasks.sql`: Study Buddies acceptance, roles, availability and tasks; pending invitees currently see member names. No professor identity is stored on study groups.
- `202610250001_group_messaging.sql` and `202610250002_group_member_removal.sql`: immediate creator-controlled friend additions, join sequence floors, membership SELECT RLS, creator-only removal, no self-leave. `creator_id` is authority as well as attribution.
- `useMessaging.ts`, `useFriendships.ts`, `Friends.tsx`: event/focus refresh and messaging polling, but cached directory/profile/picker results need invalidation. Existing historical SQL suites sometimes reinstall old functions; a full-migration integration suite is essential.

Durable OpenSpec currently lacks synchronized DM/friendship/study/group capabilities. Preserve historical changes and reconcile their older release contracts during later sync/archive; this proposal adds cross-cutting contracts rather than copying entire unsynchronized features. Hosted schema and managed Realtime were not inspected or tested during planning.

## Goals / Non-Goals

**Goals:** Caller-derived database authorization, preserved historical data and voluntary collaboration, coherent contextual visibility, race-safe revocation and admission, reversible preferences, safe manual migration.

**Non-Goals:** New messaging infrastructure, attachments, moderation/reporting, account-deletion retention redesign, retroactive erasure of delivered data, or hiding shared-group interactions between blocked members. Do not alter eligibility or academic enrollment ownership to implement discoverability.

## Decisions

### 1. Behavior matrix and authorization precedence

| Operation | Private mode | DM preferences | Either-direction block |
|---|---|---|---|
| General search/classmates/recommendations/invitation candidates | Target excluded; private caller can browse public targets | No effect | Pair excluded |
| Accepted-friend profile | Contextual access retained; field sharing still applies | No effect | Denied outside retained group/history context |
| Existing DM history | Participant access retained; no general profile grant | Read remains available | Read remains available |
| DM send, new or established | New private target needs an authorized existing relationship; private sender may intentionally contact authorized public target | Both preferences must permit relationship | Denied both ways |
| Study Buddies create/accept | Allowed without becoming public | No effect | New admission cannot introduce blocked pair |
| Study invitation to private student | Accepted-friend interface plus verified offering; explicit acceptance | No effect | Denied |
| Messaging invitation to private student | Accepted-friend interface; explicit acceptance | Separate group consent applies | Check every active member at acceptance |
| Existing group participation | Retained, including minimal member identity | DM settings do not apply | Retained shared interaction exception |
| Group leave | Always voluntary for eligible members, including private manager | No effect | No effect |
| Personal academic features | Unchanged | Unchanged | Unchanged |

All operations retain existing caller/account eligibility. Shared context grants minimal identity, not unrelated profile, optional fields, avatar paths, or enrollment data. Historical authorship can remain after departure. An invitation may reveal minimal inviter identity/group label as intentional contact, never roster, availability, tasks, messages, or private-status flags.

### 2. Separate policy predicates and owner settings

Add `is_private boolean`, constrained `dm_permission` text (`eligible_students`, `friends_only`, `no_one`), and `allow_group_additions boolean` to owner settings. Keep optional sharing independent. Add directed block rows keyed by blocker/blocked, self-block denial, and reverse-lookup indexing. Only owners can inspect their block lists; narrowly granted block/unblock RPCs perform compound mutations.

Keep trusted eligibility and offering membership helpers independent of privacy. Implement separate predicates for general discovery, contextual profile access, block existence, verified shared offering, DM sendability, and group admission. Do not change `private.is_eligible` or make a private student fail enrollment membership checks. Prefer shared predicates over copying privacy clauses into every RPC, while preserving caller-derived policy execution and empty search paths for security-definer functions. Anonymous clients and arbitrary caller-id helper execution remain denied.

### 3. Mutual DM permission and established-contact semantics

For every new insertion: both accounts eligible, no block, authorized contact basis, and both preferences permit the pair. `no_one` denies all exchange; `friends_only` requires current accepted friendship; `eligible_students` accepts established thread, accepted friendship, pending friend request, or verified current shared course/section/professor. A supplied UUID or directory listing alone does not establish contact. Private first-contact recipients require accepted friendship or an intentional pending-request context; ordinary classmate enumeration cannot target them. A private sender may intentionally message a public authorized classmate, disclosing minimal sender identity in that conversation.

An established thread remains a contact basis after course/friendship loss, but cannot bypass either preference or blocking. History, inbox and read positions remain participant-authorized even when sending is denied. Keep one thread per pair and original IDs. Contact-state and send use the same predicate; return safe reason categories (own preference, friendship required, contact unavailable) without revealing someone else's block direction/private state. The blocker can see their own block reason. Existing read-only chats remain openable.

Mutual authorization was chosen over incoming-only to avoid unanswerable outbound messages and make read-only a conversation-wide state. Explain this in settings. Rechecking the recipient only would contradict the approved mutual model.

Retain current text limits, server sequence assignment and exact request retries. A replay confirming an already stored message is not a new send; it may acknowledge only the same participant-owned message without inserting, advancing activity, or granting extra data. A previously uncommitted request must pass current authorization. Never auto-resend after unblocking or a setting change.

### 4. Private voluntary Study Buddies participation

Store validated course/section/professor offering context on new groups. Use verified current-semester matching for creator, initial invitees, later invitation issuance and acceptance. Public targets remain available through permitted classmate discovery. Private targets are inviteable only through accepted-friend contextual actions, not a general candidate dropdown; verified offering matching is still mandatory. Creating a group is explicit consent by its creator, private or public. Other students remain pending until acceptance. Preserve the existing group-size and scheduling/task behavior.

Revalidate invitee eligibility, current offering and private-target friendship route, and blocks against all accepted members at acceptance. A pending invitation that predates privacy remains pending; privacy alone does not invalidate it. Private targets must have the friendship exception when accepted. Decline is allowed without satisfying admission prerequisites and reveals no private status. Pending previews contain only safe invitation metadata, not member names or collaboration data. Accepted memberships continue after privacy, friendship or course changes, subject to existing eligibility.

Old groups lacking professor context retain accepted participation; do not guess a professor or silently grandfather new admission using course-only checks. For outstanding legacy invitations, resolve a unique verified offering shared by inviter and invitee in the stored course/section; if ambiguous, request an authorized offering choice before acceptance. If no valid context exists, keep the invitation non-admitting until valid or declined. This is a safe compatibility fallback, not a requirement to become public.

### 5. Messaging invitations and independent group consent

Keep current accepted-friend automatic additions for public students when their separate group-addition consent is enabled. Private students use invitations through accepted-friend profiles. Pending invitation rows are separate from active memberships and read-position floors. Store group, inviter, invitee, status, and a retry identity; enforce unique outstanding invitation per group/target and restrict reads to the intended parties with minimal projections. Only the current manager may initiate messaging-group additions/invitations; a friend profile selects a group the caller manages.

At acceptance revalidate current manager authority of the inviter, accepted friendship, both accounts' eligibility, invitee group consent, capacity, and blocks between invitee and every active member. Keep a pending invitation non-admitting if inviter authority disappears; do not grant legacy creator authority. Decline remains generic. Policy revocation between selection and commit must fail safely. Public-to-private change before an automatic addition rejects that addition and requires invitation consent; private-to-public change never auto-accepts a pending invitation.

For creation with private invitees, allow a group with creator plus pending invitations when the submitted creation meets the existing three-person intended size. Pending people do not count as active members or gain content access. The group can temporarily have fewer than three accepted members, consistent with existing groups persisting below creation size. Refused/declined invitations never automatically delete historical data. Acceptance establishes sequence floor at the current last sequence, so only later messages are accessible through history, direct SELECT, previews, unread and events.

Reject new blocked pairings at creation, direct addition and acceptance. Existing blocked pairs already in the group do not prevent an unrelated addition unless that addition introduces a new blocked pair. Group consent controls receiving additions/invitations, not a creator's deliberate creation or existing participation. No DM preference gates group participation.

### 6. Self-leave and management succession

Preserve `creator_id` as immutable historical metadata; add nullable `manager_id` for active authority and initialize it from eligible active creators. All management RPCs/UI, including legacy paths and candidate lookups, must use active manager authority. Leaving deletes active membership/read position, retains messages, updates metadata and revokes all group access. Repeated leave is safe without revealing unrelated groups.

Under the group lock choose the earliest `joined_at`, then UUID, among remaining eligible active members; privacy alone cannot exclude them. If none eligible remain, set manager null, retain existing eligible-access rules, and choose the earliest eligible active member on a later authorized refresh/mutation when eligibility returns. Do not transfer to pending invitees. If no active members remain, mark the group abandoned, cancel pending invitations and retain data without client access; no old invitation, creator metadata or retry receipt can resurrect it. Rejoining a live group requires normal checks and a fresh acceptance/addition floor, hiding both previous tenure and absence history as current readdition already does. Original creator receives no residual management power.

### 7. Blocks, atomicity and legacy entry points

Block RPC atomically inserts the directed block, deletes accepted friendship and invalidates pending friendship requests. Unblock removes only the caller's direction, restores nothing, and leaves a reverse block effective. Block/unblock controls belong in authorized profile/DM views and an owner-only block management view so a hidden target can still be unblocked. No notification announces a block; generic unavailability can still allow inference. Preserve shared groups and historical identity. Invites involving a newly blocked pair cannot admit; never auto-accept them later.

Use canonical pair locks shared by block, friend send/accept and DM writes; lock profile rows in stable order for settings/admission. Group mutations share the group lock and recheck membership after acquiring it. Define one lock order for combined group/profile/pair operations, then test concurrent block, settings, accepts, leaves and sends for deadlocks and stale authorization. The implementation must establish serialized order: revocation ordered before a mutation's authorization point prevents its commit; earlier committed messages cannot be recalled.

Audit function overloads and ACLs from the final migrated catalog. Includes directory and discoverable/friend/classmate profiles; course/section/professor discovery, recommendations and relationship projections; friend send/respond; both avatar resolver families; Study Buddies create/respond/list; DM state/send/history/inbox; group candidate/create/add/remove/detail/history/send; combined inbox/unread and table/event access. Retire unsafe legacy signatures or make them equally restrictive. Security-definer RPCs bypass ordinary RLS, so table policies alone are insufficient. Service-role avatar resolvers must recheck authorization and current sharing, not merely trust earlier Express checks. Keep raw profile ownership and denied direct message writes intact.

### 8. Client, notifications and acceptance testing

Use existing polling/focus/event infrastructure, with immediate actor-side invalidation after preference, block, invitation or leave actions. Re-fetch permission state on focus/reconnect and messaging's visible polling; no peer-readable profile/block publication is required. Clear revoked directory/profile/picker results and group caches; reject late responses across contexts/accounts. Render retained DM history with safe read-only explanations and preserve unsent drafts without automatic delivery. Invitations have their own minimal pending state; never fabricate unread message counts.

Denied writes create no new message event, preview, unread increment or notification. Keep pre-existing DM unread/read positions as historical state; do not manufacture new alerts upon restriction/unblocking. Shared-group notifications continue for entitled members, including blocked pairs. Existing RLS supports authorized historical DM reads and membership/post-join group reads; do not add a blanket block filter that erases retained history. Verify deployed subscriptions with unrelated users and pending invitees, not just mocked client filters.

## Risks / Trade-offs

- Shared-group interactions permit indirect contact between blocked students -> explicit notices, voluntary leave, no new blocked-pair admissions; no claim of full isolation.
- Historical messages/tasks and delivered pictures retain identity -> preserve authorship as approved and explain that privacy is not erasure.
- Pending preview leaks -> separate pending storage/projections from active membership and never return full roster/content.
- Legacy course-level checks allow pending/rejected enrollment -> replace new-contact use with verified offering checks and audit every surviving overload.
- Larger invitation flow and manager succession increase concurrency complexity -> common locks, bounded retries, stable receipts, race tests and active-authority rechecks.
- No eligible successor while active accounts remain -> managerless retained state with deterministic recovery; never select an ineligible account or delete content.
- Cached UI may briefly show previously delivered identity -> clear on known revocation and refresh; server remains authoritative at every read/write boundary.
- Old specs describe superseded behavior -> explicit new contracts, prerequisite reconciliation at later sync; no historical artifact rewrites.

## Migration Plan

1. Prepare one or more owner-reviewed additive migrations; do not execute them from the app. Add settings, block/invitation data and manager metadata without deleting histories or replacing IDs. Capture row-count/ID/read-position checks.
2. Within a controlled transaction backfill all existing profiles `is_private=false`; then set the default for subsequently created profiles to true. Update profile-creation triggers/onboarding so inserts cannot accidentally inherit the migration default. Lock/order concurrent signup appropriately.
3. Backfill `allow_new_dms=true` to `eligible_students`, false to `no_one`; copy the old boolean independently to `allow_group_additions`. New-account DM default remains `eligible_students` and group consent enabled, with private invitations requiring acceptance. Existing false users must be told that existing DMs now become read-only; no exact legacy semantic mapping exists.
4. Initialize manager metadata from active membership, preserve creator IDs, retain existing accepted study memberships, and leave unresolved legacy offering context safely non-admitting for new joins.
5. Install all helpers/RPC/policy/grant changes together before exposing new UI. Coordinate client cutover: reject obsolete setting writes with an actionable refresh/update error instead of accepting two sources of truth. Retire the old boolean only once all dependencies and supported clients use canonical settings; no legacy RPC may retain bypass authority during transition.
6. Deploy client/server UI and notices. Verify fresh migration plus upgrade fixtures, client/server tests, lint/build, desktop/phone flows, then owner-run managed Auth/Realtime checks. Record hosted deployment separately from local fixtures.
7. Rollback uses a compatible maintenance/read-only experience while retaining settings, blocks, invitations, memberships, messages and IDs. Do not restore old permissive RPCs, remove block enforcement or reset private defaults as routine rollback. Prefer forward fixes to destructive schema rollback.

## Open Questions

No unresolved product decisions block this proposal. Exact migration filenames and catalog signatures are implementation verification details. Confirm actual hosted migration inventory and publication configuration before deployment; repository planning does not establish hosted state.
