# Verification — 2026-10-25

Branch: `codex/persistent-group-messaging`. The implementation is local and uncommitted. No hosted SQL, real accounts, production messages, new credentials, or paid services were used. Managed acceptance remains pending owner execution.

## Checks

| Check | Result |
| --- | --- |
| `npm --prefix client test -- --reporter=dot` | 17 files, 156 tests passed |
| `npm --prefix client run lint` | Passed |
| `npm --prefix client run build` | Passed; existing Vite large-chunk advisory, current JS about 581 kB before compression |
| `npm --prefix server test` | 25 tests passed, including existing classmate/friend picture routes |
| `npm --prefix server run build` | Prisma generation and TypeScript passed |
| `openspec validate add-persistent-group-messaging --strict` | Valid |
| `git diff --check` | Passed |

Node 22.14.0 was selected via the local nvm PATH. The final migration `202610250001_group_messaging.sql` was applied from the committed-style file to a freshly initialized local PostgreSQL 18 cluster, including every existing prerequisite migration. Development cluster: `/tmp/wolfie-group-pg`; fresh final verification cluster: `/tmp/wolfie-group-final-pg`; both used local 127.0.0.1:55459, postgres user/database. Both clusters are stopped and retained for inspection.

Fresh migration/setup commands are documented in `docs/group-messaging.md`; the final run substituted the new final cluster directory. Existing accounts and rerun suites passed; discovery and classmate profiles passed together in their shared temporary-helper session; recommendation, friendship, direct messaging, unread, and group suites passed in their required separate sessions. Historical recommendation/friend test scripts reinstall earlier versions of the recommendation RPC, so that replaced signature was reset only inside the disposable database before each historical suite; their migration includes restore the current function. No hosted reset or application behavior change was made.

Logs: `/tmp/wolfie-group-final-setup.log`, `/tmp/wolfie-group-accounts.log`, `/tmp/wolfie-group-rerun.log`, `/tmp/wolfie-group-classmates.log`, `/tmp/wolfie-group-recommendations.log`, `/tmp/wolfie-group-friends.log`, and `/tmp/wolfie-group-regression-{direct_messaging,message_unread,group_messaging}.log`.

The user explicitly approved three stale-test corrections: the Friends button includes its current count; the unsaved-course check now uses PHY 131 because its caller fixture now saves AMS 210; and the unrelated-request privacy check filters the other pair because that fixture now also receives its own legitimate request. These change assertions only.

## Database coverage

`supabase/tests/group_messaging.sql` passed on the fresh schema. It covers accepted-friend selection across courses (>50 candidates), eligibility/closure reasons, invalid/self/duplicate/oversized member sets, Unicode name/text bounds, atomic failure, canonical exact creation/addition/send replay, changed-payload collisions, creator-only additions, empty groups, post-join direct SELECT/history/preview/unread denial, entitled later history, foreign/pre-join/future/conflicting cursors, own read positions, direct-write/peer-read-position denial, existing groups after closure/unfriending, >50 message and mixed inbox pages, independent group/direct unread counts, ineligible/anonymous/outsider access, old-policy preservation, and creator/sender Auth deletion with retained group history and no inherited owner authority.

`python3 supabase/tests/group_messaging_concurrency.py` passed against the fresh local cluster. Actual independent SQL sessions cover concurrent duplicate creation, addition, and send attempts; message-versus-join sequence ordering; closure holding the recipient lock before addition; friendship deletion ordered before addition; and simultaneous additions racing the 50-member capacity. One receipt/membership/message results per identical attempt; rejected additions leave no partial rows and timed operations complete without deadlock.

These are real local PostgreSQL transactions/RLS using test Auth/Storage stand-ins. They do not validate managed Auth tokens, PostgREST transport, or actual hosted Realtime delivery.

## UI, lifecycle, and browser acceptance

Component/adapter/hook/App tests cover strict projections/identity/cursor parsing, stripping private fields, missing-group-schema-only DM fallback, combined kind/UUID read routing, minimum friends and closed candidates, search/selection retention, page retry at the same cursor, exact lost-acknowledgement creation and message retry, group membership/sender validation, pre-join message rejection, multi-page catch-up and older history, late retry response reconciliation, creator-only additions, native modal-to-chat focus, literal markup/newlines, and account replacement during create/add/send/retry/reconnect. The shared composer keeps Enter, Shift+Enter, IME safety and direct-chat sender ownership. Read visibility tests include hidden pages and a native picker covering the active chat.

`node client/test/group-messaging-browser.mjs` passed at 1280×900 and 375×900 using local Vite, headless Chrome, native pointer/key dispatch, actual GroupPicker/Messages/notification components, and synthetic localStorage persistence. Verified minimum friends, idempotent create response loss, creator-only additions, closure/unfriending after selection, post-join privacy, actual sender labels, multi-sender sends, persistent reload, lost send response retry, unread navigation while on dashboard, conversation highlight/read clearing, >50-message catch-up/older pages, preserved scroll/New messages, focus cleanup, and external account replacement during a pending send. The script checks normal checkbox sizing and no horizontal modal/page overflow. Screenshots were visually inspected after correcting inherited global checkbox sizing.

Final group screenshots: `/var/folders/qc/wjnj2dzn5gv46y96_ktcsrd00000gq/T/wolfie-group-messaging-uGfEn9/` (`picker-*`, `later-member-*`, `notification-*`, `chat-*` at both widths).

`node client/test/messaging-browser.mjs` also passed its existing direct-chat flows at both widths, preserving profile launch/focus, compact send UI, Unicode literal text, persistence, incoming updates, retry, settings, pagination/scroll, and account teardown. Direct regression screenshots: `/var/folders/qc/wjnj2dzn5gv46y96_ktcsrd00000gq/T/wolfie-messaging-3CqjAr/`.

The browser harness uses visible focus emulation so headless Chrome exercises visible-view behavior; hidden/unmounted lifecycle is separately tested. All data is synthetic and no Supabase connection is made by fixtures.

## Owner deployment remaining

Review and manually apply `supabase/migrations/202610250001_group_messaging.sql` after the installed prerequisites, then deploy/restart the client. Follow the creator A, initial B/C, later D and unrelated E checklist in `docs/group-messaging.md`: real devices/reload, caller identity, pre-join table/RPC/preview/event privacy, protected Realtime reconnect, membership/availability races, independent cross-device read positions, and account cleanup. These managed-service checks are explicitly pending rather than claimed as complete. No new key or messaging service is needed. Rollback preserves all saved data. Spec sync/archive is a separate workflow after prerequisite spec reconciliation.

## Member removal follow-up — 2026-10-25

Added `202610250002_group_member_removal.sql` separately from the already deployed original group migration. Hosted application remains manual and pending.

Passed after follow-up:
- Client tests: 161/161 across 17 files; lint and production build. Existing Vite bundle-size advisory remains.
- New disposable-local `group_member_removal.sql`: creator/noncreator/outsider/self authorization, repeated absent removal, RLS/history/send/read denial, combined inbox/unread removal, retained sender history, readdition floor, and one-member retained group.
- Existing `group_messaging.sql` regression passed with removal migration installed.
- Extended `group_messaging_concurrency.py`: duplicate mutation/send, join boundary, closure/unfriend/capacity races and blocked-send rejection after committed removal all passed.
- Native Chrome fixture at 1280px and 375px: full existing group flows plus removal cancellation/confirmation, retained removed-sender messages and removed-account empty inbox. Screenshots: `/var/folders/qc/wjnj2dzn5gv46y96_ktcsrd00000gq/T/wolfie-group-messaging-iLZwgs/` (including `remove-confirm-375.png`, visually inspected).
- Strict OpenSpec validation and whitespace diff checks passed.

The app discards revoked contact/history/draft state on its next successful access refresh; authoritative database access is revoked at removal commit. Rejoining resets cached history even if the client missed the intervening removal. Existing direct chat pair authorization remains unchanged. No hosted database, branch push, commit, merge, or archive was performed.
