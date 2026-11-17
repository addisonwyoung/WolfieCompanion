# Tasks

## 1. Schema and authorization foundations

- [ ] 1.1 Add owner-reviewed additive settings/block schema and existing/new-account backfill/default logic; verify fresh-install and populated-upgrade fixtures preserve profile data, existing public status, new private defaults, true/false DM mapping and independent group consent, including concurrent signup.
- [ ] 1.2 Add private messaging invitation state, active manager/original creator separation and study offering context; verify constraints, unique pending invitations, no pending active memberships, preserved IDs/messages/read positions and safe legacy-context handling in SQL fixtures.
- [ ] 1.3 Implement caller-derived eligibility, verified offering, privacy/context and bilateral-block predicates with fixed security-definer search paths and narrow grants; verify anonymous, ineligible, forged caller and direct helper execution denial without changing academic ownership policies.
- [ ] 1.4 Establish shared pair/profile/group lock ordering for consent and relationship mutations; verify concurrent block/preference/admission operations serialize without deadlocks or stale permission commits.
- [ ] 1.5 Document migration order, legacy-client cutoff, defaults, compatibility and data-preserving rollback; verify the documented local fresh/upgrade sequence and obsolete-setting-write rejection in disposable databases.

## 2. Blocking and friendship enforcement

- [ ] 2.1 Implement block/unblock and owner-only block listing; verify atomic friendship removal, pending-request invalidation, reverse-block persistence, safe retries, no automatic restoration and no peer-readable block direction with SQL tests.
- [ ] 2.2 Harden all friend send/respond/profile/directory/relationship overloads and direct SELECT grants/policies; verify stale accept cannot recreate friendship and legacy/direct identifier calls cannot bypass blocks or privacy.
- [ ] 2.3 Add profile/DM block controls and independent block management; verify hidden targets can be unblocked, failures retain confirmed state, account changes discard stale results and no block notification is emitted in client tests.
- [ ] 2.4 Document shared-group exceptions and generic peer-facing failure behavior; verify accessible notices explain retained identity/interaction and do not reveal which member blocked an invitee.

## 3. Profile discovery and onboarding

- [ ] 3.1 Apply privacy/block/verified-offering predicates to current and legacy classmate, recommendation, directory and profile entry points, retiring unsafe overloads; verify database public/private caller/target matrices, pending/rejected enrollment rejection and exact limited projections.
- [ ] 3.2 Harden Express avatar checks and service-role resolver families consistently; verify private/block/field-sharing revocation, arbitrary/superseded path denial and no-store picture delivery with server/SQL tests.
- [ ] 3.3 Add reversible private-mode settings and onboarding, preserve optional sharing, and invalidate cached discovery/profile/candidate state; verify new-account defaults, save failure/retry, intentional contact disclosure, late response rejection and private browsing of public peers in client tests.
- [ ] 3.4 Replace obsolete always-shared/no-opt-out copy in UI and setup docs; verify notices distinguish general discovery, friend access, group identity, historical contributions and voluntary private collaboration at desktop and 375px.

## 4. Mutual direct messaging

- [ ] 4.1 Replace first-send-only checks with common mutual preference/block authorization on every new insertion; verify all nine preference combinations for friend/non-friend and established/new pairs, public/private targets and either-direction blocks in SQL tests.
- [ ] 4.2 Align new classmate DM contact with verified current course/section/professor and preserve established contacts under eligible-students; verify pending/rejected/wrong-offering and UUID-only denial plus course-loss continuation and friends-only unfriend freeze.
- [ ] 4.3 Preserve participant history/read positions and exact committed replay semantics while rejecting uncommitted retries after revocation; verify no duplicate messages, empty threads, sequence/activity changes or unauthorized direct writes in SQL/concurrency tests.
- [ ] 4.4 Update account adapters, settings, contact-state parsing and read-only composer explanations; verify mutual restrictions apply to existing chats, history remains openable, drafts never auto-send and old boolean writes fail actionably in client tests.
- [ ] 4.5 Integrate permission refresh with existing visible polling/focus/reconnect and notifications; verify denied sends create no new alerts, historical unread remains coherent and account teardown clears state. Document mutual semantics and the false-to-no-one existing-chat behavior change.

## 5. Private Study Buddies collaboration

- [ ] 5.1 Update creation/invitation/acceptance to verified offering scope while allowing private creators/joiners; add accepted-friend contextual invitation entry for private targets. Verify exact offering, current friendship exceptions and block checks with a dedicated Study Buddies SQL suite.
- [ ] 5.2 Isolate pending previews from rosters, availability, roles and tasks; verify pending private/public invitees cannot retrieve member content via RPC/direct access and decline discloses no private status.
- [ ] 5.3 Preserve accepted memberships and pending invitations through privacy changes; resolve legacy invitation context safely without guessing professors. Verify accepted legacy participation remains usable and ambiguous/new admissions fail safely until verified context is supplied.
- [ ] 5.4 Preserve historical task attribution on voluntary departure while removing membership/availability/selection entries and maintaining deterministic ownership transfer; verify private owner/member leave and last-member handling do not inadvertently erase retained contributions.
- [ ] 5.5 Update Study Buddies adapters/UI, friendship actions and notices; verify private creation/acceptance never toggles profile visibility, stale candidates are removed, shared tasks/roles/availability still work and account-switch lifecycle remains isolated. Document the new scope and pending privacy boundary.

## 6. Messaging invitations and blocked-pair admission

- [ ] 6.1 Implement manager-issued private-friend invitations and explicit accept/decline; verify pending metadata ACLs, no message/roster/event access, duplicate retries and private-status-neutral declines with SQL/client tests.
- [ ] 6.2 Revalidate manager authority, friendship, eligibility, separate consent, capacity and blocks against every current member on acceptance; verify stale selection, public-to-private changes, former manager invites, concurrent capacity/blocks and atomic rejection.
- [ ] 6.3 Establish join sequence/read floors only on acceptance; verify pre-acceptance history/previews/unread/direct SELECT and events remain inaccessible and private-to-public changes never auto-admit.
- [ ] 6.4 Support initial creation with pending private invitees without inventing active membership or deleting retained groups on decline; verify intended initial size validation, below-three active states, public consent-based addition regression and existing blocked-pair safe unrelated additions.
- [ ] 6.5 Add invitation inbox/actions and contextual friend-profile group selection, preserving exclusion from general candidate lists; verify manager-only controls, keyboard/focus/retry and account replacement in client tests. Document separate group consent and shared-block interaction limits.

## 7. Messaging self-leave and management succession

- [ ] 7.1 Implement idempotent self-leave and replace original-creator authority with current eligible manager authority across candidate/add/remove/invitation RPCs; verify original attribution survives, private successors qualify and earliest-join/UUID ordering is deterministic.
- [ ] 7.2 Handle managerless groups with deterministic eligible-member recovery and abandoned final-member groups with retained inaccessible data and canceled pending admissions; verify stale invites/receipts/creator IDs cannot resurrect access and active inbox/unread lists omit abandoned groups.
- [ ] 7.3 Recheck membership under shared locks for sends/leaves/additions and apply fresh history floors on rejoin; verify race tests, no absence/history restoration and direct-table/event revocation after leave.
- [ ] 7.4 Add leave controls for every member and updated management UI, clear revoked caches/drafts and document history/access effects; verify private/creator/final-member leave, failure/retry, focus restoration and absence of residual management controls with client tests.

## 8. Cross-feature integration acceptance

- [ ] 8.1 Run a fresh complete-migration authorization suite after historical fixtures; verify final catalog overloads/ACLs/policies, private/friend/DM/block/group interaction matrix and upgrade data invariants without older tests replacing final authorization.
- [ ] 8.2 Run all relevant client/server tests, lint/build and existing account, academic-item/calendar/reminder, friendship and group SQL regressions; record actual results and verify privacy does not gate personal productivity or accepted collaboration.
- [ ] 8.3 Run desktop/375px browser flows across onboarding, hidden discovery, private friend invitations, read-only DMs, blocking, voluntary leave and account teardown; record evidence that historical identity notices match behavior and controls remain accessible.
- [ ] 8.4 Deliver owner-run hosted Auth/Realtime/deployment checklist with two participants, unrelated account and pending invitee; verify participant/membership/post-acceptance event privacy, reconnect and concurrent revocation. Mark managed checks pending unless actually run; do not treat local artifact completion as deployment approval.
- [ ] 8.5 Validate OpenSpec and review supersession against unsynchronized prerequisite capabilities; verify the completed change remains coherent before separate sync/archive, without modifying historical planning artifacts or silently restoring old privacy rules.
