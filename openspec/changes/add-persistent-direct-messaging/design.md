# Design

## Context

See proposal.md for motivation. Main currently has course-scoped `PeerProfileDialog.tsx` and relationship-scoped `FriendProfileDialog.tsx`; `App.tsx` owns their selection and navigation. Both profile APIs return stable student UUIDs with sharing-limited projections. `get_friend_profile` also permits pending-request participants. Its peer eligibility checks are not sufficient for new messaging authorization, so messaging must independently check trusted Auth identities for both accounts. `friendships` stores canonical unordered pairs, while `friend_requests` stores directed status history. `useFriendships.ts` already combines authenticated RPC calls with Realtime-driven refresh. `profiles` remains owner-only and `accountApi.saveProfile` explicitly allowlists fields. There is no existing conversation/message persistence or inbox.

The main spec inventory has no messaging or friendship capability yet: completed profile/friend changes remain unsynced. The older profile change's no-messaging statement was a restriction on that release, now intentionally superseded by this separately authorized feature. Do not broaden old profile RPCs or retroactively edit completed planning artifacts. During later spec reconciliation, sync prerequisite releases first and reconcile the superseded messaging exclusion against this explicit capability; do not allow older archive order to remove a current messaging action.

## Goals / Non-Goals

**Goals:** One durable participant-only conversation per account pair; authoritative first-contact consent; bounded recoverable history; text-only reliable sends; a shared inbox independent of course selection; lifecycle isolation.

**Non-Goals:** Attachments, groups, message editing/deletion, typing/read receipts, push/email notifications, per-person blocking, public user search, end-to-end encryption, and account-deletion/retention redesign. The app's participant-only RLS does not make messages inaccessible to privileged database operators. No messaging service-role credential or additional backend proxy is required.

## Decisions

### 1. Add durable pair and message tables

Add `profiles.allow_new_dms boolean not null default true`, and extend owner load/save/types and Profile's editor with the preference and exact existing-chat explanation. Do not expose all profile settings through peer projections; use a separate contact-state RPC.

Create `dm_conversations(id uuid, user_low uuid, user_high uuid, created_at timestamptz, last_message_at timestamptz, last_sequence bigint)` with distinct canonical participants and a unique `(user_low,user_high)` constraint. Create `dm_messages(id uuid, conversation_id uuid, sequence bigint, sender_id uuid, client_message_id uuid, body text, created_at timestamptz)` with a unique `(sender_id,client_message_id)` idempotency key and unique `(conversation_id,sequence)`. Assign identifiers, participant pair, sender, timestamps, and monotonically increasing per-conversation sequence in the database. Index pair uniqueness, both participant/activity inbox paths, and `(conversation_id,sequence desc)` history. Keep participant FKs consistent with existing Auth-user lifecycle conventions; closing/navigation never issues DELETE. Messages reference conversations, not shared courses, so course membership changes do not erase history.

A separate message service or JSON message array in profiles was rejected: normalized rows give bounded reads, concurrency control, participant authorization, and durable independent messages with existing Supabase infrastructure.

### 2. Enforce authorization through RPCs and participant RLS

Enable RLS on both tables. Grant authenticated SELECT only under caller eligibility plus pair membership; deny anonymous reads and all direct authenticated INSERT/UPDATE/DELETE. Only narrowly granted security-definer RPCs with an empty search path mutate data. Internal helpers are not client-callable. New-contact validation requires both users to meet the existing trusted verified-Stony-Brook-Google criteria plus one of: canonical accepted friendship, pending request involving the pair, or `private.can_view_classmate` for the supplied normalized saved course. Do not trust a profile response, arbitrary peer ID, supplied caller ID, or stale friendship badge as authority.

Define RPC contracts:

- `dm_contact_state(p_student_id, p_course_code nullable)`: returns a minimal peer identity and existing conversation/sendability state only for authorized contact contexts or an existing participant thread. Invalid/unrelated targets get generic unavailable. Existing threads are readable by eligible participants; an ineligible peer's display name becomes a neutral unavailable-student label and sending is disabled.
- `dm_send_message(p_student_id, p_body, p_client_message_id, p_course_code nullable)`: atomic send described below; derives sender exclusively from `auth.uid()`.
- `dm_inbox(p_before_activity nullable, p_before_id nullable, p_limit default 50)`: participant conversations ordered by activity/id, bounded to 50, with minimal current peer identity and last-message preview. No optional profile details, emails, schedules, or settings list.
- `dm_history(p_conversation_id, p_before_sequence nullable, p_limit default 50)`: participant-only latest/older messages; order by sequence, bounded to 50. Return enough cursor information to page backward. Add a mutually exclusive `p_after_sequence` mode for bounded catch-up, traversed until caught up.

History access requires only the viewer's eligibility and pair membership, even when the peer becomes ineligible; new sends require both eligible. Existing conversations remain usable after friendship/request/course changes and when either user's new-DM preference is off. This avoids turning a course-specific profile authorization rule into accidental history loss. Participant history never grants unrelated profile/avatar access.

### 3. Commit first contact and text idempotently

Validate Unicode text identically: preserve the submitted body and line breaks, require at least one non-whitespace code point, and limit to 2000 code points (`Array.from(body).length` in client; `char_length` and an explicitly matched whitespace definition in SQL). Reject non-string/null payloads and malformed request identifiers. Render React text nodes with preserved whitespace and wrapping; no HTML/Markdown parser or auto-created attachments.

Serialize send creation with a transaction-scoped advisory lock on the canonical pair. Recheck sender-scoped request identity under the lock: the same recipient/body returns the stored message, while mismatched reuse fails. A duplicate retry must not increment activity/sequence. Handle a request-key collision on a different pair through the unique constraint and a safe collision error, rolling back any newly inserted empty conversation.

If a conversation exists, lock it, verify both accounts are eligible, and send regardless of new-DM preferences or changed relationships. If none exists, validate the current contact relationship/course and lock the recipient profile row before reading `allow_new_dms`. This serializes against the owner's preference update: a send ordered after DM closure cannot create a new conversation. Both directions acquire the same pair lock before the preference row, preventing cross-direction creation races. Create the conversation and first message together, allocate the next sequence under the conversation lock, update latest activity, and return the confirmed row atomically. A rejected first message leaves no conversation. Opening a composer calls only read RPCs.

Use a UUID per send attempt and keep body/request ID together until acknowledgement. Disable duplicate submit while pending. On failure retain the exact attempt in a read-only failed-send composer with Retry and Discard draft actions. Retry uses the identical request ID and body. Discard explicitly abandons that in-memory attempt and clears its text before a new composition receives a new UUID; explain that a message whose acknowledgement was lost may already have been delivered. Confirmed rows from a concurrent refresh reconcile the failed attempt by its sender/request identity before enabling new composition. Closing a chat discards unsent memory, not database rows, and never promises to cancel a request already committed by the server. No automatic retry after account changes.

### 4. Reuse profile identity, open a dedicated Messages view

Add Messages navigation in the authenticated account subtree. Desktop shows an inbox plus selected chat; phones show one panel at a time with Back to conversations. Inbox uses paginated Load more, history uses Load older, composer is a compact textarea with an accessible send icon. Enter sends and Shift+Enter inserts a newline. Include explicit loading/empty/error/closed-to-new/unavailable states; save preference failures and message failures preserve confirmed state and provide retry. Messages sent by the current user are distinguished textually and visually, with locale-readable hour/minute timestamps from server instants.

Both profile dialogs receive an `onMessage(studentId, context)` handoff and messaging contact state. Render Message for allowed/new or established contact; show a disabled action with clear new-DMs-closed text for a peer with no established thread. Load failures have a messaging retry without hiding profile details. `App` closes the old profile selection before activating Messages, then focuses the conversation heading/composer after dialog cleanup. A chat close returns to inbox and discards the unsent draft. No second native modal is stacked. Returning from Messages need not reopen the profile automatically. Inbox identities remain minimally scoped and do not require course selection or private profile table reads.

### 5. Reconcile database state and protect private lifecycle

Implement a strict messaging adapter and account-keyed state hook. Track conversation/message requests, attempts, and cursors by account plus selected peer/thread; abort pending reads and synchronously mask obsolete rows on switches. Dedupe by persisted ID and order by sequence. Merge incoming/new pages while preserving already loaded older history. On success use the confirmed message row and refresh inbox/contact state; opening/reopening always reads the database. Drafts and failed attempts stay memory-only.

Use authenticated Postgres Changes subscriptions to new message/conversation rows under participant RLS as refresh signals, not as sole trusted state. Add tables to `supabase_realtime` only if the publication exists. Reconcile on subscribe/reconnect/focus/open and poll the visible Messages view every 10 seconds as fallback when events are delayed or unavailable; stop timers/subscriptions when hidden or signed out. Fetch after the last known sequence in bounded pages, retry failed catch-up without advancing its cursor, and reset inbox head on activity refresh. Near the bottom, keep the newest message visible; when reading older messages preserve position and expose New messages. Prepending older pages preserves the scroll anchor. No typing/presence/read status is implied.

## Risks / Trade-offs

- New DMs are open by user choice → explain the default and recipient-controlled new-conversation setting; it deliberately is not a block/mute control and does not stop existing chats.
- Consent races or empty-thread loopholes → serialize first sends with recipient preference updates and atomically persist the first message; test concurrent close/send and reciprocal sends in real local SQL sessions.
- Lost acknowledgements → sender/request uniqueness, matching-payload replay, and a retained explicit retry attempt; test a committed-send/lost-response path.
- Realtime gaps and long history → bounded sequence catch-up, fallback polling, inbox pagination, focus/open/reconnect reconciliation, and scroll-preserving merge tests.
- Older profile/friend artifacts are not synced → document the new capability's precedence and prerequisite ordering; keep existing roster/profile projections unchanged and run their regression tests.

## Migration Plan

Prepare an additive migration after installed account/profile/friend prerequisites using the next unused migration identifier. Test only on an isolated disposable local Postgres cluster with synthetic users, including multi-session races; never run bootstrap against shared Supabase. Document participant grants, safe RPC errors, optional Realtime publication setup, and missing-migration UI behavior in `docs/direct-messaging.md` plus teammate/account guides.

The project owner reviews and manually applies SQL, then deploys the client. There are no new keys or hosted messaging services. Existing users receive `allow_new_dms=true`; call that out in release/setup notes. Missing message schema fails closed for messaging while profiles/dashboard remain usable. Real-account checks must cover two eligible accounts and one unrelated account, persistence across devices/reload, availability races, and managed Realtime behavior; report them separately from local tests.

Rollback the client first, revoke new authenticated RPC execution and SELECT access/publication entries for messaging through owner-reviewed SQL, and retain conversations/messages/preferences for recovery. Do not delete chat history as rollback or loosen existing profile/Storage policies.
