# Persistent group messaging

Inside Messages, choose **New group**, optionally name it, and select **at least two accepted friends**. You are included automatically, so the initial group has at least three people. Create group saves the group and memberships together; Cancel saves nothing. An unnamed group uses a member-based label. Names are limited to 80 Unicode code points and groups to 50 members.

Only the original creator can use **Add members**, and each person must currently be that creator's accepted friend. They do not need to be friends with everyone in the group. The picker covers friends across courses, including friends who share no current course; pending requests and shared courses alone do not qualify. Search/Load more reaches all accepted friends, in pages of 50.

**Allow new direct messages** now also controls new group additions. A friend who saves it off cannot be newly added, even if the creator opened the picker earlier. The creator may start/add to groups with their own setting off. Turning the setting off or unfriending after joining does not block existing group conversations. This is not a block/mute setting. Membership starts immediately, with no separate invitation acceptance. This first release has no leave, owner transfer, rename-after-creation or group pictures.

## Post-join privacy and texting

A person added later can read **only messages sent after they join**. The database enforces a stable sequence boundary for history, direct message-table SELECT, catch-up, previews, unread counts, and protected message events. Earlier messages are never fetched and hidden in the client. A new member sees no pre-join preview/unread count, and the chat explains when no post-join messages exist. Membership exposes only the names/identifiers needed to identify senders, not optional private profile details or other people's read positions.

Direct and group chats share one paginated activity-ordered inbox, the current burgundy palette, wide short bubbles, hour/minute timestamps, and compact composer/send icon. Sender names distinguish people in a group. Enter sends, Shift+Enter adds a line break, and IME composition does not send. Plain text permits 1–2000 Unicode code points with at least one non-whitespace character; literal markup/newlines remain literal. No attachments, edit/delete, presence, sender-visible read receipts, push or email notifications.

Saved groups/history/read positions survive navigation, refresh and sign-out. Closing a chat discards only memory-only drafts and failed-attempt state; it cannot cancel a send or group mutation already committed by the server. Pending submission is disabled. If a response is lost, the mutation/message may already be saved: Retry keeps the same exact UUID/body/member selection/name. Failed mutation fields are read-only until Retry or Discard attempt. Discard abandons the local attempt, not any persisted group. An intentionally fresh creation attempt can create another group with the same friends.

Load older messages and Load more conversations use bounded 50-row pages. Page errors retain the cursor for retry. Incoming merges preserve older-history scroll and expose New messages when above the bottom. Clicking it or scrolling to the latest marks only loaded visible messages read. Group and DM unread counts are kind-scoped so reading one cannot clear another. Your own sends and pre-join messages never count. New groups with no text appear in inbox but have no new-message count.

Visible signed-in workspaces refresh unread status through protected DM/group message and metadata events, on focus/online/reconnect, and every 10 seconds. Visible chats use bounded sequence catch-up. Hidden/unmounted views stop channels/polling and do not mark unread history read. An open native picker also prevents the covered chat from marking incoming messages read. Membership tables containing private read positions are not published. Account replacement clears selections, drafts, attempts, history, counts and subscriptions; late writes cannot populate another account.

## Owner-only manual deployment

Review and manually run **`supabase/migrations/202610250001_group_messaging.sql`** in the intended Supabase project's SQL Editor. Apply existing account/profile/friendship and DM/unread migrations first, through the current installed friend-directory migration. Keep migration history; do not rerun successful group SQL blindly. This feature's implementation/testing does not apply SQL to a hosted project. Never run `supabase/tests/` or bootstrap SQL on a hosted/shared project.

Then deploy/restart the new client. Existing Supabase URL/publishable key and caller sessions are sufficient. No new messaging key, service-role credential, backend endpoint, external service or paid API is needed. If group RPCs are missing, group controls display setup guidance; the combined inbox/unread adapters fall back to working legacy DM APIs only for recognized missing-schema errors. Other errors remain errors rather than pretending to be empty success.

When `supabase_realtime` exists, the migration adds only `group_conversations` and `group_messages`. If needed, the owner enables those tables in the project's replication/publication settings after reviewing RLS. Do not publish `group_members` or private receipts. Group message INSERT and metadata UPDATE are invalidation signals; safe metadata revisions make new/empty-group membership discoverable without exposing read positions or message bodies in metadata. Polling remains the fallback. Actual managed Auth/PostgREST/Realtime acceptance remains separate from local SQL and browser fixtures.

### Data and authorization

- `group_conversations`: generated UUID, original creator UUID, optional name, creation/activity timestamps, last sequence and safe metadata revision. Existing `dm_conversations` remains a unique two-person table.
- `group_members`: group/user primary key, join timestamp, immutable `joined_after_sequence` floor and private monotonic `last_read_sequence`, initially the floor. No raw client grants, including peer read access.
- `group_messages`: generated UUID, group ID, positive group sequence, server sender, sender request UUID, literal body and server time. Unique group/sequence and sender/request constraints. Participant SELECT RLS applies the caller's eligibility and sequence floor; no direct client writes.
- Private mutation receipts store creator/request, normalized payload and group ID for creation/addition replay. Clients have no table access. Identical committed retry returns the same group; changed payload/key reuse rejects.
- Group writes derive callers from `auth.uid()` and eligibility from trusted Auth Google identity state. Helpers and SECURITY DEFINER functions have empty search paths and restricted grants. Only caller-derived `private.group_floor(uuid)` is executable by authenticated RLS; other helpers are inaccessible to clients.
- Profile locks plus friendship locks serialize additions with DM closure/unfriending. The group row serializes membership count, join floors and message sequence. A concurrent message is either before or after the join, never ambiguously shared using wall-clock timestamps. Any failed creation/addition batch rolls back completely.
- Auth deletion removes that account's memberships/read positions, nulls its historical sender identity, and nulls creator ownership if applicable. Remaining eligible members retain entitled history and can text, but nobody inherits add-member privileges. The creation minimum is not a lifetime minimum and groups do not silently convert to DMs. No account-deletion UI or retention redesign is introduced.

### RPC contracts

| RPC | Parameters | Result |
| --- | --- | --- |
| `group_friend_candidates` | `p_group_id uuid DEFAULT NULL`, `p_search text DEFAULT ''`, `p_before_name text DEFAULT NULL`, `p_before_id uuid DEFAULT NULL`, `p_limit integer DEFAULT 50` | accepted-friend array `{student_id,name,major,can_add,reason}` ordered ascending name/UUID; reason null/closed/unavailable; supplied group requires creator and excludes existing members |
| `group_create` | `p_members uuid[]`, `p_request_id uuid`, `p_name text DEFAULT NULL` | confirmed group detail, creator implicitly added |
| `group_add_members` | `p_group_id uuid`, `p_members uuid[]`, `p_request_id uuid` | confirmed group detail after atomic creator-only addition |
| `group_detail` | `p_group_id uuid` | `{group_id,name,creator_id,joined_after_sequence,last_read_sequence,members:[{student_id,name}]}` for caller only; no other read positions |
| `group_send_message` | `p_group_id uuid`, `p_body text`, `p_client_message_id uuid` | confirmed `{id,group_id,sequence,sender_id,sender_name,client_message_id,body,created_at}` |
| `group_history` | `p_group_id uuid`, `p_before_sequence bigint DEFAULT NULL`, `p_after_sequence bigint DEFAULT NULL`, `p_limit integer DEFAULT 50` | ascending sequence array, only post-join; no cursor gives latest page, before gives older page, after gives earliest next catch-up page |
| `group_mark_read` | `p_group_id uuid`, `p_sequence bigint` | void; only an existing entitled sequence, monotonic caller-only advancement |
| `messaging_inbox` | `p_before_activity timestamptz DEFAULT NULL`, `p_before_kind text DEFAULT NULL`, `p_before_id uuid DEFAULT NULL`, `p_limit integer DEFAULT 50` | combined direct/group array ordered descending `(last_message_at,kind,conversation_id)` |
| `messaging_unread` | none | array `{kind,conversation_id,count}` for incoming unread messages visible to this caller |

Combined inbox fields: `kind`, `conversation_id`, `student_id` (null for groups), `name`, `member_count` (null for DMs), `last_message_at` (viewer-specific activity used by the cursor), `message_time` (null without visible text), and `preview` (null without visible text). For new members without later text, activity uses their joined timestamp; no earlier message time/body is exposed as a preview. Keep all three cursor fields together. Cursor IDs must reference an authorized kind/conversation; history before/after modes are exclusive, and after may equal the caller's join floor. Limits are 1–50; friend search is at most 100 characters. `kind:id` keys isolate unread/caches even if UUIDs coincide across table kinds. Legacy `dm_*` signatures and rows are unchanged.

SQLSTATE `42501` denies eligibility/membership/friend/creator access, `22023` rejects validation/cursor/capacity, `P0001` indicates a selected friend closed new messages, and `23505` indicates changed request payload reuse. Missing RPC/table codes `PGRST202`, `42P01`, `42883` permit legacy-DM fallback; raw server details are not displayed. Other network/response failures retain retryable UI state. Empty/no-match friend results are distinct from failure.

## Isolated local checks

Use a fresh directory/unused local port. PostgreSQL 18 tools were installed under `/opt/homebrew/opt/postgresql@18/bin`. No hosted credentials are accepted by the group concurrency script; it is fixed to this disposable local endpoint.

```sh
/opt/homebrew/opt/postgresql@18/bin/initdb -D /tmp/wolfie-group-pg -A trust -U postgres --locale=C --encoding=UTF8
/opt/homebrew/opt/postgresql@18/bin/pg_ctl -D /tmp/wolfie-group-pg -l /tmp/wolfie-group-pg.log -o '-h 127.0.0.1 -p 55459 -k /tmp' start
/opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 55459 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql
for migration in supabase/migrations/*.sql; do
  /opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 55459 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$migration" || break
done
/opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 55459 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/group_messaging.sql
python3 supabase/tests/group_messaging_concurrency.py
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
npm --prefix server test
npm --prefix server run build
node client/test/group-messaging-browser.mjs
/opt/homebrew/opt/postgresql@18/bin/pg_ctl -D /tmp/wolfie-group-pg stop
```

The native-browser script uses installed local Chrome (override `CHROME_PATH`), temporary profile/screenshots and synthetic fixture persistence; it never connects to Supabase. SQL uses real PostgreSQL RLS/transactions but test-only Auth/Storage stand-ins, not managed services. Run older suites in their documented sessions: classmate profiles shares discovery's temporary assertion helper, while friends/recommendations define their own. Managed acceptance below must not be inferred from fixture results. When running the legacy recommendation/friend suites after all current migrations on this disposable cluster, reset the replaced `course_recommendation_profiles(text)` function before each historical suite, because its return projection evolved. Their scripts reinstall the current recommendation migrations. This reset is test-only and must never be used as hosted deployment SQL.

## Managed acceptance — pending owner execution

Use creator A, accepted initial friends B/C, accepted later friend D, and unrelated E in an authorized test project. Keep tokens/message bodies out of logs.

1. Create with A/B/C; verify 0/1 friend selection and unrelated/pending/self/duplicate/over-limit payloads fail. A may have new DMs off; every selected friend must be open. Confirm empty groups appear for all members and Cancel creates nothing.
2. Exchange literal Unicode/newline text from multiple senders. Close/reopen/reload/sign out and use another device. Confirm persistent permitted history, time-only styling, exact ordering, no markup execution, and unchanged DM behavior.
3. Send earlier text, then add D as creator. Verify D cannot retrieve earlier message bodies/previews/counts via RPC, direct SELECT, before/after cursors or Realtime; only later messages appear. B/C cannot add their own friends; E cannot inspect/join groups by UUID. No member can inspect other members' read positions.
4. Save D's new DMs off before a fresh addition is committed and test concurrent closure/addition and unfriend/addition. Confirm complete failure without partial membership. Existing joined members continue after preferences/friendships change.
5. Receive group text while on dashboard. Verify combined badge, highlighted row, own-send exclusion, independent DM/group clearing, hidden-page non-read behavior, older-history unread preservation and cross-device read positions. Reconnect actual Realtime after missing >50 messages and confirm bounded gap-free catch-up/polling fallback.
6. Simulate a committed create/add/send with lost response, retry unchanged, and verify one saved result. Test picker closure, page retry, focus, account replacement during pending creation/addition/send/retry/reconnect, and no private state leakage.
7. Test anonymous/ineligible/outsider direct reads/writes and event subscriptions. An ineligible member loses access but remaining eligible members can text. If exercising Auth deletion in a disposable test project, confirm neutral sender and ownerless-group behavior without new addition privileges.

## Rollback and spec reconciliation

Roll back the client first. The owner may review SQL revoking new group/combined RPC execution and group SELECT/publication access while retaining all tables, memberships, messages, read positions and private receipts for recovery. Preserve installed DM/profile/friend/Storage functions and policies; do not drop chat data as routine rollback. Reconcile completed prerequisite profile, friendship and direct-messaging specs before syncing/archiving this capability. Archiving is a separate explicit workflow.

## Removing members

The creator opens **Members**, chooses **Remove** beside another person, and confirms. Cancel makes no change. Removal can leave fewer than three members; the chat and all saved messages remain. The creator cannot remove themselves. Other members cannot remove anyone.

Apply `supabase/migrations/202610250002_group_member_removal.sql` once, after the original group migration. If the original migration is already installed, run only this new migration. No new credentials are required. Do not run test SQL on the shared database.

The new `group_remove_member(p_group_id uuid, p_member_id uuid)` RPC returns the creator's updated group detail. It removes membership/read state and updates group metadata, retaining messages and sender names. Membership RLS immediately denies further history, inbox, unread and sending; the open app clears revoked chat history/drafts on its next successful refresh (focus/reconnect or the ten-second poll). Already downloaded text cannot be recalled from another person's device. Remaining members can read the removed person's existing messages. Adding someone back requires the normal friendship/open-DM checks and starts a fresh history floor at rejoining.

Removal and sending acquire the same group row lock. Sending checks membership again after that lock, preventing a queued send from succeeding after a committed removal. A repeated removal of an absent member is a no-op; if the person has since been explicitly added again, a new removal removes that membership.

Local verification: `supabase/tests/group_member_removal.sql` covers creator/self/outsider restrictions, history retention, access revocation, fresh rejoin history and groups below the creation minimum. The concurrency test also covers removal racing with a blocked send. Hosted multi-account verification remains an owner-run step.
