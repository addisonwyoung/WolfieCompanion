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
- **THEN** existing shared participation remains available while direct communication and new blocked-pair admission remain restricted

### Requirement: Authoritative boundaries and safe revocation
Current and retained legacy RPCs, direct lookups, table policies, service-role picture delivery, inbox/unread projections and event delivery SHALL enforce their approved audience. Message writes SHALL remain protected from direct-table bypass. Revocation and mutations SHALL use a consistent serialized authorization order. An exact replay of a committed attempt SHALL NOT create a new message; uncommitted retries SHALL require current authorization. Account changes and revocation refresh SHALL prevent obsolete private state or automatic draft delivery.

#### Scenario: Direct bypass and concurrent revocation
- **WHEN** a caller uses a legacy RPC, forged conversation identifier, direct table write or races a send with an earlier-ordered block/preference restriction
- **THEN** no unauthorized insertion or private data disclosure occurs

#### Scenario: Lost acknowledgement
- **WHEN** a committed message is retried after permission changes
- **THEN** confirming its original participant-owned result does not insert another message or advance activity/unread counts

### Requirement: Migration and user explanations
Migration SHALL map existing true to eligible-students and false to no-one, preserving histories, identifiers and read positions. Group-addition consent SHALL be migrated independently from the same old value and SHALL NOT depend on subsequent DM preferences. UI SHALL explain mutual restrictions, safe read-only reasons and the changed existing-chat behavior for previous opt-outs. Restricted sends SHALL NOT produce new-message notifications; retained historical unread state SHALL NOT generate fabricated new alerts.

#### Scenario: Legacy false preference
- **WHEN** an existing opt-out is migrated
- **THEN** DM permission is no-one, group additions remain disabled, prior histories survive, and the changed existing-conversation behavior is explained

### Requirement: Group eligibility does not grant DM authority
University-wide search, automatic group admission and Study Buddies acceptance SHALL NOT create friendships or override mutual DM preferences. Blocks SHALL prevent new invitations and direct communication, preserving existing shared-group participation as the documented exception.

#### Scenario: Non-friend addition with closed DMs
- **WHEN** a public non-friend is automatically admitted to an authorized group while either student has no-one DM permission
- **THEN** permitted group participation continues, no friendship is created, and direct messages remain denied

#### Scenario: Asking for a new group invitation
- **WHEN** a former group member privately asks a current member to invite them again
- **THEN** the message requires the same contact basis, eligibility, mutual preferences and absence of blocks as any other DM; previous group membership grants no bypass, no in-app rejoin-request workflow and no independent readmission; a current active member can add them automatically only under the separate group-addition checks
