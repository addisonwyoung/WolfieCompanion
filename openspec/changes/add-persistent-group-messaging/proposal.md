# Proposal

## Why

Students already have persistent direct messages and unread indicators, but cannot coordinate with several friends in one conversation. Group chats should provide that same familiar texting experience while enforcing friendship-based additions and keeping earlier messages private from later arrivals.

## What Changes

- Add New group in Messages with an optional group name and a selectable list of the creator's accepted friends across courses. Creating requires at least two distinct other people (three members including the creator).
- Persist group identity, memberships, sequenced text messages, and individual read positions in Supabase. Explicit Create group saves the group and its initial memberships atomically; canceling the picker creates nothing.
- Only the creator can add more of their accepted friends. Invitees need not be friends with every other member. Pending requests, shared courses, or knowing an account UUID do not authorize adding someone.
- Recheck invitees' eligibility, friendship, and Allow new direct messages preference on creation and later additions. A friend who has disabled new DMs cannot be added; turning that setting off after joining does not stop an existing group chat.
- New members see only messages sent after they join. Enforce that boundary for history, previews, unread counts, direct table reads, and Realtime events.
- List direct and group chats together in Messages. Reuse the current burgundy colors, wide compact bubbles, time-only timestamps, sender labels, compact send icon, Enter-to-send, Shift+Enter newlines, retries, pagination, and mobile layout.
- Extend workspace-wide unread badges and highlighted conversation rows to groups, excluding a viewer's own sends and preserving unread newer messages while reading older history.
- This first version excludes invitations/acceptance flows, leaving, ownership transfer, rename-after-creation, attachments, editing/deleting messages, sender-visible read receipts, and push/email notifications.

## Capabilities

### New Capabilities

- `group-messaging`: Friend-only group creation and creator-managed additions, post-join private text history, persistent messaging, unified inbox/unread integration, and matching accessible chat interactions.

### Modified Capabilities

None in the current main-spec inventory. Direct messaging and friendship implementations exist on main, but their completed changes have not yet been synchronized into main specs. Preserve their existing contracts; the older direct-message change's group-chat exclusion describes its original scope and is superseded by this separate capability.

## Impact

- Supabase: next unused additive migration after installed messaging/unread/friendship prerequisites; group tables, protected membership helpers/RLS, authenticated creation/addition/send/history RPCs, friend selection, combined inbox/unread projections, indexes, and optional Realtime publication entries. Existing DM rows, canonical pair constraints, RPC contracts, profile/Storage policies, and private optional fields remain intact.
- React: `Messages.tsx`, `messaging.ts`, `useMessaging.ts`, `MessagingNotifications.tsx`, `messagingUnread.ts`, `App.tsx`, shared styles, and new group picker/membership UI. Current friend loading is course-filtered; group selection needs a narrowly scoped accepted-friend lookup independent of saved courses.
- Verification/docs: isolated SQL authorization and concurrency tests, adapter/hook/App lifecycle tests, desktop/375px browser flows, and owner-reviewed manual migration/setup/rollback guidance. No new keys, backend messaging proxy, or external messaging service.

- Follow-up: allow the creator to confirm removal of other members, revoke their access, retain saved messages, and enforce fresh history on readdition through a separate migration.
