# Stage 3C-2: Privacy Controls, Block Management and Contextual Warnings

Status: combined frontend implementation and local verification complete; awaiting
owner review. This replaces the separate planned frontend stages 3C-2/3C-3.
No deployment, commit, push, hosted SQL or hosted authenticated UI testing occurred.

The owner confirmed that the corrected Stage 3C-1 migration was already deployed
and its hosted postflight passed: schema/constraints, RLS/direct access, function
definitions/security/effective grants, publication safety and eight preservation
counts. That is owner-supplied evidence, not hosted execution by this agent.
Stage 3C-1 was not rerun, edited or redeployed. Its SHA-256 remains
`ca13cfbf472f6e2eecbbebc920bbd2f1f4794f23bea0141f19a685ee2ddd1b8a`.

## Implemented behavior

1. Profile shows server-confirmed Public/Private visibility. Its existing editor
   saves `is_private` through the owner-protected profile update, preserving other
   preferences/sharing. Missing/non-boolean privacy is a compatibility error, never
   a public default. Failed saves keep the draft; success is shown after confirmation.
   Existing sign-in copy explains the public default and reversible private mode.
2. Authorized friend/classmate profiles and direct-conversation headers provide
   Block/Unblock with inline confirmation, pending, failure and retry states.
   The intended operation is frozen through retries: a lost block reply followed
   by a refreshed outgoing list cannot turn Retry into Unblock, or vice versa.
3. Expandable Blocked Students uses only owner-protected outgoing rows, requesting
   `blocked_id,created_at,blocked_name_snapshot`. NULL/blank names display
   **Blocked student**. No profile, avatar or warning-name lookup reconstructs labels.
   Reads are paged; opening/focusing refreshes state; confirmed changes reconcile
   the list. Unknown names can be unblocked directly from this section.
4. Opened GroupChat shows private notices only after viewer membership is verified.
   Read-only groups remain eligible even when `can_send=false`. The leave action
   invokes the existing membership control, retaining its nonce/retry behavior.
5. Selected accepted Study workspaces show equivalent notices, including legacy
   groups with `can_invite=false`. Pending/expired invitation previews never invoke
   warning retrieval. The banner shares the existing Study leave handler and final-
   member confirmation; it adds no membership operation or Study messaging.
6. Dismissal uses the server warning UUID. Until confirmation the banner remains
   pending; failure retains it with Retry. Successful dismissal removes only that
   ID and reconciles current server state. Late reads cannot resurrect it, while a
   new episode's UUID remains eligible. No localStorage dismissal is used.

## Data flow and safeguards

Privacy APIs use the existing authenticated Supabase client and unchanged database
contracts. Each operation checks the initiating student against the current session,
pins that session's bearer header and supports cancellation. A profile save similarly
checks the profile owner and pins its bearer. These are session-isolation safeguards;
RLS/RPC authorization remains the security boundary. No service-role browser access,
new Express route, provider, credential or account-switching feature is introduced.

The two small stores are scoped by authenticated student and, for warnings, context
and group. React reads immutable snapshots with useSyncExternalStore. Constructors
and renders do no networking. Controlled committed-context effects activate warning
fetching; StrictMode cleanup/setup shares the in-flight request. Real unmount/logout
invalidates/aborts work, and late completions cannot populate a replacement scope.
Aborting a dispatched mutation is not a guarantee that the server rolled it back.

Warning retrieval remains a VOLATILE POST call with possible lazy state creation:
`shared_group_warnings({p_context:'messaging'|'study',p_group_id})`. There is one
in-flight read per opened context, bounded visible polling (10 seconds in Messages,
15 in Study), coalesced focus/reconnect and explicit confirmed-privacy invalidation.
No per-message subscription drives warning retrieval, no inbox/list prefetch occurs,
and neither block nor private warning tables are subscribed to or written directly.
`dismiss_shared_group_warning({p_warning_id})` owns dismissal persistence. Backend
membership/block cascades and fresh UUIDs own episode rearming; frontend timestamps
or message floors do not reconstruct episodes.

Confirmed privacy changes refresh friendship/request, classmate and recommendation
projections; root state closes cached profile dialogs and remounts the directory to
clear cached discovery. An authoritative outgoing-list change also invalidates these
views, handling another session's changes or reconciliation after a lost reply.
Invalid-authentication errors clear cached block identities and warning data. Existing
auth lifecycle clears the workspace on logout. Existing message history, unread
counts, academic reminders, Study resources and optional sharing remain separate.

Contextual warning names are current group-authorized identity. Block-management
names are historical authorized snapshots. They are distinct types/contracts and
are never substituted for each other. Generic errors do not expose internal SQL,
target privacy choices or incoming block relationships.

## Exact Stage 3C-2 file manifest

New source:
- `client/src/useStudentPrivacy.ts`
- `client/src/useSharedGroupWarnings.ts`
- `client/src/StudentPrivacyControls.tsx`
- `client/src/StudentPrivacyControls.css`

Modified source:
- `client/src/App.css` (profile switches and group settings layout)
- `client/src/StudyGroups.css` (invitation rows, counts and capacity guidance)
- `client/src/StudyInvitationPicker.tsx` (presentation only)
- `client/src/account.ts`
- `client/src/useAccount.ts` (save-phase session-generation guard)
- `client/src/App.tsx`
- `client/src/Profile.tsx`
- `client/src/studentPrivacy.ts`
- `client/src/FriendProfileDialog.tsx`
- `client/src/PeerProfileDialog.tsx`
- `client/src/Messages.tsx`
- `client/src/StudyGroups.tsx`
- `client/src/GroupMembershipControls.tsx` (shared existing leave control and busy/retry state)
- `client/src/useGroupChat.ts` (clear revoked membership instead of retaining old detail)
- `client/src/useClassmates.ts`
- `client/src/useCourseRecommendations.ts`
- `client/src/useFriendships.ts`

New tests:
- `client/test/privacyControls.test.tsx`
- `client/test/privacyWorkspaces.test.tsx`

Modified tests/fixtures:
- `client/test/groupMessaging.test.tsx` (settings disclosure and existing actions)
- `client/test/studyPrivacy.test.tsx` (pending counts, expiration and invitation display)
- `client/test/studentPrivacy.test.ts`
- `client/test/profile.test.tsx`
- `client/test/account-api.test.ts`
- `client/test/account.test.tsx`
- `client/test/classmate-preview.tsx`
- `client/test/messaging-preview.tsx`
- `client/test/courseRecommendations.test.ts`
- `client/test/courseRecommendationsDashboard.test.tsx`
- `client/test/friendship.test.tsx`

The preview/recommendation/friendship fixture edits only supply the required
authoritative privacy boolean. Existing preview functionality is not expanded.
`useAccount.ts` passes its existing session generation into profile-save phases.
`Friends.tsx` is reused without source edits; root directory remounting provides its integration.

Documentation: this new file; the change's `proposal.md`, `design.md`, and `tasks.md`.
Pre-existing Stage 3C-1/planning working-tree files are not new UI implementation.

## Local verification

- Complete client suite: `npm test -- --reporter=dot --maxWorkers=2`:
  **31 files, 321 tests passed; 0 failed, 0 skipped**.
- `npm run lint`: PASS.
- `npm run build`: PASS, including TypeScript project compilation. Existing Vite
  large-chunk warning remains; no unrelated bundle refactor was introduced.
- Strict OpenSpec validation and `git diff --check`: recorded with final review.
- No PostgreSQL harness or SQL fixtures were rerun in this frontend-only pass.

The final tests cover private loading/save/error handling; snapshot/fallback-only
management; block/unblock errors, confirmation and fixed-intent retry; session token
binding; logout/invalid authentication/late responses; StrictMode coalescing; cache
invalidation; deferred authorization before Messages warnings; accepted-only Study
warnings despite closed admission; existing leave; persisted dismissal/new sessions;
old/new UUID races, context changes and membership revocation. Existing friendship,
messaging, unread, Study and academic client regressions also ran.

Early verification found an expected five-to-six checkbox assertion change. One
unbounded parallel run had 301 passes and an existing lazy Campus Explorer load
timeout. The account suite passed alone (30 tests), and bounded full runs passed
(302 before the added retry regression; 303 before the final-review corrections). No production navigation
workaround or increased test timeout was added. A tool-runtime interruption required
repeating the final run; no result from an interrupted run is claimed. Final logs are
under ignored `supabase/.temp/privacy-ui-checks/`.

These are mocked/component integrations, not native-browser accessibility scans or
hosted Auth/PostgREST end-to-end tests. Hosted behavior remains to be observed with
authorized, consenting accounts. Never create production test records automatically.

## Final-review corrections

- Profile saving previously checked identity only before avatar upload. The account
  hook now supplies its initiating session-generation guard. Saving checks it after
  upload and while revalidating the authenticated owner immediately before UPDATE.
  Logout, replacement and unmount prevent subsequent writes. A completed stale
  upload is left unreferenced; cleanup does not start in an invalidated session.
  This cannot reverse an UPDATE or upload already dispatched to the server.
- Confirmed privacy-change events now increment the warning-read revision and
  immediately clear old warnings, even while a read or dismissal is pending.
  Reconciliation is coalesced; obsolete reads cannot repopulate the view. A failed
  fresh read leaves no obsolete warning, and retry can reveal a new episode UUID.
  Queued reconciliation also drains after a failed pending dismissal.
- Messages shares the existing membership controller's Leave button and its
  busy/unconfirmed-attempt state. Study shares its existing leave handler and
  disabled state. Banners explain temporary unavailability; nonce retries and
  final-member confirmation remain in the original controls.

Eight new regressions cover three post-upload invalidation cases, invalidation
at the final session check, two warning races, and both workspaces' available,
busy and unconfirmed leave states with same-nonce retries. Focused regression
run: 42 passed across three files. Full client gate: 311 passed across 31 files,
0 failed/skipped. Lint, standalone TypeScript, production build, strict OpenSpec
validation and diff checks pass. The existing large-chunk build warning remains. An initial lint failure on
passing a ref-reading event callback through a render function was corrected by
passing the existing button element; no lint suppression was added.

At the correction gate the frontend manifest contained 33 files (one additional runtime file,
`useAccount.ts`); pre-existing Stage 3C-1 and planning changes remain separate.
Correction logs are in ignored `supabase/.temp/privacy-ui-checks/corrections-*.log`.
No database or hosted verification was repeated in this corrective pass.

## Frontend polish and pending-count correction

Profile boolean settings now use native checkbox inputs with the accessible switch
role, visible On/Off text, keyboard focus, disabled states and reduced-motion support.
Private Mode help remains associated with its input. These switches edit the same
unsaved draft; persisted visibility still comes from the server, and saving/error
handling is unchanged. Blocked Students uses a spaced native disclosure, the same
snapshot/fallback labels and a styled empty state. Shared warning banners use compact
secondary actions and responsive layouts, including larger coarse-pointer targets.
Messages group controls are grouped visually; their operations are unchanged.

`my_study_groups` already returns accepted-only `members` plus an authorized
`pending_count` of verified, unexpired invitations. `parseGroup` preserves that count.
Cards incorrectly counted pending rows inside the accepted-only roster, producing
zero despite active invitations. Cards now render `pending_count` directly, just as
the workspace header does. No pending identities or outgoing-invitation length are
used to reconstruct a count. Existing confirmed-operation and background refreshes
update the displayed counts; there is no optimistic count or client-side expiration
authorization. Received and sent expiration labels now use month names and minutes
without seconds (for example, November 28, 2026 7:12 PM), preserving browser-local time.

Seven added cases cover independent API count mapping, count changes on refreshed
membership, confirmed invitation refresh without optimistic updates, readable dates,
empty/populated disclosure behavior and accessible switch draft/save/error states.
Existing warning, leave-busy, retry and session regressions remain intact. Focused
gate: 73 tests across six files passed. Complete client gate: 318 tests across
31 files passed, zero failed/skipped. Standalone TypeScript, production build, lint
and diff checks passed; the existing build chunk-size warning remains. The first
focused run had 72 passes and one ambiguous status-selector failure in the new test;
the selector was corrected and the focused suite passed on rerun. No OpenSpec
behavior or database contract changed.

The combined frontend manifest now has 35 files, including the earlier corrective
pass; the nine-file polish pass is limited to Profile, StudyGroups,
StudentPrivacyControls, their existing styles, three tests and this guide. Native
browser/mobile visual review and hosted multi-user verification remain pending.

## Invitation management and Group Settings presentation

Study Buddies retains authoritative accepted/pending counts and now presents them
as subtle badges. The existing additional-invitation disclosure has clearer offering
selection, capacity and seven-day-expiration guidance. Sent invitations use compact
name/status/expiration rows containing only the same authorized projection. No new
invitation actions, candidate queries, capacity calculations or expiration rules
were introduced.

Messages headers retain the group name, member count, Back navigation and an
expanded-state-labelled Group Settings button. The inline labelled panel organizes
members, Add Members, the existing policy editor and Leave Group. Closing returns
focus to the toggle. Controls remain mounted while hidden, retaining retry nonces,
unsaved policy selection and request timing. Warning banners remain outside the
panel. If banner Leave fails while the panel is closed, the same existing error and
retry controls appear in the conversation; they move back into the panel when open.
The group-only empty state preserves the post-join history explanation and sending
restrictions. No DM behavior changed.

Regressions cover disclosure visibility, focus return, retained drafts, no extra
conversation fetches, existing add/save/leave actions, warnings outside settings,
closed-panel leave failure/retry, and authorized sent rows and capacity display.
The initial new empty-state test omitted its fixture's group seed; it was corrected
without changing production logic. Final verification: 70 focused tests across
five files and 321 complete client tests across 31 files passed, zero failed/skipped.
Standalone TypeScript, production build, lint and diff checks passed. The existing
large-chunk build warning remains. Three new tests cover settings lifecycle, sent
invitation presentation and closed-panel leave-error retries; existing action and
warning tests were adapted to the settings disclosure. Desktop/mobile visual and
native keyboard review remain manual.

The cumulative frontend manifest now contains 38 files. This ten-file presentation
pass changes six source/style files, three test files and this guide. Existing
Stage 3C-1 and earlier planning files remain untouched by this pass.

## Manual single-user checklist (not executed)

Use the existing local React/Express application and your own authorized account;
perform hosted writes only when the owner authorizes those smoke tests.

- [ ] Confirm initial Public/Private status matches the saved setting after reload.
- [ ] Enable/disable Private Mode, save, reload, and confirm persistence. Verify DM,
  group-addition and optional sharing values were preserved.
- [ ] Simulate offline saving: keep the draft, show failure and retain the confirmed
  status. Restore connectivity and retry explicitly; do not auto-submit drafts.
- [ ] Expand Blocked Students: check loading, empty/error/retry, saved names and
  generic fallbacks using only records you are authorized to manage.
- [ ] Inspect network requests: management reads select only approved block fields;
  no hidden profile/avatar calls and no private-table writes.
- [ ] Navigate with keyboard; confirm labels, pending-disabled controls, confirmation
  cancellation, dismissal focus and readable layouts at desktop and 375px.
- [ ] Open existing DM/group history and accepted Study data; verify ordinary
  messages, unread state, drafts, academic features and collaboration still work.
- [ ] Sign out while a request is pending; confirm privacy UI disappears and late
  responses do not populate the next login. No account-switching UI is required.

## Consenting multi-user hosted checklist (not executed)

Arrange owner-approved test relationships/groups with blocker A, target B, independent
member S, and where available a pending Study invitee P. Peer operations affect real
friendship/request state; obtain consent before blocking, leaving or creating groups.

- [ ] Public/private discovery and private accepted-friend profile access remain
  correct; copied identifiers do not enable hidden-profile lookup.
- [ ] Block through an authorized profile: friendship/pending cleanup occurs and
  both DM directions are restricted. Both students retain existing shared groups.
- [ ] In Blocked Students, validate a legitimate saved snapshot and a NULL/blank
  fallback; unblock without opening the target. No friendship or reverse block is
  restored/removed by that action.
- [ ] In shared Messages and accepted Study workspaces, only outgoing blocker A
  sees notices. B/S receive no direction, peer warning count, bell item or fake unread.
- [ ] P's pending/expired invitation previews never call warning retrieval. Verify
  authenticated direct-RPC denial for unauthorized contexts as separately approved.
- [ ] Open a group below three eligible active members and a legacy accepted Study
  group closed to new invitations: notices remain available without enabling sends
  or admissions.
- [ ] Dismiss, refresh, navigate away/back, logout/login: the continuing episode
  stays dismissed. Simulate lost replies and retry the same warning ID safely.
- [ ] Unblock/reblock or either participant leaves/rejoins: a new warning UUID
  appears; delayed dismissal of the previous ID does not hide it.
- [ ] Revoke membership or delete the final-member Study group while its view is
  open: old warnings/details clear after authorized refresh and stay unavailable.
- [ ] Verify banner leave uses the existing operation, retry nonce and Study final-
  member confirmation, without disturbing remaining collaboration/history.

## Review boundary

All six frontend features are implemented and locally tested. Owner/consenting-
account hosted RPC/browser checks remain pending, along with native browser/mobile
accessibility observation. The local results do not constitute complete hosted
end-to-end verification or deployment approval. No migrations, RLS/grants/functions,
publications, semester calendar, environment or credentials were changed.
