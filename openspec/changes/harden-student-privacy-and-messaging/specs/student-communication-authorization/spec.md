# Spec Delta

## Purpose

Enforce mutual direct-message consent and bilateral user-block effects consistently while retaining participant history and account eligibility protections.

## ADDED Requirements

### Requirement: Mutual three-level messaging preferences
The system SHALL replace the new-DM boolean with `eligible_students`, `friends_only`, and `no_one`. Every new message insertion in new and existing conversations SHALL require both participants' preferences to permit exchange. `friends_only` SHALL require current accepted friendship; `no_one` SHALL deny exchange in both directions. `eligible_students` SHALL permit authorized non-friend classmates and other permitted contacts. Block and account eligibility restrictions SHALL override preferences.

#### Scenario: Eligible non-friend classmates
- **WHEN** both eligible unblocked students permit eligible students and share a verified current-semester course/section/professor relationship
- **THEN** a permitted first message succeeds without friendship

#### Scenario: Mutual restriction on an existing thread
- **WHEN** either participant selects no-one, or friends-only without a current accepted friendship
- **THEN** neither student can insert another message and both retain authorized history access with a read-only explanation

### Requirement: Established contacts and verified new contact
An established conversation SHALL remain an authorized contact basis under `eligible_students` after the original course, request or friendship relationship disappears, subject to both preferences and blocking. New classmate contact SHALL require verified current-semester matching course, section and professor. Pending/rejected enrollment, arbitrary identifiers, general directory access and shared-group visibility alone SHALL NOT authorize first contact. A private target SHALL require an authorized relationship exception; private senders SHALL be able to intentionally contact authorized public students.

#### Scenario: Course relationship expires
- **WHEN** the original shared offering disappears but both participants permit eligible students and remain eligible and unblocked
- **THEN** their established conversation remains writable

#### Scenario: Invalid classmate basis
- **WHEN** a first-contact caller has only pending/rejected enrollment, another section/professor, a copied identifier or group co-membership
- **THEN** new classmate-based contact is rejected without creating an empty conversation

#### Scenario: Intentional private pending-request contact
- **WHEN** a private student initiated a currently pending friend request to the caller
- **THEN** the caller may use that DM-only relationship if both preferences, eligibility and blocking permit, without gaining general profile or avatar access
- **AND** a request initiated only by the caller does not authorize first contact with the private recipient

### Requirement: Directed blocks with bilateral effect
Eligible students SHALL be able to block and unblock specific students from authorized profile/message interfaces and manage their own blocks after targets become hidden. Either-direction blocking SHALL deny DMs, new friend requests and general discovery/profile access between the pair. Blocking SHALL atomically remove accepted friendship and invalidate pending friend requests. Unblocking SHALL remove only the caller's block and SHALL NOT restore friendships or requests. Blocks SHALL NOT notify the other student or expose block direction through peer errors.

#### Scenario: Block an existing friend
- **WHEN** a student blocks an accepted friend with a saved conversation
- **THEN** friendship is removed, both message directions and new friend requests are denied, and participant history is preserved

#### Scenario: Stale request acceptance and reverse block
- **WHEN** someone accepts an old request after blocking or removes their own block while the other direction remains blocked
- **THEN** no friendship is recreated and communication remains denied

### Requirement: Shared-context block exception
Blocking SHALL preserve existing study/group memberships, authorized shared-group identity (including active chat co-members' names and pictures), messages and collaboration. Notices SHALL state that shared-group visibility and interaction continue and that voluntary leave is available. Shared-context access SHALL NOT authorize direct contact or unrelated profile access.

#### Scenario: Existing shared group
- **WHEN** one active member blocks another active member
- **THEN** shared membership and authorized interaction remain available subject to ordinary group-send eligibility, while direct communication and direct actor-target invitations remain restricted; an independent third party can admit either student if all other checks pass

### Requirement: Private shared-group block warnings and controls
Eligible students SHALL have Block/Unblock actions in authorized profile interfaces and owner-only Blocked Students management reusing existing blocking semantics and remaining available after targets become hidden. Only an eligible outgoing blocker sharing active messaging membership or accepted Study membership with the blocked student SHALL retrieve or dismiss contextual warnings. Warnings SHALL use dismissible inline banners with voluntary leave actions, not modals or notification delivery. A minimal private current-state table SHALL persist dismissal for the outgoing block and both current membership episodes. A new outgoing block or either participant's new membership episode SHALL rearm a fresh warning identifier. Dismissal SHALL NOT change blocks, membership or communication authorization. Pending Study invitees, blocked targets and other members SHALL NOT learn warning data or block direction through RPCs, tables, events, shared payloads or stale client state.

#### Scenario: Independent third party admits a blocked pair
- **WHEN** Sally independently adds or invites Alice and Bob with valid actor-target authorization and Alice has blocked Bob
- **THEN** permitted co-membership succeeds, only Alice receives her private banner after both are active/accepted co-members, and Sally and Bob receive no warning or direction disclosure; Alice and Bob still cannot DM each other

#### Scenario: Persisted contextual dismissal
- **WHEN** Alice dismisses a warning and refreshes, reconnects or logs in again with the same block and both membership episodes
- **THEN** the banner remains dismissed, including after duplicate block calls, settings edits or Study owner transfer; dismissal neither unblocks Bob nor leaves the group

#### Scenario: Independent shared contexts
- **WHEN** Alice and Bob share multiple authorized group contexts while Alice's outgoing block continues
- **THEN** each context has independently persisted warning dismissal with no bell item, academic reminder, message unread increment or peer-readable warning count

#### Scenario: Either membership or outgoing block episode restarts
- **WHEN** Alice unblocks then blocks Bob again, or either Alice or Bob leaves and later rejoins the shared context
- **THEN** cascading parent deletion invalidates the old warning state and the next authorized retrieval creates a fresh warning identifier, even if a timestamp or sequence floor repeats

#### Scenario: Old or forged dismissal identifier
- **WHEN** a caller submits a foreign, missing or previous-episode warning identifier, including a delayed dismissal racing with rejoining
- **THEN** the operation returns a safe generic/no-op outcome without revealing existence and cannot dismiss a replacement warning or change any block/membership

#### Scenario: Pending invitation does not authorize warnings
- **WHEN** either Study participant is pending, expired or unverifiable, including a pending row retained or replaced by fresh invitation issuance
- **THEN** no contextual warning can be retrieved or dismissed through that membership key; first accepted co-membership enables a warning without exposing pending identities

#### Scenario: Group deletion and final departure
- **WHEN** a Study group is deleted or the final messaging member leaves
- **THEN** warning state is removed through membership cascades, no abandoned context is retrievable, and retained messaging history follows existing authorization

#### Scenario: Concurrent warning initialization and relationship change
- **WHEN** retrieval or dismissal races with another retrieval, unblock, departure or rejoining
- **THEN** group-before-pair serialization and post-lock checks retain at most one current state per context/blocked student, preserve a continuing dismissal and prevent stale identifiers from affecting a new episode

#### Scenario: Unblock a hidden student
- **WHEN** an eligible blocker opens Blocked Students after the target becomes hidden
- **THEN** only the block-creation-time authorized label or a privacy-safe fallback is shown, and they can remove only their own block without restoring friendship, erasing a reverse block or notifying the target

### Requirement: Authoritative boundaries and safe revocation
Current and retained legacy RPCs, direct lookups, table policies, service-role picture delivery, inbox/unread projections and event delivery SHALL enforce their approved audience. Message writes SHALL remain protected from direct-table bypass. Revocation and mutations SHALL use a consistent serialized authorization order. An exact replay of a committed attempt SHALL NOT create a new message; uncommitted retries SHALL require current authorization. Account changes and revocation refresh SHALL prevent obsolete private state or automatic draft delivery.

#### Scenario: Direct bypass and concurrent revocation
- **WHEN** a caller uses a legacy RPC, forged conversation identifier, direct table write or races a send with an earlier-ordered block/preference restriction
- **THEN** no unauthorized insertion or private data disclosure occurs

#### Scenario: Lost acknowledgement
- **WHEN** a committed message is retried after permission changes
- **THEN** confirming its original participant-owned result does not insert another message or advance activity/unread counts

### Requirement: Migration and user explanations
Migration SHALL map existing true to eligible-students and false to no-one, preserving histories, identifiers and read positions. Group-addition consent SHALL initialize true for all existing and new accounts independently of the legacy boolean and SHALL NOT depend on subsequent DM preferences. UI SHALL explain mutual restrictions, safe read-only reasons, the changed existing-chat behavior for previous opt-outs and the independently enabled group-addition preference when new authorization becomes operational. Restricted sends SHALL NOT produce new-message notifications; retained historical unread state SHALL NOT generate fabricated new alerts.

#### Scenario: Legacy false preference
- **WHEN** an existing opt-out is migrated
- **THEN** DM permission is no-one, the independent group-addition preference is true, prior histories survive, and the changed existing-conversation and group-addition behavior is explained at authorization cutover

#### Scenario: Canonical choice diverges after initial seeding
- **WHEN** legacy and canonical settings differ before the authorization cutover
- **THEN** the migration reports discrepancies without resetting canonical choices, future authorization uses `dm_permission`, and obsolete boolean updates fail with an actionable refresh instruction

### Requirement: Group eligibility does not grant DM authority
University-wide search, automatic group admission and Study Buddies acceptance SHALL NOT create friendships or override mutual DM preferences. Blocks SHALL prevent direct invitations between the actual inviter and invitee in either direction and prevent direct communication. Independent third-party admission and existing shared-group participation SHALL remain permitted under their own privacy/eligibility/consent rules and SHALL NOT confer DM or general profile permission.

#### Scenario: Non-friend addition with closed DMs
- **WHEN** a public non-friend is automatically admitted to an authorized group while either student has no-one DM permission
- **THEN** permitted group participation continues, no friendship is created, and direct messages remain denied

#### Scenario: Asking for a new group invitation
- **WHEN** a former group member privately asks a current member to invite them again
- **THEN** the message requires the same contact basis, eligibility, mutual preferences and absence of blocks as any other DM; previous group membership grants no bypass, no in-app rejoin-request workflow and no independent readmission; a current active member can add them automatically only under the separate group-addition checks
