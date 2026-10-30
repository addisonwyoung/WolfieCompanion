# Proposal

## Why

Students can view classmate and friend profiles but cannot yet contact one another in the app. Persistent direct messaging completes that connection flow and keeps conversations available after closing a chat, signing out, or returning on another device.

## What Changes

- Add a Message action to authorized friend and non-friend profile views; friendship is not required.
- Add a Messages navigation view listing saved one-to-one conversations and allowing text-only sending, receiving, and history retrieval.
- Store conversations and messages in Supabase with access restricted to the two participants. Keep one conversation per unordered account pair across courses and profile entry points.
- Add an owner-controlled Allow new direct messages setting, default on for existing and new accounts. Turning it off prevents other people from starting new conversations; existing conversations remain readable and both participants can continue sending.
- Create a conversation only when its first message is successfully stored, so opening a chat cannot bypass a later change to DM availability.
- Validate text, prevent duplicate messages on retry, retain failed drafts, refresh open chats, and clear private UI/subscriptions on account changes.
- Initial scope excludes attachments, group chats, message edits/deletions, typing/read receipts, push/email notifications, and per-person blocking.

## Capabilities

### New Capabilities

- `direct-messaging`: Profile entry, persistent participant-only conversations and text messages, inbox/history access, DM availability, synchronization, and accessible failure-safe chat UI.

### Modified Capabilities

None. Existing profile/discovery projections, friendship rules, academic items, and optional-field sharing retain their contracts; messaging adds a separate authorization and persistence boundary.

## Impact

- Database: additive migration after current profile/friendship prerequisites for `dm_conversations`, `dm_messages`, profile DM preference, participant RLS, authenticated lookup/send/history/inbox RPCs, indexes, and optional Realtime publication entries.
- Client: `PeerProfileDialog.tsx`, `FriendProfileDialog.tsx`, `Profile.tsx`, account save/load, `App.tsx`, and new messaging adapters/state/UI. Use stable account UUIDs already returned by existing profile flows.
- Tests/docs: isolated SQL authorization/concurrency cases, client lifecycle/retry tests, desktop/phone native-browser flows, and owner-reviewed manual setup/rollback documentation.
- New conversations are allowed only for currently eligible students who are already connected by accepted friendship, a pending friend request, or a saved shared course matching the current authorized profile paths. Existing conversation membership permits continued access after course/relationship changes, subject to current account eligibility.
- Earlier profile/friend changes treated messaging as future work. This change adds that separate capability; its current main specs contain no messaging capability. Keep older artifacts historical and document sync/archive ordering so their release-specific no-messaging scope is not treated as a future prohibition.
