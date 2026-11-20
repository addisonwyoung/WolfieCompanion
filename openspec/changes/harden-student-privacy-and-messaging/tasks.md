# Tasks

Final group-chat rules are approved: automatic additions and re-additions including private friends, equal active-member permissions, self-leave only, fresh sequence floors and no pending group-chat invitations. The broad tasks below remain unchecked until their full implementation and verification criteria are satisfied; stage-specific progress is recorded separately.

Stage 1 preparation: `202611190001_student_privacy_foundation.sql` and `docs/student-privacy-foundation.md` cover only settings/block storage and manual review. The owner subsequently confirmed manual deployment and structural verification of Stage 1; the agent has executed no live SQL. Tasks 1.1 and 1.5 remain incomplete pending their specified database verification and later client-cutover behavior; all other tasks are outside this stage.

Stage 2A implementation prepared: `202611190002_student_privacy_authorization.sql`, `docs/student-privacy-authorization.md`, SQL authorization fixtures, block API adapter and group-scoped picture API cover discovery/privacy, atomic blocking/friendship cleanup, block-only write/admission guards and minimal shared-group identity. At initial preparation/review time, no migration or SQL test had been executed by the agent; the later authorized disposable verification is recorded below. Mutual DM preferences, membership-model changes, Study Buddy feature changes and full settings/block UI remain outside this pass. Broad tasks 1.3/1.4, 2.2, 3.1/3.2 and 6.4 remain unchecked for their remaining full-change verification and/or later-stage portions. Task 2.1 is now verified by the authorized disposable runtime suite. Local check results are recorded in the deployment document.

Stage 2A final review: explicit service-only resolver ACL resets and effective-grant assertions, private-avatar-bucket preflight, active-only Study acceptance guards, serialized authorized Study response/departure, client-first rollout guidance and additional security/compatibility tests are prepared. Database installation and two-session runtime tests were pending at that review; the subsequent disposable results are recorded below. No live SQL was executed.

Stage 2A runtime verification: a new loopback-only PostgreSQL 18 cluster reconstructed the scoped audited baseline. Empty/populated installation, data preservation, authorization fixtures, six rejection/rollback cases and ten observed-lock concurrency cases passed; all test servers were stopped. Task 2.1 is complete. Full hosted integration, unrelated regressions and later-stage requirements remain pending. See `docs/student-privacy-runtime-verification.md`. No live credentials/connections, commit, push or Stage 2B work occurred.

Stage 2A PostgreSQL 17 gate: the authorized official ZIP route extracted 17.12 without administrator privileges or installation changes. The same complete suite passed on 17.12 with identical checked outcomes, migration hash and audit inputs to 18.0; both servers stopped. The owner reports live 17.11 preflight blocks 2-7 passed. Same-major compatibility is verified for the scoped baseline; exact hosted patch/platform, managed services and later-stage work remain outside this pass. See the runtime report for ZIP provenance and remaining limits.

## 1. Schema and authorization foundations

- [ ] 1.1 Add owner-reviewed additive settings/block schema and existing/new-account backfill/default logic; verify fresh-install and populated-upgrade fixtures preserve profile data, existing public status, new public defaults, true/false DM mapping and independent group consent, including concurrent signup.
- [ ] 1.2 Reuse active messaging memberships and sequence floors with minimal inactive-group state; verify upgrade fixtures preserve existing messages/IDs/read positions without introducing pending messaging invitations, historical membership/departure records or Study Buddy archives.
- [ ] 1.3 Implement caller-derived eligibility, verified offering, privacy/context and bilateral-block predicates with fixed security-definer search paths and narrow grants; verify anonymous, ineligible, forged caller and direct helper execution denial without changing academic ownership policies.
- [ ] 1.4 Establish shared pair/profile/group lock ordering for consent and relationship mutations; verify concurrent block/preference/admission operations serialize without deadlocks or stale permission commits.
- [ ] 1.5 Document migration order, legacy-client cutoff, defaults, compatibility and data-preserving rollback; verify the documented local fresh/upgrade sequence and obsolete-setting-write rejection in disposable databases.

## 2. Blocking and friendship enforcement

- [x] 2.1 Implement block/unblock and owner-only block listing; verify atomic friendship removal, pending-request invalidation, reverse-block persistence, safe retries, no automatic restoration and no peer-readable block direction with SQL tests.
- [ ] 2.2 Harden all friend send/respond/profile/directory/relationship overloads and direct SELECT grants/policies; verify stale accept cannot recreate friendship and legacy/direct identifier calls cannot bypass blocks or privacy.
- [ ] 2.3 Add profile/DM block controls and independent block management; verify hidden targets can be unblocked, failures retain confirmed state, account changes discard stale results and no block notification is emitted in client tests.
- [ ] 2.4 Document shared-group exceptions and generic peer-facing failure behavior; verify accessible notices explain retained identity/interaction and do not reveal which member blocked an invitee.

## 3. Profile discovery and onboarding

- [ ] 3.1 Separate university-wide public search from scoped classmate/Study predicates across current and legacy entry points, retiring unsafe overloads; verify database public/private caller/target matrices, cross-major/course/friendship search, private autocomplete exclusion, authorized private-friend exceptions, scoped pending/rejected enrollment rejection and sensitive-field exclusion.
- [ ] 3.2 Harden Express avatar checks and service-role resolver families consistently; verify general private/block/field-sharing rules plus group-scoped active-member name/picture access independent of general picture sharing; verify outsider/departed-member denial, historical-author limits, arbitrary/superseded path denial and no-store delivery with server/SQL tests.
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
- [ ] 5.4 Reuse Study Buddy leave behavior to remove active membership/availability and preserve remaining members' data; verify final-member group/data deletion is permitted and no membership history, archive, contribution recovery or extra retention infrastructure is introduced. Preserve existing Study Buddy ownership behavior.
- [ ] 5.5 Document the section-based privacy exception and preserve private creation/participation; verify the existing four-step UI at desktop/375px, stale candidate invalidation and account-switch isolation.

## 6. Member-managed automatic messaging admission

- [ ] 6.1 Preserve picker layout/name/selection/paging/retry behavior with friend suggestions and university-wide public search plus authorized private friends; verify cross-major non-friend addition, private non-friend/autocomplete denial and unchanged three-person creation minimum/50-member maximum in SQL/client tests.
- [ ] 6.2 Replace creator/friendship-only addition authority with eligible active membership and automatic addition/re-addition; verify every addition rechecks target public/private-friend visibility, eligibility, `allow_group_additions`, capacity and blocks, regardless of previous departure. Verify no friendship or DM authority is created and no pending group invitation/accept/decline/rejoin-request operations are introduced.
- [ ] 6.3 Serialize additions with leave, blocks, consent and capacity changes; verify atomic rejection, generic errors, no new blocked pairing, safe unrelated addition around existing blocked co-members and exact retry behavior without resurrecting departed membership.
- [ ] 6.4 Add group-scoped identity/picture projections and backend resolution for active callers and active targets; verify private non-friend co-members can see names/pictures/basic identity independently of general sharing, while outsiders/departed members, full-profile lookups and sensitive fields remain denied. Document group-context picture visibility and historical-author attribution limits.
- [ ] 6.5 Document automatic re-addition and independent group consent in picker/settings notices; verify accessible keyboard/mobile/account-replacement behavior and absence of pending messaging admission UI or fabricated unread messages.

## 7. Messaging departure and sequence boundaries

- [ ] 7.1 Implement idempotent self-leave for every eligible active member at any group size and retire creator-only peer removal; verify creator/ordinary members cannot remove others through UI/current/legacy paths and no manager, owner, administrator or removal role is introduced.
- [ ] 7.2 Reuse active membership deletion on leave and fresh `joined_after_sequence` on every addition/re-addition; verify pre-join, previous-tenure and absence messages remain inaccessible through history, RLS, previews, unread and realtime without separate membership-history or departure-reason tracking. Document any demonstrated authorization need before proposing extra infrastructure.
- [ ] 7.3 Make final-member groups inactive with retained messages and no active client access; verify no messages/additions/self-rejoin via creator IDs, legacy RPCs, tables or stale receipts and no active inbox/unread entry.
- [ ] 7.4 Recheck membership after shared group locking for sends/additions/leaves; verify race tests and client clearing of revoked history/pictures/drafts, stable focus/retry behavior, appropriate historical message attribution and no unrelated profile access.

## 8. Cross-feature integration acceptance

- [ ] 8.1 Run a fresh complete-migration authorization suite after historical fixtures; verify final catalog overloads/ACLs/policies, public-default/private/friend/DM/block/automatic-admission/automatic-re-add/sequence-floor/group-picture interaction matrix and upgrade data invariants without older tests replacing final authorization.
- [ ] 8.2 Run all relevant client/server tests, lint/build and existing account, academic-item/calendar/reminder, friendship and group SQL regressions; record actual results and verify privacy does not gate personal productivity or accepted collaboration.
- [ ] 8.3 Run desktop/375px browser flows across onboarding, hidden discovery, public/private recipient selection, cross-major automatic admission, automatic re-add, read-only DMs, blocking, voluntary leave and account teardown; record evidence that historical identity notices match behavior and controls remain accessible.
- [ ] 8.4 Deliver owner-run hosted Auth/Realtime/deployment checklist with two participants, unrelated account, departed chat member and pending Study Buddy invitee; verify participant/membership/post-addition message and picture privacy, Study Buddy pending isolation, reconnect and concurrent revocation. Mark managed checks pending unless actually run; do not treat local artifact completion as deployment approval.
- [ ] 8.5 Validate OpenSpec and review supersession against unsynchronized prerequisite capabilities; verify the completed change remains coherent before separate sync/archive, without modifying historical planning artifacts or silently restoring old privacy rules.
