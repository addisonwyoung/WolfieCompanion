# Persistent direct messaging

Students can open a classmate, friend, or pending-request participant's authorized profile and select **Message**. Messages opens a saved conversation or an empty composer. Opening a profile/composer does not create a conversation: the first successful send creates it together with its first message. Messages navigation also opens the saved inbox. Name and the existing sharing controls continue to govern profile details; messages do not expose extra optional profile fields.

**Edit profile → Allow new direct messages** defaults on for existing and new accounts. Save commits it; Cancel discards edits and a failed Save retains the draft for retry. Turning it off prevents others from starting new conversations. Both participants may continue existing chats, even after course/friendship changes. This is not a block or mute control. A student can initiate an allowed conversation while their own preference is off; the recipient's preference controls first contact. First contact requires two eligible verified Stony Brook Google identities plus an accepted friendship, pending request between the pair, or saved shared course authorizing the profile. Course membership remains self-reported.

## Chat behavior

- Saved messages are database-backed and remain after Back to conversations, navigation, reload, or sign-out. Close/navigation discards only memory-only drafts and retry attempts; it cannot cancel a send already committed by the database. No drafts or retry payloads are stored in browser storage by the production app.
- Type literal text of 1–2000 Unicode code points, including line breaks. Enter sends; Shift+Enter adds a newline. A compact send icon also sends. Markup is displayed as text. Whitespace-only, NUL, and oversized text are rejected. No attachments, formatting, editing/deleting messages, read receipts, presence, search, group chat, blocking, or notifications are provided.
- Inbox Load more and history Load older messages use pages of at most 50. History orders by database sequence; timestamps are displayed in the viewer's locale. Reading older text preserves scroll position. New messages exposes a jump-to-latest action; reading near the bottom follows incoming messages.
- Sending disables duplicate submission. A failed send retains its exact request UUID/body in a read-only composer. It may already have arrived if its response was lost. Retry sends the same attempt idempotently; Discard draft abandons only the local attempt. A confirmed refresh reconciles the matching sender/request/body. Only a confirmed result clears a draft.
- The visible Messages view subscribes to protected message INSERT and conversation UPDATE events and rereads authenticated RPCs. It also polls every 10 seconds and catches up on open, focus, online, and subscription/reconnect. Hidden/unmounted views stop subscriptions and polling. Account changes/sign-out remove private rows/drafts/errors and abandon late work. Managed Realtime may delay events; polling is the fallback.

## Owner-only deployment

Review `supabase/migrations/202610230001_direct_messaging.sql` before manually running it in the intended Supabase project's SQL Editor. Do not run the bootstrap/tests there. No migration has been applied to a hosted project by this change. Apply SQL before deploying the client; missing schema displays a messaging setup error without hiding the dashboard/profile.

Prerequisites, in migration order: accounts (`202610160001`), classmate discovery (`202610180001`), classmate profiles (`202610220002`), and friend requests (`202610220004`). Keep other installed migrations. This migration adds a default-true owner preference, two tables, restricted functions, RLS/grants, indexes, and optional publication entries; it does not loosen existing profile or Storage policies. All existing users receive open new DMs at release. Communicate the default and how to turn it off.

Use the current frontend Supabase project URL and publishable key with each caller's authenticated session. Messaging needs no new key, service-role credential, server endpoint, or external messaging service. Existing shared-picture configuration remains separate. Never put a service-role key in Vite variables.

If `supabase_realtime` exists, the migration adds the two tables if absent. Otherwise the owner can enable the publication for `public.dm_messages` and `public.dm_conversations` in the project's replication settings after reviewing the participant SELECT policies. The application works through polling without that publication. Realtime is invalidation, not the source of truth. Managed Auth/Realtime acceptance below remains required.

## Database contracts

`profiles.allow_new_dms boolean NOT NULL DEFAULT true` is edited through the existing owner-only profile update.

`dm_conversations`: generated UUID `id`; canonical UUID `user_low < user_high` with unique pair; server `created_at`, `last_message_at`; monotonic `last_sequence bigint`. Participants reference Auth users with cascade deletion, matching existing account lifecycle. A conversation is inserted only inside the first send transaction.

`dm_messages`: generated UUID `id`, conversation FK with cascade, strictly positive per-conversation `sequence`, server-derived `sender_id`, sender-supplied `client_message_id` UUID, immutable literal `body`, server `created_at`. Unique `(sender_id, client_message_id)` and `(conversation_id, sequence)`. No client table writes are granted. Deleting an Auth account can cascade history; routine rollback must preserve data.

Authenticated SELECT RLS requires the viewer's current trusted eligibility and conversation participation. Anonymous, unrelated, or ineligible viewers cannot read either table. An eligible participant can read history with an ineligible peer, whose RPC name becomes “Unavailable student”; sending then fails. Security-definer RPCs set an empty search path, derive the caller with `auth.uid()`, and check trusted Auth user/Google identity records rather than editable metadata. Private helpers are not executable by client roles.

| RPC | Parameters | Result |
| --- | --- | --- |
| `dm_contact_state` | `p_student_id uuid`, `p_course_code text DEFAULT NULL` | null for unavailable/unrelated/self; otherwise `{student_id,name,conversation_id,can_send,reason}`; reason is null, `closed`, or `unavailable` |
| `dm_send_message` | `p_student_id uuid`, `p_body text`, `p_client_message_id uuid`, `p_course_code text DEFAULT NULL` | confirmed message row |
| `dm_inbox` | `p_before_activity timestamptz DEFAULT NULL`, `p_before_id uuid DEFAULT NULL`, `p_limit integer DEFAULT 50` | array ordered descending activity/id of `{conversation_id,student_id,name,last_message_at,preview}`; preview is first 120 characters |
| `dm_history` | `p_conversation_id uuid`, `p_before_sequence bigint DEFAULT NULL`, `p_after_sequence bigint DEFAULT NULL`, `p_limit integer DEFAULT 50` | message array ascending sequence; no cursor gives latest page; before gives older page; after gives earliest next page for repeated catch-up |

Inbox cursor timestamp/ID must be supplied together with a participant-owned conversation ID. History cursors are mutually exclusive, must reference a sequence in that conversation (after=0 allowed), and all limits are 1–50. The client keeps cursors unchanged after failure, validates response projections/ownership, strips unknown fields, deduplicates IDs, and catches up until the next page is shorter than 50. Inbox activity can change while paging; refresh merges current heads without deleting already loaded rows.

Send serialization uses a canonical-pair transaction advisory lock and an existing-conversation row lock for sequence allocation. First contact rechecks authorization and locks the recipient profile before reading availability, so an ordered closure prevents a later first send. Conversation/message creation and activity update commit together. Same sender/request/recipient/body replays the exact stored row without advancing activity or sequence. Changed payload/recipient reuse fails; cross-pair request collisions roll back any newly attempted conversation.

| SQLSTATE / API code | Meaning / safe client response |
| --- | --- |
| `42501` | Caller/contact/history authorization denied; generic contact unavailable |
| `P0001` | Recipient closed new conversations |
| `22023` | Invalid target, course, text, request, limit, or cursor |
| `23505` | Reused request identifier with changed payload/recipient |
| `PGRST202`, `42P01`, `42883` | Schema/RPC missing; owner migration setup message |
| Other/network/invalid response | Generic retryable messaging failure; no raw database details shown |

## Isolated checks

PostgreSQL 18, Node 22, and installed client/server dependencies were used. Run from the repository root. Use a fresh directory and unused port. The concurrency script is deliberately fixed to this disposable endpoint and uses synthetic UUIDs; it must never target a managed database.

```sh
/opt/homebrew/opt/postgresql@18/bin/initdb -D /tmp/wolfie-dm-pg -A trust -U postgres --locale=C --encoding=UTF8
/opt/homebrew/opt/postgresql@18/bin/pg_ctl -D /tmp/wolfie-dm-pg -l /tmp/wolfie-dm-pg.log -o '-h 127.0.0.1 -p 55449 -k /tmp' start
/opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 55449 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql -f supabase/migrations/202610160001_accounts.sql -f supabase/tests/accounts.sql -f supabase/tests/rerun.sql
```

In separate `psql` sessions (each invocation below starts one), apply migrations then tests. Classmate profiles intentionally shares the discovery suite's temporary assertion helper; the other suites start separate sessions to avoid helper collisions.

```sh
for migration in supabase/migrations/2026101[78]*.sql supabase/migrations/20261022*.sql supabase/migrations/202610230001_direct_messaging.sql; do
  /opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 55449 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$migration" || break
done
/opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 55449 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/classmate_discovery.sql -f supabase/tests/classmate_profiles.sql
for suite in course_classmate_recommendations friend_requests direct_messaging; do
  /opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 55449 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "supabase/tests/$suite.sql" || break
done
python3 supabase/tests/direct_messaging_concurrency.py
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
npm --prefix server test
npm --prefix server run build
node client/test/messaging-browser.mjs
/opt/homebrew/opt/postgresql@18/bin/pg_ctl -D /tmp/wolfie-dm-pg stop
```

The browser script uses installed Chrome (override `CHROME_PATH` if needed), a temporary Chrome profile, local Vite, and fixture-only localStorage. It never connects to Supabase. Screenshots are written to the temporary path printed on completion. Local SQL uses test Auth/Storage stand-ins and real PostgreSQL RLS/transactions; it is not a managed Auth, PostgREST, or Realtime acceptance test. The approved recommendation assertion fix compares UUID text because PostgreSQL has no built-in `min(uuid)` aggregate.

## Deployed acceptance — pending owner execution

Use two eligible participants A/B and an unrelated third account C in the owner's authorized project. Keep tokens and message bodies out of logs.

1. Confirm existing and new profiles default new DMs on. Save off/on, reload, and check Cancel/failed-save behavior.
2. From friend, pending-request, and non-friend shared-course profiles, open Message. Confirm native profile closes and chat receives focus; opening alone creates no database conversation. Self/unrelated/forged-course/anonymous/ineligible calls must fail.
3. Send from A to B. Reload, close/reopen, sign out/back in, and open another device. Confirm exact text and history persist. Send from B and verify both inboxes, ordering, incoming updates, and paginated old history.
4. As C, attempt direct table SELECT, history/inbox/contact RPC access, and a Realtime subscription for the A/B conversation. Confirm no A/B rows, previews, names, or message events leak. Verify direct authenticated INSERT/UPDATE/DELETE and anonymous RPC calls are denied.
5. Turn B's new DMs off. Existing A/B sends continue both ways after course/relationship changes. A previously unrelated but authorized profile pair cannot start a conversation. A can initiate to an open recipient even if A's preference is off.
6. Open a fresh pair's composer while B is open, save B's setting off from another device, then send. Confirm rejection leaves no empty thread. Exercise a truly concurrent preference update/send to establish commit ordering.
7. Delay/drop a send response after database commit, then retry: one row, one sequence advance. Race a retry with incoming refresh and verify reconciliation. Check Unicode/newlines/literal markup, maximum length, failed page retry, duplicate activation, and draft discard uncertainty.
8. Disconnect/reconnect actual Realtime; miss more than 50 messages, then focus/reconnect. Confirm ordered catch-up without duplicates and visible polling fallback. Hidden views/sign-out must unsubscribe; switching accounts during load/send/retry/reconnect must expose no old state.
9. Make a peer ineligible in an authorized test environment: eligible participant can still read saved history with a neutral name but cannot send; ineligible participant cannot read. Restore test state using owner procedures.

## Rollback and spec reconciliation

Roll back the client first. If messaging access must be disabled, the owner should review SQL revoking authenticated execute on the four exact RPC signatures above, revoke SELECT on the two messaging tables, and remove only their publication entries. Retain tables, rows, preference values, and all existing profile/Storage policies for recovery; do not drop chat data as routine rollback.

Before archiving/syncing specifications, reconcile prerequisite completed classmate-profile and friendship changes first. The older classmate-profile change's no-messaging scope is superseded by this new direct-messaging capability; it is not a restriction on this implementation. Archive/sync remains a separate explicit workflow.
