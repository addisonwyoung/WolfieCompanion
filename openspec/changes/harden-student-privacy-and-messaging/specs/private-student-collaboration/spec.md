# Spec Delta

## Purpose

Support section-based Study Buddies and member-managed messaging groups with contextual privacy, voluntary departure and protected message history.

## ADDED Requirements

### Requirement: Section-based Study Buddies selection and consent
Study Buddies SHALL retain the existing flow: select course section, select one to seven eligible classmates, enter a group name, create and send invitations. Verified current-semester course-section membership SHALL be required; friendship and professor matching SHALL NOT be prerequisites for public classmates. Private accepted friends in that section SHALL be selectable through friendship authorization within the existing picker. Private non-friends SHALL NOT appear merely through shared enrollment. Private creators and invitees SHALL NOT be required to become public. Invitations SHALL require acceptance and SHALL NOT create friendship or override DM preferences.

#### Scenario: Invite public non-friend and private friend
- **WHEN** a student selects their verified section and eligible public non-friend and private friend classmates
- **THEN** both can receive invitations through the existing flow, a private non-friend remains hidden, and the seven-invitee limit applies

#### Scenario: Wrong section or unverified enrollment
- **WHEN** the selected person belongs only to another section or has pending/rejected enrollment
- **THEN** Study Buddies admission is denied even if the person is publicly searchable or a friend

### Requirement: Study admission and pending isolation
Acceptance SHALL revalidate eligibility, current section membership, applicable private-friend authorization and blocks against active members. Existing accepted membership SHALL survive privacy/course changes; pending invitations SHALL survive privacy changes without auto-acceptance. Pending invitations SHALL reveal only safe invitation metadata and no roster, availability, roles, tasks or member-only content. Declining SHALL NOT reveal private status.

#### Scenario: Private acceptance
- **WHEN** an eligible private invitee accepts with all current section, relationship and block checks satisfied
- **THEN** membership begins without making their profile public or creating friendship

#### Scenario: Pending access bypass
- **WHEN** an invitee requests member-only information through RPC, table or event access before acceptance
- **THEN** no member-only data is returned

### Requirement: Equal messaging-group invitation permissions
Every eligible active messaging-group member SHALL have equal permission to add eligible students without friendship, major, course or section prerequisites. The existing picker structure SHALL retain friend suggestions and support university-wide public search plus private accepted friends through relationship authorization. Private non-friends SHALL remain hidden. The original creator SHALL have no ongoing special authority. Creation SHALL require two distinct selected students plus the creator; active membership SHALL never exceed 50.

#### Scenario: Non-creator adds cross-major non-friend
- **WHEN** an active non-creator selects an eligible public non-friend in another major and course
- **THEN** the addition is permitted under the same authorization as the creator, without creating friendship or changing DM permissions

#### Scenario: Private friend recipient
- **WHEN** a member searches recipients with a private accepted friend and a private non-friend
- **THEN** only the authorized friend can be returned through the relationship exception, including autocomplete and direct candidate calls

### Requirement: Normal automatic admission and voluntary re-add consent
Authorized first-time additions SHALL admit immediately, including private accepted friends, subject to independent group-addition consent, eligibility, visibility authorization, capacity and block checks. Private status alone SHALL NOT require acceptance. A person who previously voluntarily left that same group SHALL require explicit acceptance before re-addition, regardless of current public status or friendship. Former members SHALL NOT rejoin themselves or request rejoining through an application membership workflow. A former member SHALL be allowed to privately ask a current member for a new invitation only subject to normal DM authorization; no exception to mutual preferences or blocking SHALL be granted. Acceptance SHALL revalidate the inviter's active membership, recipient eligibility/visibility authorization, consent, capacity and blocks against all current members. Pending re-add invitations SHALL grant no group content.

#### Scenario: Automatic public admission
- **WHEN** an active member adds a public eligible first-time recipient with group consent enabled and no block conflict
- **THEN** the recipient immediately joins without friendship or acceptance and sees only post-join messages

#### Scenario: Re-add after voluntary departure
- **WHEN** an active member selects a public student who previously voluntarily left this group
- **THEN** only a pending invitation is created, no membership/content access returns until valid acceptance, and decline reveals no private status

#### Scenario: Inviter leaves before acceptance
- **WHEN** a pending re-add invitation's inviter is no longer an active member
- **THEN** that invitation cannot admit the recipient or revive the inviter's authority

### Requirement: No new blocked pairings
Creation, additions and acceptance SHALL reject newly introduced blocked pairings across resulting active membership without identifying who blocked whom. Existing blocked co-members SHALL retain shared participation and SHALL NOT by themselves prevent an unrelated safe addition. Existing group access SHALL NOT grant direct contact or unrelated profile access.

#### Scenario: Block by another current member
- **WHEN** a candidate has an either-direction block with any current member
- **THEN** admission fails generically even if the inviter has no block with that candidate

### Requirement: Voluntary departure and inactive groups
Every eligible active messaging member SHALL be able to leave regardless of remaining count. Members SHALL be permitted to remove only themselves, not any other member. No administrator, owner, manager, succession, creator-authority or membership-removal role SHALL govern messaging groups. Current and legacy operations SHALL deny peer removal, including by the original creator. Final-member departure SHALL make the group inactive, retain historical data, cancel outstanding admissions and prevent further messages/invitations or self-rejoin. Creator attribution and stale receipts SHALL NOT grant access. Study Buddies' existing ownership for academic roles/tasks is separate from messaging groups and remains unchanged.

#### Scenario: Creator leaves a two-member group
- **WHEN** the creator leaves a messaging group with one other member
- **THEN** departure succeeds without transfer/succession and the remaining member retains equal membership rights

#### Scenario: Final member leaves
- **WHEN** the final active member leaves
- **THEN** the group disappears from active inboxes, history is retained without client access, and former members cannot message, invite or resurrect it

### Requirement: Membership history and historical attribution
The system SHALL preserve durable internal membership history and voluntary-leave records across re-addition. Internal records SHALL NOT grant former-member access or expose private identities through general discovery. New and rejoining members SHALL receive a fresh message visibility boundary; pre-join and absence messages SHALL remain inaccessible through history, previews, counts, direct tables and realtime. Departure SHALL remove active membership/availability/selection entries without deleting historical messages or task attribution. Previous departure SHALL NOT permanently prevent an authorized active member from selecting a discoverable former member for a consent-based re-add.

#### Scenario: Rejoin after absence
- **WHEN** a former member accepts an authorized re-add after messages were sent during absence
- **THEN** a new membership boundary starts and absence/pre-rejoin messages are not returned through any access path

#### Scenario: Private study member leaves
- **WHEN** a private student leaves Study Buddies
- **THEN** active roster and availability omit them while authored tasks may remain attributed, and enrollment alone cannot rediscover their private profile

### Requirement: Finalized automatic admission and self-leave boundaries
First-time eligible private friends SHALL join automatically under normal admission checks. Every active member SHALL have equal invitation permissions and SHALL NOT remove another member. Former members SHALL have no in-application request-to-rejoin flow; readmission SHALL originate with an active member and require acceptance after voluntary leave.

#### Scenario: Private friend first addition
- **WHEN** any eligible active member adds an authorized private friend who has never joined this group and all consent, capacity and block checks pass
- **THEN** membership begins automatically without acceptance, the profile remains private and only post-join messages are available

#### Scenario: Peer removal bypass
- **WHEN** a creator or ordinary member attempts to remove someone else through a UI action, current or legacy RPC, direct table write or backend operation
- **THEN** removal is denied and the target's membership remains unchanged

#### Scenario: Private request is subject to DM permissions
- **WHEN** a former member wants another invitation but either-direction blocking or mutual DM preferences prohibit contacting a current member
- **THEN** no rejoin request or message bypass is available; permitted DMs can ask for an invitation but cannot create membership or skip acceptance

#### Scenario: Repeated voluntary departures
- **WHEN** someone leaves, accepts a valid re-add invitation, leaves again and is invited once more
- **THEN** durable leave history requires acceptance again and no stale invitation or retry restores access independently
