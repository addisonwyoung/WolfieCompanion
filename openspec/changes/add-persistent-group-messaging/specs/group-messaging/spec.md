# Spec Delta

## Purpose

Allow eligible students to create persistent text conversations with several friends, retain the familiar messaging interface and unread highlights, and protect messages sent before each member joined.

## ADDED Requirements

### Requirement: Friend-only group creation
The system SHALL provide New group inside Messages. An eligible authenticated creator SHALL select at least two distinct other eligible students with accepted friendships to the creator; the creator SHALL be included automatically. Groups SHALL support 3–50 initial members. Pending requests, shared courses, self-selection, duplicate identifiers, or unrelated identifiers SHALL NOT satisfy the friend requirement. Friend selection SHALL cover accepted friends across courses, including friends who no longer share a saved course. The picker SHALL show name and nullable major, support selection/search and bounded navigation, and distinguish loading, no friends, insufficient eligible friends, and retryable failure. An optional group name SHALL be trimmed, limited to 80 Unicode code points, and treated as absent when blank; an unnamed group SHALL receive a readable member-based display label. Membership SHALL begin immediately on successful creation without a separate invitation acceptance step.

#### Scenario: Create with two friends
- **WHEN** a creator selects two eligible accepted friends with new messages enabled and confirms Create group
- **THEN** one persistent group with exactly those three distinct members is created and opens for texting
- **AND** both added friends can find it in Messages even before its first message

#### Scenario: Reject invalid initial membership
- **WHEN** creation includes fewer than two other distinct friends, more than 50 total members, a pending or unrelated student, or an ineligible account
- **THEN** creation is rejected without saving a group or partial membership

#### Scenario: Pick friends independently of courses
- **WHEN** the creator has an accepted friend who does not share any current saved course
- **THEN** that friend remains selectable if otherwise eligible and open to new messages

### Requirement: Creator-only additions and new-message availability
Only a group's original creator SHALL add members after creation. Every addition SHALL be one of that creator's currently accepted, eligible friends, SHALL not already be a member, and SHALL have Allow new direct messages enabled at the committed addition. The maximum group size SHALL remain 50. Other members SHALL NOT add anyone, including their own friends. Added people need not be friends with every other member. Creation and additions SHALL revalidate authorization and availability rather than trusting an earlier picker result. Turning off new DMs, unfriending, or changing courses after joining SHALL NOT remove existing membership or prevent otherwise eligible members from continuing to text. The preference explanation SHALL mention new group additions as well as new direct conversations. This version SHALL expose no leave/transfer-owner controls.

#### Scenario: Only the creator manages additions
- **WHEN** an existing non-creator member attempts to add their friend
- **THEN** the operation is denied and no membership changes

#### Scenario: Closure after selection
- **WHEN** a selected friend saves new messages off before group creation or addition is ordered to commit
- **THEN** the entire operation is rejected without partial additions or an empty newly created group

#### Scenario: Continue an existing group
- **WHEN** a member disables new DMs or stops being friends with the creator after joining
- **THEN** existing eligible members retain their group access and can continue sending messages

### Requirement: Atomic and retry-safe membership mutations
Explicit group creation SHALL atomically save the group and all initial memberships. Canceling or closing a creation form SHALL create nothing. Retrying an identical creation attempt after a lost response SHALL return the same group without duplicating it; intentionally starting a new creation attempt SHALL permit a different group with the same members. A reused attempt identifier with changed initial members or name SHALL fail. Creator additions SHALL commit as one batch, be idempotent for an identical retry, and SHALL NOT reset existing members' join boundaries or read positions. Concurrent creation, additions, sends, preference changes, or unfriending SHALL preserve membership validation, the size limit, and stable post-join visibility.

#### Scenario: Lost creation acknowledgement
- **WHEN** creation commits but the response is lost and the creator retries the unchanged attempt
- **THEN** exactly the original group is confirmed and no duplicate group is created

#### Scenario: Duplicate addition during a send
- **WHEN** an identical addition is submitted concurrently with a message and retried
- **THEN** there is one membership per added account with one stable join boundary
- **AND** the message is either before or after that boundary according to serialized operation ordering

### Requirement: Membership-scoped post-join privacy
Only currently eligible group members SHALL access group metadata, member identities, messages, previews, unread counts, or protected message events. A member SHALL read only messages committed after that member's join boundary. This boundary SHALL apply equally to latest/older/catch-up history, direct table access, inbox previews, unread calculations, and Realtime delivery. Older messages SHALL never be sent to a later member and merely hidden in the UI. Group membership SHALL expose only the minimal member/sender identity needed for conversation, not optional profile details, private avatar paths, email addresses, or other course memberships. An ineligible existing member SHALL lose access while eligible members can continue; their display identity SHALL be neutral where necessary. Closing, reloading, navigating, or signing out SHALL NOT delete saved groups, memberships, messages, or read positions.

#### Scenario: Later member cannot read earlier messages
- **WHEN** the creator adds a friend after several messages have been sent
- **THEN** the new member sees an empty history with an explanation until a post-join message arrives
- **AND** earlier bodies, previews, counts, and events remain inaccessible through every supported access path

#### Scenario: Outsider attempts access
- **WHEN** an unrelated, anonymous, or ineligible caller guesses a group/message identifier or subscribes to message events
- **THEN** no private group identity, member list, history, preview, unread state, or message event is exposed

### Requirement: Durable sequenced text and exact retries
Eligible group members SHALL send immutable literal text of 1–2000 Unicode code points containing at least one non-whitespace character, preserving newlines. The server SHALL assign sender identity, message identifier, sequence, and creation time. Invalid text, non-membership, and caller ineligibility SHALL reject writes. A sender's identical message attempt retried for the same group and body SHALL confirm the original message without advancing sequence or activity; changed group/body reuse SHALL fail. Pending duplicate activation SHALL be suppressed. Unconfirmed attempts SHALL retain the original body/identifier with Retry and Discard; acknowledgement or matching incoming confirmation SHALL be required before clearing. Acknowledgement loss SHALL never be presented as proof of non-delivery.

#### Scenario: Exchange group text
- **WHEN** different eligible members send text in the same group
- **THEN** every entitled member receives the same durable sequence order with the correct sender and server time
- **AND** returning after reload or sign-in restores their permitted saved history

#### Scenario: Retry a committed send
- **WHEN** a message commits, its response is lost, and its unchanged attempt is retried
- **THEN** one persisted/displayed message and one sequence/activity advance result

### Requirement: Unified inbox and matching chat presentation
Messages SHALL list direct and group conversations together in activity order with bounded Load more navigation and distinct group identity. Empty groups SHALL appear with a no-messages state; later members SHALL receive a no-messages-since-joining state without pre-join previews. Group chat SHALL identify each sender, distinguish the viewer's own messages, show a group title/member count and accessible member list, and expose Add members only to the creator. The existing burgundy palette, wide low-height bubbles, time-only bubble/inbox timestamps, compact input/send icon, Enter-to-send, Shift+Enter newline, IME-safe input, and desktop/375px layout SHALL remain consistent between direct and group chats. Closing the group SHALL return to the inbox and discard only in-memory draft/retry state. Group launch, picker dismissal, membership changes, and navigation SHALL have correct keyboard focus and no stacked native modality or horizontal overflow.

#### Scenario: Use group texting on a phone
- **WHEN** a member selects a group at a 375-pixel viewport
- **THEN** sender-labeled messages, compact composer, Send, Back, and membership controls remain operable with touch or keyboard in the existing color scheme

#### Scenario: Preserve direct conversations
- **WHEN** group functionality is enabled alongside saved direct chats
- **THEN** direct profile launch, canonical pair identity, persistence, preference enforcement, styling, retries, and unread behavior continue to work

### Requirement: Bounded synchronization and private lifecycle
Group inbox and permitted history SHALL support pages of at most 50 with deterministic cursors, Load older, and bounded repeated catch-up beyond one page. Failed pages SHALL not advance cursors. Incoming messages SHALL deduplicate and preserve already loaded history and reader position, exposing New messages when the reader is above the bottom. Protected live updates SHALL invalidate authenticated reads, with visible 10-second polling and open/focus/reconnect catch-up as fallback. Subscriptions SHALL stop when hidden/unmounted. Switching direct/group selections or accounts, signing out, and obsolete membership/message responses SHALL not expose stale rows, member selections, drafts, retry IDs, unread state, errors, subscriptions, or focus from the previous context.

#### Scenario: Recover missed group messages
- **WHEN** more than 50 entitled messages arrive while the viewer is disconnected
- **THEN** reconnect catches up through bounded pages without gaps or duplicates and without exposing pre-join history

#### Scenario: Replace account during group creation
- **WHEN** the authenticated account changes while creation, addition, loading, sending, retrying, or catching up is pending
- **THEN** old private UI and selection state disappear and late results cannot enter the new workspace

### Requirement: Persistent combined unread highlights
The Messages navigation badge SHALL count incoming unread direct and group messages, and each unread group row SHALL receive the existing highlight and its own count. The viewer's own sends and pre-join messages SHALL never count. Group read positions SHALL persist privately per member, advance monotonically only through valid visible history, and not expose sender-visible read receipts. Visible latest-history viewing SHALL mark read; hidden views and reading older messages SHALL leave newer arrivals unread. Failed acknowledgements SHALL retain counts for later retry. New membership without post-join messages SHALL not fabricate a new-message count. Unread updates SHALL continue elsewhere in the signed-in workspace using the existing protected refresh/fallback behavior.

#### Scenario: Group arrives while on dashboard
- **WHEN** another member sends a post-join message while the viewer is on their dashboard
- **THEN** Messages navigation and the group row highlight
- **AND** viewing that group's latest messages clears only its confirmed incoming unread count

#### Scenario: Keep direct and group unread state separate
- **WHEN** the viewer reads a group while a direct chat and another group remain unread
- **THEN** only the viewed group's position advances and the other unread counts remain in the navigation total

### Requirement: Additive deployment and preserved data
Group support SHALL use an owner-reviewed additive database migration and existing authenticated configuration, without new messaging keys or services. Existing direct-message data, RPC contracts, profile/Storage ownership, and friend data SHALL remain intact. Missing group schema SHALL show an isolated setup/retry state without disabling working direct messages. Setup SHALL document the preference's added group meaning, new-member history privacy, manual SQL application, data-preserving rollback, and separate managed Auth/Realtime acceptance.

#### Scenario: Deploy after existing messaging
- **WHEN** the owner applies the reviewed group migration to a database with existing direct chats
- **THEN** direct histories and private read positions remain unchanged and group functionality becomes available
- **AND** routine rollback retains student chat data

### Requirement: Creator-controlled member removal
Only the original creator SHALL remove another member. The creator SHALL NOT remove themselves. The UI SHALL require confirmation and allow cancellation. Removal SHALL revoke database history, send, inbox and unread access without deleting saved messages or changing group identity, even below three remaining members. Remaining members SHALL retain the removed sender's messages. Open clients SHALL clear revoked chat history and drafts upon refresh. A later readdition SHALL use normal addition eligibility and a fresh post-join history floor. Sending SHALL revalidate membership after acquiring the group mutation lock.

#### Scenario: Creator removes a member
- **WHEN** the creator confirms removal of another member
- **THEN** that member loses read/send/inbox/unread access, while other members retain all entitled saved messages

#### Scenario: Member rejoins
- **WHEN** the creator later adds the removed friend again
- **THEN** the readded member sees only messages sent after rejoining
