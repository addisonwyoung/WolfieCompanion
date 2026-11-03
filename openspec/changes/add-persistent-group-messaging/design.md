# Design

## Context

See proposal.md for motivation and specs/group-messaging/spec.md for the behavior contract. The current checkout is main with a clean working tree before this planning change. No implementation edits belong to this propose workflow.

Observed implementation:

- `dm_conversations` encodes exactly two canonical participants, with unique pair identity and participant SELECT RLS. `dm_messages` and `dm_read_positions` use that pair boundary. Changing these tables into polymorphic group containers would risk existing direct histories and old client RPCs.
- `Messages.tsx` combines inbox and chat markup. `Target` identifies a peer/course; `useDirectChat` validates every sender against exactly the viewer and peer. This ownership check cannot simply be relaxed for groups.
- `MessagingNotifications.tsx` remains mounted across the authenticated workspace, while `messagingUnread.ts` calls DM-specific count/read RPCs. `useMessagingRefresh` currently listens only to the two DM event tables and polls visible views every 10 seconds.
- `FriendApi.friends(courses, signal)` unions course-scoped `friends_in_course` results. `friend_directory` intentionally excludes existing friends. Neither supplies a complete, independently paginated picker of accepted friends across all courses.
- `friendships` has a canonical pair key; `unfriend` deletes that row. Profile updates already lock the owner row, allowing additions to serialize against availability saves. Existing account eligibility is derived from trusted Auth users/Google identities.
- Current UI uses wide low-height bubbles, burgundy/pale pink colors, hour/minute timestamps, sender labels, Enter-to-send, Shift+Enter newline, an IME guard, and a compact send icon. Existing SQL, hook/App, and native-browser tests provide the direct-chat regression baseline.
- Main specs do not yet contain direct-messaging or friendship capabilities; completed prerequisite change artifacts describe their contracts. Reconcile those before future archive/sync. Their original exclusion of group chats is historical scope, not a prohibition on this new capability.

## Goals / Non-Goals

**Goals:** Reuse the visible chat components and reliability patterns while introducing a separate group authorization boundary; serialize message/join ordering; make every data path enforce post-join privacy; combine inbox and unread results without breaking existing DM RPCs; keep migration ownership and rollback explicit.

**Non-Goals:** No conversion of direct chats into groups, invitations/acceptance, leaving, owner transfer, renaming after creation, group pictures, public group discovery, attachments, message edits/deletion, sender-visible read receipts, push/email notifications, or new backend/service credentials. Account retention redesign is outside scope; define safe FK behavior below without changing existing DM deletion behavior.

## Decisions

### 1. Add group-specific persistence; preserve DM tables

Use the next unused additive migration after the installed messaging/unread and friendship/directory migrations (currently through `202610240002_friend_directory.sql`; recheck the filename during apply).

Proposed tables:

- `group_conversations`: generated UUID, nullable `creator_id` Auth FK, optional trimmed name (1–80 code points), created/activity timestamps, a membership metadata revision, and nonnegative `last_sequence`.
- `group_members`: unique `(group_id,user_id)`, joined timestamp, immutable `joined_after_sequence`, and private monotonic `last_read_sequence` initialized to that floor. Initial members have floor zero. Group and Auth member FKs cascade; read positions must not be directly exposed to peers.
- `group_messages`: generated UUID, group FK, positive sequence, nullable server-derived sender Auth FK, attempt UUID, literal body, server timestamp; unique `(group_id,sequence)` and `(sender_id,client_message_id)`. Index `(group_id,sequence)` for history and unread reads and `(user_id,group_id)` for membership lookups.
- Private mutation receipts: creator/request UUID plus operation kind and canonical payload (name/member IDs/group ID), confirmed group ID/result, for exact replay of creation/addition. Revoke all client table access. These receipts must not expose group metadata to outsiders.

Account deletion removes that account's membership/read position; sender FK becomes null so remaining members retain entitled text with an unavailable-sender label; deleting the creator nulls ownership so remaining eligible members can continue but nobody acquires addition privileges. Creation requires three members, not a lifetime minimum: subsequent Auth deletions do not delete or convert the group. No account-delete UI or retention policy is introduced.

Alternative: generalize `dm_conversations` in place. Rejected because canonical-pair constraints, current RLS and old RPC clients assume exactly two participants. Additive group tables isolate the new boundary and preserve working direct chats.

### 2. Create and add through authenticated atomic RPCs

Proposed RPC surface (final SQL signatures documented during apply):

| Operation | Contract |
| --- | --- |
| `group_friend_candidates` | Caller-derived accepted friends across courses; keyset pages up to 50 ordered by name/UUID; optional bounded search; minimal UUID/name/major and selectable/unavailable indication for already-known friends; existing members excluded when a creator supplies a group |
| `group_create` | Optional name, 2–49 distinct other UUIDs, creation attempt UUID; returns confirmed group detail; creator included automatically; all-or-nothing |
| `group_add_members` | Group UUID, distinct nonmember UUIDs, addition attempt UUID; creator-only, all-or-nothing; returns confirmed membership result |
| `group_detail` | Member-only group identity, minimal current member list/roles, viewer's join floor, own read position and send eligibility; no peer read positions or optional profiles |
| `group_send_message` | Group UUID, body, message attempt UUID; returns confirmed sequenced row |
| `group_history` | Group UUID with exclusive before/after sequence cursors and limit <=50; returns only viewer-entitled rows ascending by sequence with minimal sender identity |
| `group_mark_read` | Member-only valid visible sequence; monotonic update of own position |

Creator friendships are the sole addition boundary. Invitees need not know one another, have the same courses, or have a pending invitation. A creator's own new-DM setting does not prevent initiating a group; each other person's preference controls whether that person can be newly included. Once joined, that setting and friendship/course changes do not revoke membership. Group sending requires current caller eligibility/membership, not every other member's current eligibility; an ineligible account cannot read/send, and must not block the remaining group.

Creation/addition receipts are checked under a creator/request transaction lock. An exact committed retry returns its stored result before revalidating requirements for a *new* mutation; changed payload/key reuse fails. Fresh attempts validate UUIDs, distinctness, size, normalized name, eligibility, accepted friendship, and availability, then lock invitee profiles in UUID order and canonical friendship rows with a lock that conflicts with deletion. This serializes closure and unfriending: if either wins before validation, reject; if addition wins, later closure/unfriending preserves existing membership. Additions also lock the group row first, verify original creator identity, and count current members under that lock. Serialize every group send under the same group row lock.

Creation inserts the group and all memberships together, even without a first message. This is an explicit group creation action, unlike merely opening an existing DM composer. A Cancel/Close action performs no database write. Successful repeated creation with a *new* request UUID intentionally permits a separate group with the same membership; no unique-member-set constraint.

Alternative: picker-only friend/preference checks or partially successful batch additions. Rejected because stale results could admit unauthorized accounts and partial additions are difficult to explain and retry safely.

### 3. Use sequence floors as the post-join security boundary

When an addition holds the group lock, set each new membership's floor to current `last_sequence`, then commit membership. A send allocates `last_sequence+1` under that same lock. A message concurrent with an addition therefore falls deterministically before or after the join. Timestamps alone are unsuitable because transaction timing/precision can blur ordering.

For the viewer, message access is `sequence > joined_after_sequence`. Apply this predicate in:

- Group message SELECT RLS, not just RPC/UI filtering.
- Latest, older and catch-up history; cursors must belong to this group and be inside visible history (the exact join floor is allowed as an after-cursor only).
- Inbox last-message body/time and activity ordering; use the viewer's joined timestamp when no post-join message exists, with a neutral no-messages-since-joining preview. Never reuse a global last-message body for a late member.
- Incoming unread calculation and mark-read validation.
- Postgres Changes message authorization through the same RLS; never put message bodies or previews into globally visible group metadata events.

Use a narrow security-definer helper for caller-derived eligible membership/floor to avoid recursive RLS between group and membership tables. Only helpers actually needed by authenticated policy evaluation receive authenticated execute; they accept no arbitrary caller identity and return no outsider metadata. Revoke public/anonymous execution, fix search paths, and keep remaining helpers inaccessible. Deny direct client writes everywhere. Membership detail may list participants' minimal identity but must not expose other people's `last_read_sequence`; use a dedicated projection/RPC rather than granting unrestricted membership SELECT.

No pre-join backlog is fetched then hidden. Joined-member unread starts at the join floor; group creation/addition alone does not fabricate an unread text count. Existing members retain their own earlier permitted history.

### 4. Add typed unified projections without changing legacy DM RPCs

Introduce `messaging_inbox` and `messaging_unread` RPCs that combine existing DM semantics with authorized group projections. Keep `dm_inbox`, `dm_unread`, `dm_mark_read`, send/history and direct-contact contracts intact for compatibility.

Inbox rows use a discriminated kind (`direct` or `group`), conversation ID, display name, optional direct peer ID, optional group member count, viewer-specific activity timestamp, optional preview and visible last-message time. Sort/cursor by `(activity,kind,id)` with limit <=50 across the combined set, including empty groups. Cursor authorization is kind-specific and validates paired fields; UUID alone is not authority. The union must call/derive the same existing DM authorization, including ineligible-peer placeholders and preference rules.

Unread rows also include kind. Internally key counts, active targets, React remounts, cached histories and acknowledgement maps by `kind:id` so a group UUID cannot collide with a direct-chat UUID. Extend mark-read dispatch to the appropriate RPC. If a group schema is absent, fall back to existing direct inbox/unread RPCs only for recognized missing-schema errors; ordinary network/auth failures remain retryable errors, not false empty success. Group controls show isolated setup guidance.

Alternative: load 50 direct and 50 group rows and sort them in the browser. Rejected because independent cursors can skip/interleave activity incorrectly and fail the single-page bound.

### 5. Reuse presentation while keeping authorization checks explicit

Extract shared conversation list/history/composer presentation from `Messages.tsx`, preserving the current CSS dimensions/colors and keyboard behavior. Keep direct/group adapters and entitlement validation explicit. Group messages identify their actual member sender; validate confirmed group ID, sequence, sender/request/body, and membership-aware identity projections rather than weakening `useDirectChat`'s two-person validation. An unavailable/deleted sender uses a neutral label.

New group opens an accessible selection dialog/panel from Messages. Offer optional name, searchable paginated friend checklist, selected-count feedback, a minimum-two-friends explanation, and explicit Create/Cancel. Disabled closed-to-new friends get a clear reason. Preserve draft selections/name on failure and stable request UUID/payload on unconfirmed writes; retries must not silently use changed selections. Discard abandons only memory and explains that a lost acknowledgement may already have created/updated the group. Query/refresh the confirmed server result before opening it; reconcile the inbox by ID.

Group header shows title/count, member list, and Add members for the creator only. Add members reuses friend selection but excludes current members and enforces remaining capacity; server authority remains mandatory. Close the picker before focusing chat, do not stack modal focus traps, and clear selection/draft/write identities on account replacement. Optional name defaults to a bounded readable member-based label; renaming later is not included. The 50-member cap is an explicit first-release bound, not a discovery limitation.

### 6. Extend synchronization and unread state to groups

Subscribe to protected group message INSERT and group metadata UPDATE events as invalidation, in addition to existing DM events. Creation/addition increments a safe metadata revision after inserting memberships within the transaction, so authorized members refresh group detail without publishing membership/read-position rows. Membership insertion must make an empty/newly joined group discoverable; visible polling catches missed events. Add the necessary group tables to `supabase_realtime` only when that publication exists. Subscription payloads are not trusted chat state; re-read authenticated projections. Do not publish/grant raw membership rows containing read positions merely to deliver events; safe metadata invalidation plus polling covers additions and empty-group discovery.

Group changes cannot clear another conversation's unread state. Own sends and pre-join rows are excluded. Mark only the latest actually loaded visible sequence when near the bottom; preserve New messages while reading older content. Failed acknowledgements remain unread until confirmed retry. Protect account/kind/group ownership, abort obsolete reads, ignore late writes and reconcile retries by sender/request/body. Bounded sequence catch-up loops until exhausted, preserving older scroll anchors and deduplicating IDs. Stop timers/channels while hidden and on teardown; refresh on open, focus, online/reconnect and every 10 visible seconds throughout the signed-in workspace.

## Risks / Trade-offs

- Pre-join leaks through alternate paths → sequence-floor RLS plus SQL tests of direct SELECT, previews, cursors, unread and managed Realtime event privacy; never trust UI filtering.
- Closure/unfriend/add/send races → deterministic lock ordering, group sequence allocation and transactional receipts, with actual multi-session local tests and timeouts.
- Combined inbox/notification regressions → keep legacy DM RPCs, typed kind-scoped state, one bounded union cursor, direct-chat regression suite and missing-schema compatibility tests.
- Creator-only additions/removals and no leave → clearly document the initial scope; do not imply mute/block/invitation controls. Existing members can include people not friends with each other, and only post-join history is shared.
- Large group metadata or group-list traffic → cap 50 members, friend/inbox/history pages <=50, narrow projections and indexed membership/sequence access; keep text out of metadata events.
- Privileged database operators retain access → participant RLS is not end-to-end encryption; no change to that existing trust model.

## Migration Plan

1. During apply, create the implementation branch if requested, inspect current migration inventory, and add the next unused group migration without modifying existing installed migrations.
2. Verify on a fresh disposable local PostgreSQL cluster with test Auth/Storage stand-ins and prerequisite migrations. Cover existing DM/unread/friend behavior, group authorization and privacy, pagination, idempotency and concurrent membership/send/preference/unfriend races. No shared Supabase SQL is executed by the implementation agent.
3. Add `docs/group-messaging.md` and update messaging/account/teammate instructions: exact RPC/error contracts, friend-only additions, group impact of the existing preference, post-join privacy, default scopes/limits, local commands, optional publication, missing-schema fallback, and two-step manual deployment.
4. Owner reviews and manually applies SQL, then deploys the client. Existing public Supabase configuration is sufficient; no new key/service. Test at least creator A, initial friends B/C, later friend D, and unrelated E using real managed sessions/devices. Verify earlier history/event denial for D, addition denial for E/non-creators/closed recipients, persistence, cross-device read positions, reconnect, and creator-disabled-DM versus recipient-disabled-DM behavior. Mark managed checks pending until actually performed.
5. Roll back the client first and, if needed, revoke only new group/combined RPC grants and group publication access through reviewed SQL. Retain all group/DM data and original policies/functions for recovery. Group removal from UI is not data deletion. Sync prerequisite profile/friend/direct-message specs before archiving this group capability.

## Member removal follow-up

The creator confirms individual removals from the Members list. A separate additive migration adds the creator-only `group_remove_member` RPC; deleting membership revokes existing caller-derived RLS and combined projections while retaining historical sender identities. No lifetime minimum applies. Removal updates group metadata, and clients refresh/poll to discard unavailable chat state. Send and removal serialize on the group row, with a second membership check after the send lock. Readdition creates a new floor/read position. Historical sender validation checks server-projected identity rather than requiring that sender to remain a current member. Direct messaging authorization remains unchanged.
