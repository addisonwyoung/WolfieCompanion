# Design

## Context

See proposal.md for motivation. The consolidated product decisions supersede the earlier requirement that private students become public to create/join Study Buddies. No such restriction is retained here.

Current implementation anchors:
- `client/src/Profile.tsx` and `account.ts`: owner-saved optional sharing and `allow_new_dms`; stale name/major audience text.
- `202610240002_friend_directory.sql`: global eligible-student directory, direct discoverable-profile lookup, broad service-role avatar resolver. `server/src/friendPicture.ts` separately checks relationship profile access before resolving bytes.
- `202610230001_direct_messaging.sql`: canonical pair conversations, participant SELECT RLS, RPC-only writes, first-send recipient preference check, established-thread bypass, idempotent sends.
- `202610250001_semester_aware_enrollments.sql`: course-level membership accepts pending/rejected enrollment. `202611140001_professor_scoped_classmate_discovery.sql` uses verified current course/section/professor matching, but leaves earlier section RPCs available.
- `202611010002_section_scoped_study_groups.sql` and `202611010003_study_group_roles_and_tasks.sql`: Study Buddies acceptance, roles, availability and tasks; pending invitees currently see member names. The stored course/section context fits the revised section-only admission rule; no professor backfill is needed for Study Buddies.
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
| University-wide search/autocomplete | Public targets across all majors/courses; private targets excluded | No effect | Pair excluded |
| Recipient/Study section picker | Public eligible targets plus private accepted friends through relationship exception; Study candidates must share selected section | No effect | Pair excluded |
| Accepted-friend profile | Contextual access retained; field sharing still applies | No effect | Denied outside retained group/history context |
| Existing DM history | Participant access retained; no general profile grant | Read remains available | Read remains available |
| DM send, new or established | New private target needs an authorized existing relationship; private sender may intentionally contact authorized public target | Both preferences must permit relationship | Denied both ways |
| Study Buddies create/accept | Allowed without becoming public | No effect | New admission cannot introduce blocked pair |
| Study invitation to private student | Private friend in selected verified section can appear in existing picker; acceptance required | No effect | Denied |
| Messaging addition | Any active member can add public students or authorized private friends; normal admission automatic; former voluntary leavers require acceptance | Separate group consent applies | Check all resulting active pairings |
| Existing group participation | Retained, including minimal member identity | DM settings do not apply | Retained shared interaction exception |
| Group leave | Always voluntary for eligible members, including private members and creator | No effect | No effect |
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

### 4. Preserve section-based Study Buddies

Keep the course section -> one to seven classmates -> group name -> create/send invitations structure in `StudyGroups.tsx`. Do not turn Study Buddies into a university-wide group picker. Use verified current-semester course-section membership, not professor matching, for creation, candidate results and acceptance. Public classmates need no friendship. Add private accepted friends from the same section to the same selection interface through a caller-derived friendship exception; do not expose private non-friends through enrollment, autocomplete or copied IDs. A separate friends-only workflow is not required. Private creators can participate without changing privacy.

Revalidate section, eligibility, privacy/friend exception and newly introduced block conflicts at admission. Accepted members continue after course/privacy changes. Pending invitations survive privacy changes without auto-admission and return only minimal invitation metadata, not names of other members, availability, roles or tasks. Decline remains generic. Existing legacy groups retain accepted access; groups with known section use section verification, not guessed professor context. A legacy course-only group must obtain valid section context before new admission; do not broaden admission to all students in that course. Study ownership/role/task permissions remain unchanged: the ownerless requirement applies to messaging groups only.

### 5. Member-managed messaging and recipient selection

Preserve `GroupPicker.tsx` layout, optional name, selections, retry behavior and paging. Change labels from friends to students. Friend suggestions are convenience ordering, not authorization. Query bounded public-student results university-wide (no major/course/section/friendship filter), union with the caller's authorized private accepted friends, deduplicate by UUID and paginate deterministically. Do not fetch all private profiles and filter in React. Existing `friend_directory` excludes friends, so it cannot alone supply the complete recipient set.

Any eligible active member may invoke candidate/add/invite operations. `creator_id` remains historical attribution only; do not add manager metadata or succession. All new writes and legacy creator-only functions must use active membership plus the approved operation, never creator identity. No friendship is created by group admission; no DM preference gates participation. Preserve two selected recipients plus creator for creation (3 initial people), at least one for later additions, and 50 active members. Keep independent group-addition consent, migrated from the old boolean; disabled consent rejects automatic admission and invitations, without affecting existing participation.

First-time admissions are automatic, including authorized private friends; privacy alone does not require acceptance. Eligibility, visibility authorization, independent group-addition consent, capacity and blocking still apply. Record whether a target voluntarily left this same group; re-add then creates a pending invitation, not an active membership, even for public friends. A current active member must invite them; there is no self-rejoin or in-application request-to-rejoin operation. A former member can privately ask a current member for an invitation only when normal mutual DM authorization permits that communication; departure or shared history grants no DM exception. Acceptance revalidates inviter active membership, candidate public/private-friend authorization, account eligibility, separate consent, capacity and blocks against every active member. Pending invitations neither grant content nor reserve membership/capacity; recheck capacity under the group lock. No new blocked pairing is allowed; pre-existing blocked co-members do not veto unrelated safe additions. Use generic errors without naming the blocking party.

The earlier private-first-add acceptance exception is superseded. Explicit acceptance applies when re-adding someone who voluntarily left this same group, regardless of privacy or friendship. Mixed automatic/pending batches must report actual active and pending results honestly. Do not change the minimum creation rule through an implicit pending-only creation exception.

### 6. Voluntary departure, history and inactive groups

Remove messaging succession, ownership transfer and creator-only invitations. Preserve membership episodes/voluntary-leave records instead of deleting the only evidence that someone opted out. Under the group lock end active membership, close its authorized history window, remove active read-position/inbox eligibility and update metadata. Keep message IDs and historical author identity. New/rejoining membership receives a fresh current sequence floor, preserving the previous approved restriction against restoring pre-rejoin history as well as absence history. Never overwrite a leave record when re-adding: otherwise repeated additions bypass consent.

Final-member departure marks the group inactive, cancels pending invitations, retains history without active client access, and denies sends/admissions via all RPC/table/event paths. Only active members of a live group can invite, so an empty group cannot be revived by a former creator, copied ID or stale receipt. Creator departure from any nonempty group requires no transfer. Repeated leave is safe without disclosing unrelated groups. Revocation must clear cached history/drafts and ignore late responses. Members may remove only themselves. Retire or revoke the creator-only peer-removal RPC and remove its UI controls; do not replace them with equal peer-removal permissions. No administrator, owner, manager or removal role is introduced. Any retained legacy removal signature must reject attempts to remove another person, including by the original creator.

New members receive only messages after automatic admission or accepted re-add. Apply membership boundaries to direct SELECT RLS, RPC history/catch-up, previews, unread and realtime, not just rendered messages. Preserve historical data and exact retry receipts without allowing stale retries to resurrect membership or inactive groups.

### 7. Blocks, atomicity and legacy entry points

Block RPC atomically inserts the directed block, deletes accepted friendship and invalidates pending friendship requests. Unblock removes only the caller's direction, restores nothing, and leaves a reverse block effective. Block/unblock controls belong in authorized profile/DM views and an owner-only block management view so a hidden target can still be unblocked. No notification announces a block; generic unavailability can still allow inference. Preserve shared groups and historical identity. Invites involving a newly blocked pair cannot admit; never auto-accept them later.

Use canonical pair locks shared by block, friend send/accept and DM writes; lock profile rows in stable order for settings/admission. Group mutations share the group lock and recheck membership after acquiring it. Define one lock order for combined group/profile/pair operations, then test concurrent block, settings, accepts, leaves and sends for deadlocks and stale authorization. The implementation must establish serialized order: revocation ordered before a mutation's authorization point prevents its commit; earlier committed messages cannot be recalled.

Audit function overloads and ACLs from the final migrated catalog. Includes directory and discoverable/friend/classmate profiles; course/section/professor discovery, recommendations and relationship projections; friend send/respond; both avatar resolver families; Study Buddies create/respond/list; DM state/send/history/inbox; group candidate/create/add/invite/accept/leave/remove/detail/history/send; combined inbox/unread and table/event access. Retire unsafe legacy signatures or make them equally restrictive. Security-definer RPCs bypass ordinary RLS, so table policies alone are insufficient. Service-role avatar resolvers must recheck authorization and current sharing, not merely trust earlier Express checks. Keep raw profile ownership and denied direct message writes intact.

### 8. Client, notifications and acceptance testing

Use existing polling/focus/event infrastructure, with immediate actor-side invalidation after preference, block, invitation or leave actions. Re-fetch permission state on focus/reconnect and messaging's visible polling; no peer-readable profile/block publication is required. Clear revoked directory/profile/picker results and group caches; reject late responses across contexts/accounts. Render retained DM history with safe read-only explanations and preserve unsent drafts without automatic delivery. Invitations have their own minimal pending state; never fabricate unread message counts.

Denied writes create no new message event, preview, unread increment or notification. Keep pre-existing DM unread/read positions as historical state; do not manufacture new alerts upon restriction/unblocking. Shared-group notifications continue for entitled members, including blocked pairs. Existing RLS supports authorized historical DM reads and membership/post-join group reads; do not add a blanket block filter that erases retained history. Verify deployed subscriptions with unrelated users and pending invitees, not just mocked client filters.

## Risks / Trade-offs

- Shared-group interactions permit indirect contact between blocked students -> explicit notices, voluntary leave, no new blocked-pair admissions; no claim of full isolation.
- Historical messages/tasks and delivered pictures retain identity -> preserve authorship as approved and explain that privacy is not erasure.
- Pending preview leaks -> separate pending storage/projections from active membership and never return full roster/content.
- Legacy course-level checks allow pending/rejected enrollment -> replace new-contact use with verified offering checks and audit every surviving overload.
- Automatic admission racing consent, leave or block changes -> common locks, bounded retries, stable receipts and current active-membership rechecks.
- Deleting membership loses evidence of voluntary departure -> preserve episodes and leave reasons so consent-based re-add cannot be bypassed.
- Cached UI may briefly show previously delivered identity -> clear on known revocation and refresh; server remains authoritative at every read/write boundary.
- Old specs describe superseded behavior -> explicit new contracts, prerequisite reconciliation at later sync; no historical artifact rewrites.

## Migration Plan

1. Prepare one or more owner-reviewed additive migrations; do not execute them from the app. Add settings, block/conditional invitation data and membership history without deleting histories or replacing IDs. Capture row-count/ID/read-position checks.
2. Within a controlled transaction backfill all existing profiles `is_private=false`; keep the default for subsequently created profiles false. Update profile-creation triggers/onboarding to explain public visibility and offer voluntary private mode; never overwrite an explicit later private choice. Lock/order concurrent signup appropriately.
3. Backfill `allow_new_dms=true` to `eligible_students`, false to `no_one`; copy the old boolean independently to `allow_group_additions`. New-account DM default remains `eligible_students` and group consent enabled, with normal automatic admission and mandatory acceptance after a voluntary leave; first-time private-friend additions are automatic under the same checks. Existing false users must be told that existing DMs now become read-only; no exact legacy semantic mapping exists.
4. Preserve creator IDs as attribution only, initialize active membership episodes, retain accepted study memberships and their section context, and ensure legacy course-only study invitations cannot bypass section checks. Historical voluntary departures may not be reconstructible from current deleted membership rows: inspect available audit evidence and document the migration coverage limit; never fabricate leave reasons.
5. Install all helpers/RPC/policy/grant changes together before exposing new UI. Coordinate client cutover: reject obsolete setting writes with an actionable refresh/update error instead of accepting two sources of truth. Retire the old boolean only once all dependencies and supported clients use canonical settings; no legacy RPC may retain bypass authority during transition.
6. Deploy client/server UI and notices. Verify fresh migration plus upgrade fixtures, client/server tests, lint/build, desktop/phone flows, then owner-run managed Auth/Realtime checks. Record hosted deployment separately from local fixtures.
7. Rollback uses a compatible maintenance/read-only experience while retaining settings, blocks, invitations, memberships, messages and IDs. Do not restore old permissive RPCs, remove block enforcement or reset explicit private choices as routine rollback. Prefer forward fixes to destructive schema rollback.

## Review status and verification limits

The previously open private-first-add and peer-removal questions are resolved: first-time authorized private friends join automatically; no member can remove another member. No group-chat product decisions remain unresolved. Preserve durable internal membership episodes and voluntary-leave history without making that history a general student-discovery surface or granting former members content access. Historical departure data absent from the existing schema remains a migration evidence limitation, not permission to invent past membership or waive future acceptance checks. Exact migration filenames, catalog signatures and hosted publication configuration require verification during implementation/deployment. This documentation does not authorize apply.
