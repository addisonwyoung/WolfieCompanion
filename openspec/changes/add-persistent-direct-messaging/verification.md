# Verification — 2026-10-23

Branch: `codex/persistent-direct-messaging`. Implementation and all 19 apply tasks are complete. Hosted deployment/managed-service acceptance is pending owner execution; no hosted SQL, credentials, real accounts, or messages were used.

## Automated checks

| Check | Actual command / result |
| --- | --- |
| Client regression suite | `npm --prefix client test -- --reporter=dot`: 15 files, 133 tests passed |
| Client lint | `npm --prefix client run lint`: passed |
| Client production build | `npm --prefix client run build`: passed; Vite reports the existing large-chunk advisory (current JS about 556 kB uncompressed) |
| Server regression suite | `npm --prefix server test`: 25 tests passed, including classmate/friend picture authorization endpoints; local HTTP fixtures, no paid services |
| Server build | `npm --prefix server run build`: Prisma generation and TypeScript passed |
| OpenSpec | `openspec validate add-persistent-direct-messaging --strict`: valid |
| Whitespace | `git diff --check`: passed |

Node 22.14.0 was selected through the local nvm PATH. PostgreSQL 18 used a disposable trust-auth local cluster at 127.0.0.1:55449, user/database postgres. Initial development cluster: `/tmp/wolfie-dm-pg`; final fresh-sequence verification: `/tmp/wolfie-dm-verify-pg`. Both are stopped and retained locally for inspection.

The fresh sequence used the exact commands in `docs/direct-messaging.md` with the fresh cluster directory substituted. Bootstrap, accounts migration, accounts suite and rerun suite passed; remaining migrations through `202610230001_direct_messaging.sql` applied successfully. Discovery and classmate-profile suites passed in one session (the latter uses the former's temporary assertion helper); recommendations, friendships, and direct messaging passed in separate sessions. Logs: `/tmp/wolfie-dm-bootstrap-check.log`, `/tmp/wolfie-dm-migration-check.log`, `/tmp/wolfie-dm-profiles-check.log`, and `/tmp/wolfie-dm-{course_classmate_recommendations,friend_requests,direct_messaging}-check.log`.

`python3 supabase/tests/direct_messaging_concurrency.py` passed on the fresh cluster: reciprocal first sends create one pair/thread, simultaneous same-request retries create one row, and a preference closure holding the recipient row rejects a subsequent first send without leaving an empty thread. SQL fixtures exercise participant RLS/direct write denial, default-on preferences, accepted/pending/shared-course authorization, literal Unicode validation, replay/collision behavior, >50 message/conversation paging, foreign cursors, existing-chat continuation after closure/relationship changes, and ineligible-peer history behavior.

The user approved the existing recommendation test's `min(student_id::text)` assertion fix. PostgreSQL does not provide `min(uuid)`. The existing profile checkbox-count assertion now includes the new setting. No unrelated application behavior was changed for those fixes.

## Native browser acceptance

`node client/test/messaging-browser.mjs`: PASS at 1280×900 and 375×900 using installed headless Chrome, native pointer/key dispatch, real profile dialogs, Profile editor, Messages components, and synthetic localStorage persistence. CDP visible-focus emulation keeps Chrome's test page visible; hidden-view timer/subscription cleanup is independently covered by the hook test. No Supabase connection is made.

Verified at both widths:

- Authorized friend and non-friend profiles open Message, close native modality, and focus chat heading.
- Initial sends, Ctrl+Enter, Unicode, line breaks, and literal markup render safely.
- Closing discards unsent text; saved messages survive reopen and browser reload.
- Incoming refresh updates history/inbox; lost acknowledgement followed by Retry produces one row.
- Saving recipient new DMs off permits established chats while disabling fresh pair creation.
- More than 50 messages catch up in bounded pages; reopening loads 50 and Load older reaches the remainder.
- Prepending history preserves visual anchor; incoming messages preserve older-reader scroll and expose New messages.
- No horizontal overflow; Back/Send remain reachable on phone.
- Account replacement during a pending send clears old private state and native modality; late results do not populate the next account.

Screenshots were visually inspected for desktop and phone chat. All six screenshots are in:
`/var/folders/qc/wjnj2dzn5gv46y96_ktcsrd00000gq/T/wolfie-messaging-5JHdMM/`

Files: `chat-1280.png`, `friend-1280.png`, `history-1280.png`, `chat-375.png`, `friend-375.png`, `history-375.png`.

Component/hook/App tests additionally cover strict projections and cursors; availability save/reload/cancel/failure; pending request profile identity; pointer and both keyboard shortcuts; duplicate submit; unchanged retry UUID/body; refresh racing failed retry; invalid sender/history ownership; failed page retry without cursor advance; stale contact reads and rapid reopen; multi-page missed-event catch-up; subscription/focus/online/poll behavior; visibility/unmount cleanup; and account replacement during load/draft/send/retry/reconnect.

## Remaining owner deployment work

Review and manually apply the additive migration, deploy the client, communicate default-open new DMs, and perform the two-participant plus unrelated-account checklist in `docs/direct-messaging.md`. Managed Auth tokens, PostgREST response serialization, participant Realtime event privacy, actual device persistence, reconnect behavior, and a deployed closure/send race were **not** verified by local fixtures. These are explicitly pending, not claimed as passed. No new messaging key/service is required. Rollback preserves message tables/data. Spec synchronization/archive is a separate workflow, with prerequisite profile/friend changes reconciled first.

## Requested composer refinement

Message bubbles now display local hour/minute only. The composer is a compact expanding textarea with a 44px send icon in the existing burgundy palette. Enter sends, Shift+Enter inserts a newline, and IME composition Enter does not send. Updated documentation/spec shortcuts and existing tests match this user-requested behavior. Client tests remain 133/133; lint/build, OpenSpec validation, and desktop/375px native browser flows pass. Latest screenshots: `/var/folders/qc/wjnj2dzn5gv46y96_ktcsrd00000gq/T/wolfie-messaging-r6WH93/`. No database changes are needed for this UI refinement.

## Requested unread highlights

Added `202610230002_message_unread.sql` for private persistent per-participant read positions and caller-scoped `dm_unread`/`dm_mark_read` RPCs. Only a disposable local PostgreSQL cluster received the migration. `supabase/tests/message_unread.sql` passed: incoming-only counts, independent viewer state, monotonic read sequences, newer arrivals surviving stale acknowledgements, future/foreign cursors, private direct-table denial, and third-party/ineligible/anonymous access denial. The test cluster is stopped. Hosted application remains pending owner action.

Client tests: 16 files, 137 tests pass; lint/build, whitespace and OpenSpec validation pass. Native Chrome acceptance at 1280px and 375px includes receiving while outside Messages, navigation unread badge, highlighted conversation rows, opening and clearing read status. Latest screenshots (including visually inspected `unread-375.png`): `/var/folders/qc/wjnj2dzn5gv46y96_ktcsrd00000gq/T/wolfie-messaging-PCu7LL/`. Hook/component checks include hidden chat behavior and failed read acknowledgement retention/retry. Workspace-wide refresh uses protected Realtime invalidation plus visible 10-second polling. No hosted keys/services or sender-visible read receipts were introduced.
