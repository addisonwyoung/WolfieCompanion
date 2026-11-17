# Spec Delta

## Purpose

Support consent-based private student collaboration and voluntary group departure without exposing pending invitees or discarding historical contributions.

## ADDED Requirements

### Requirement: Private Study Buddies admission
Eligible private students SHALL be allowed to create and join Study Buddies without becoming public. New admission SHALL require verified current-semester course/section/professor matching. Private invitees SHALL be invited through an authorized accepted-friend interface, not general candidate search, and SHALL explicitly accept. Acceptance SHALL revalidate applicable friendship, offering, eligibility and blocks against active members. Existing accepted memberships SHALL remain available after privacy/course changes. Privacy changes SHALL preserve pending invitations without auto-acceptance.

#### Scenario: Private creator and invited private friend
- **WHEN** a private creator forms a group and directly invites a private accepted friend who shares the required verified offering
- **THEN** the creator joins voluntarily, the friend stays pending until explicit valid acceptance, and neither profile becomes generally discoverable

#### Scenario: Pending invitation across privacy change
- **WHEN** an invitee becomes private before responding
- **THEN** the invitation remains pending and can be accepted while private if current admission checks succeed, or declined without revealing private status

#### Scenario: Existing membership and legacy context
- **WHEN** an accepted member's course relationship changes or a legacy group's professor context is unknown
- **THEN** accepted participation remains and new acceptance requires a valid verified offering rather than a guessed or course-only fallback

### Requirement: Pending invitation isolation
Pending invitations SHALL grant no group messages, roster, availability, project roles, tasks, previews, unread counts or member-only events. Only minimal invitation metadata SHALL be exposed to authorized parties. Declines SHALL NOT reveal private-profile status.

#### Scenario: Pending direct access
- **WHEN** an invitee attempts member-only RPC, direct table or event access before acceptance
- **THEN** no member-only content is disclosed

### Requirement: Private messaging-group invitations
The current group manager SHALL be able to invite private accepted friends through authorized friendship interfaces. Explicit acceptance SHALL revalidate inviter management authority, friendship, eligibility, independent group-addition consent, capacity and blocks against every current active member. Membership and message visibility SHALL begin at acceptance. Pending invitations SHALL NOT count as active membership. Public additions SHALL remain subject to independent consent and all admission checks; becoming private before commit SHALL require invitation acceptance.

#### Scenario: Accept after messages were sent
- **WHEN** a private invited friend accepts after existing messages and all current checks succeed
- **THEN** membership begins and only messages sent after acceptance are readable through history, previews, counts, direct access and events

#### Scenario: State changes before acceptance
- **WHEN** friendship, consent, inviter authority, eligibility, capacity or blocked-pair checks fail at acceptance
- **THEN** admission is rejected without partial membership or message access

#### Scenario: Creation with private invitees
- **WHEN** a creator submits a valid intended initial group including private friends
- **THEN** private friends receive pending invitations, the group can await acceptance below three active members, and no pending person receives content

### Requirement: No new blocked pairings
Creation, additions and acceptance SHALL reject newly introduced blocked pairings across resulting active membership. Existing blocked co-members SHALL retain participation and SHALL NOT by themselves prevent an unrelated safe addition.

#### Scenario: Invitee blocked by another member
- **WHEN** the manager is friends with an invitee but another active member has a block in either direction with that invitee
- **THEN** admission fails without identifying the blocking member

### Requirement: Voluntary leave and historical attribution
Every eligible active member SHALL be able to leave voluntarily, including private members and messaging-group creators/managers. Leaving SHALL revoke member access, remove active roster/availability/selection entries and preserve historical messages/tasks and attribution. A rejoin SHALL pass normal admission checks and SHALL NOT restore messages from absence; messaging rejoin SHALL establish a fresh history boundary.

#### Scenario: Private study member leaves
- **WHEN** a private member leaves a study group
- **THEN** active membership and availability disappear, member-selection controls exclude them, and prior authored tasks can remain attributed

#### Scenario: Messaging member leaves and rejoins
- **WHEN** a member leaves and later rejoins a live group through authorized admission
- **THEN** access is revoked during absence and the new history begins after rejoining without restoring absence messages

### Requirement: Deterministic messaging management succession
Messaging groups SHALL retain original creator attribution separately from current management. When the manager leaves, management SHALL transfer to the earliest-joined eligible active member with student identifier as tie-breaker. Private status SHALL NOT disqualify a successor. Pending invitees SHALL NOT succeed. If no eligible active successor exists, management SHALL remain unassigned until deterministic eligible-member recovery; former creators SHALL have no residual authority.

#### Scenario: Private successor
- **WHEN** the manager leaves and the earliest-joined eligible remaining member is private
- **THEN** that member becomes manager, original creator metadata remains, and the departed manager loses access and authority

### Requirement: Abandoned messaging groups retain inaccessible history
When the final active member leaves, the system SHALL retain historical group data without active membership or client access, remove the group from active inboxes, and invalidate pending admissions. Former creator metadata, stale invitations and retry receipts SHALL NOT resurrect abandoned access.

#### Scenario: Final member leaves
- **WHEN** the last member voluntarily leaves a messaging group
- **THEN** historical rows remain, the group disappears from active conversation lists and direct RPC/table/event access is denied to former members and invitees
