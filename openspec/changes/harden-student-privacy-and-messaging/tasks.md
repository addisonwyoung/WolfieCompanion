# Tasks

Final group-chat rules are approved: automatic first admission including private friends, equal active-member invitation permissions, self-leave only and acceptance after voluntary departure. All tasks remain unchecked; documentation validation does not authorize apply.

## 1. Schema and authorization foundations

- [ ] 1.1 Add owner-reviewed additive settings/block schema and existing/new-account backfill/default logic; verify fresh-install and populated-upgrade fixtures preserve profile data, existing public status, new public defaults, true/false DM mapping and independent group consent, including concurrent signup.
- [ ] 1.2 Add conditional re-add invitation state, membership episodes/voluntary-leave records and existing study section context; verify constraints, unique pending invitations, no pending active memberships, preserved IDs/messages/read positions and safe legacy-section handling in SQL fixtures.
- [ ] 1.3 Implement caller-derived eligibility, verified offering, privacy/context and bilateral-block predicates with fixed security-definer search paths and narrow grants; verify anonymous, ineligible, forged caller and direct helper execution denial without changing academic ownership policies.
- [ ] 1.4 Establish shared pair/profile/group lock ordering for consent and relationship mutations; verify concurrent block/preference/admission operations serialize without deadlocks or stale permission commits.
- [ ] 1.5 Document migration order, legacy-client cutoff, defaults, compatibility and data-preserving rollback; verify the documented local fresh/upgrade sequence and obsolete-setting-write rejection in disposable databases.

## 2. Blocking and friendship enforcement

- [ ] 2.1 Implement block/unblock and owner-only block listing; verify atomic friendship removal, pending-request invalidation, reverse-block persistence, safe retries, no automatic restoration and no peer-readable block direction with SQL tests.
- [ ] 2.2 Harden all friend send/respond/profile/directory/relationship overloads and direct SELECT grants/policies; verify stale accept cannot recreate friendship and legacy/direct identifier calls cannot bypass blocks or privacy.
- [ ] 2.3 Add profile/DM block controls and independent block management; verify hidden targets can be unblocked, failures retain confirmed state, account changes discard stale results and no block notification is emitted in client tests.
- [ ] 2.4 Document shared-group exceptions and generic peer-facing failure behavior; verify accessible notices explain retained identity/interaction and do not reveal which member blocked an invitee.

## 3. Profile discovery and onboarding

- [ ] 3.1 Separate university-wide public search from scoped classmate/Study predicates across current and legacy entry points, retiring unsafe overloads; verify database public/private caller/target matrices, cross-major/course/friendship search, private autocomplete exclusion, authorized private-friend exceptions, scoped pending/rejected enrollment rejection and sensitive-field exclusion.
- [ ] 3.2 Harden Express avatar checks and service-role resolver families consistently; verify private/block/field-sharing revocation, arbitrary/superseded path denial and no-store picture delivery with server/SQL tests.
- [ ] 3.3 Add reversible private-mode settings and onboarding, preserve optional sharing, and invalidate cached discovery/profile/candidate state; verify new-account defaults, save failure/retry, intentional contact disclosure, late response rejection and private browsing of public peers in client tests.
- [ ] 3.4 Replace obsolete always-shared/no-opt-out copy in UI and setup docs; verify notices distinguish general discovery, friend access, group identity, historical contributions and voluntary private collaboration at desktop and 375px.

## 4. Mutual direct messaging

- [ ] 4.1 Replace first-send-only checks with common mutual preference/block authorization on every new insertion; verify all nine preference combinations for friend/non-friend and established/new pairs, public/private targets and either-direction blocks in SQL tests.
- [ ] 4.2 Align new classmate DM contact with verified current course/section/professor and preserve established contacts under eligible-students; verify pending/rejected/wrong-offering and UUID-only denial plus course-loss continuation and friends-only unfriend freeze.
- [ ] 4.3 Preserve participant history/read positions and exact committed replay semantics while rejecting uncommitted retries after revocation; verify no duplicate messages, empty threads, sequence/activity changes or unauthorized direct writes in SQL/concurrency tests.
- [ ] 4.4 Update account adapters, settings, contact-state parsing and read-only composer explanations; verify mutual restrictions apply to existing chats, history remains openable, drafts never auto-send and old boolean writes fail actionably in client tests.
- [ ] 4.5 Integrate permission refresh with existing visible polling/focus/reconnect and notifications; verify denied sends create no new alerts, historical unread remains coherent and account teardown clears state. Document mutual semantics and the false-to-no-one existing-chat behavior change.

## 5. Section-based Study Buddies collaboration

- [ ] 5.1 Preserve section/classmate/name/create UI and one-to-seven invitee limit; implement verified current-semester section candidates with public classmates and authorized private friends in the same picker. Verify friendship is unnecessary for public classmates, private non-friends remain hidden and professor matching is not required by Study Buddies tests.
- [ ] 5.2 Isolate pending previews from rosters, availability, roles and tasks; verify pending private/public invitees cannot retrieve member content via RPC/direct access and decline discloses no private status.
- [ ] 5.3 Revalidate section, eligibility, privacy-friend exception and blocks on acceptance; verify pending/rejected/wrong-section denial, no automatic friendship/DM changes, preserved pending invitations and accepted legacy participation without guessing professors.
- [ ] 5.4 Preserve historical task attribution on voluntary departure while removing active membership/availability/selection entries and retaining Study Buddies ownership behavior; verify private owner/member leave and last-member handling do not erase retained contributions.
- [ ] 5.5 Document the section-based privacy exception and preserve private creation/participation; verify the existing four-step UI at desktop/375px, stale candidate invalidation and account-switch isolation.

## 6. Member-managed messaging admission

- [ ] 6.1 Revise the existing picker and candidate RPCs to show friend suggestions and university-wide public search plus authorized private friends, with bounded deduplicated paging; verify cross-major non-friend selection, private non-friend/autocomplete denial and unchanged two-selected-recipient creation minimum/50-member maximum in SQL/client tests.
- [ ] 6.2 Replace creator/friendship-only add/invite authorization with equal eligible active-member authorization and automatic normal admission; verify non-creators add cross-course non-friends without friendship creation or DM permission changes, and independent group consent/blocks/capacity still apply. Verify authorized private friends join automatically on first addition, subject to the same eligibility, consent, capacity and block checks.
- [ ] 6.3 Add pending re-add invitations after voluntary leave, explicit accept/decline and current active-inviter revalidation; verify public former members cannot be automatically re-added, former members cannot self-rejoin or submit in-app rejoin requests, private requests for invitations do not bypass mutual DM permissions, pending people receive no content, and duplicate retries preserve consent boundaries.
- [ ] 6.4 Enforce no new blocked pairing at creation/automatic addition/re-add acceptance and serialize admission with blocks/consent/capacity changes; verify generic failures, entire-batch rollback, safe unrelated additions around existing blocked co-members and no leaked private status.
- [ ] 6.5 Update picker labels, honest active/pending results and documentation while retaining layout/name/selection/retry behavior; verify keyboard/focus/mobile/account replacement and no fabricated unread counts from pending invitations.

## 7. Messaging departure and membership history

- [ ] 7.1 Implement idempotent voluntary leave for every eligible active member, including creator, with no manager/succession/ownership roles; verify creator and ordinary members have equal invitation permissions and any member can leave with one, two or more active members. Retire creator-only peer-removal UI/RPC authority and verify creator/ordinary-member attempts to remove another person fail through current and legacy paths, without introducing removal roles.
- [ ] 7.2 Preserve membership episodes and voluntary-leave reasons across re-adds; verify durable internal history is not exposed as discovery or former-member access and repeated re-add attempts always require consent after voluntary departure and migration fixtures identify unavailable historical leave evidence without fabricating it.
- [ ] 7.3 Make final-member groups inactive with retained data and canceled pending invitations; verify no messages/admissions/self-rejoin via creator IDs, legacy RPCs, tables or stale receipts and no active inbox/unread entry.
- [ ] 7.4 Enforce fresh automatic-join/accepted-rejoin message floors across history, direct RLS, previews, unread and realtime; verify pre-join/absence/pre-rejoin messages are inaccessible, sends race safely with leave, and cached revoked content/drafts clear on refresh.
- [ ] 7.5 Add equal-member invite/leave controls and departure/re-add notices; verify creator-specific and peer-removal controls and in-app rejoin-request flows are absent, notices permit private invitation requests only under normal DM rules, consent failure/retry and focus restoration work, and documents distinguish messaging groups from Study Buddies ownership.

## 8. Cross-feature integration acceptance

- [ ] 8.1 Run a fresh complete-migration authorization suite after historical fixtures; verify final catalog overloads/ACLs/policies, public-default/private/friend/DM/block/automatic-admission/re-add/history interaction matrix and upgrade data invariants without older tests replacing final authorization.
- [ ] 8.2 Run all relevant client/server tests, lint/build and existing account, academic-item/calendar/reminder, friendship and group SQL regressions; record actual results and verify privacy does not gate personal productivity or accepted collaboration.
- [ ] 8.3 Run desktop/375px browser flows across onboarding, hidden discovery, public/private recipient selection, cross-major automatic admission, consent-based re-add, read-only DMs, blocking, voluntary leave and account teardown; record evidence that historical identity notices match behavior and controls remain accessible.
- [ ] 8.4 Deliver owner-run hosted Auth/Realtime/deployment checklist with two participants, unrelated account and pending invitee; verify participant/membership/post-acceptance event privacy, reconnect and concurrent revocation. Mark managed checks pending unless actually run; do not treat local artifact completion as deployment approval.
- [ ] 8.5 Validate OpenSpec and review supersession against unsynchronized prerequisite capabilities; verify the completed change remains coherent before separate sync/archive, without modifying historical planning artifacts or silently restoring old privacy rules.
