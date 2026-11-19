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

### Requirement: Automatic additions and re-additions
Every addition, including re-addition after voluntary leave, SHALL be automatic and SHALL revalidate the caller's eligible active membership, target eligibility, public visibility or accepted friendship for a private target, independent `allow_group_additions` consent, capacity and blocks against every active member. Messaging groups SHALL have no pending invitations, accept/decline operations or rejoin-request functionality. Former members SHALL NOT rejoin independently; an active member must add them. Group membership SHALL NOT create friendship or authorize DMs.

#### Scenario: Private friend and returning public student
- **WHEN** an active member adds an authorized private friend and an eligible public former member with all current checks satisfied
- **THEN** both become active automatically without acceptance, receive fresh message boundaries and gain no additional DM permissions

#### Scenario: Consent disabled before re-addition
- **WHEN** a former member disables group additions before another member attempts to add them
- **THEN** re-addition is rejected without membership or message access

#### Scenario: Former member attempts self-rejoin
- **WHEN** a former member invokes addition using a copied group identifier or seeks an application rejoin-request operation
- **THEN** no membership is created and no rejoin-request workflow is available

### Requirement: No new blocked pairings
Creation and all additions SHALL reject newly introduced blocked pairings without identifying who blocked whom. Existing blocked co-members SHALL retain shared participation and contextual identity, and SHALL NOT by themselves prevent an unrelated safe addition. Shared-group access SHALL NOT grant direct contact or unrelated profile access.

#### Scenario: Block by another active member
- **WHEN** a candidate has an either-direction block with any current member
- **THEN** admission fails generically even if the adding member has no block with the candidate

### Requirement: Self-leave and inactive messaging groups
Every eligible active messaging member SHALL be able to leave regardless of remaining count. Members SHALL NOT remove another member. No administrator, owner, manager or removal role SHALL exist; creator identity SHALL grant attribution only. Final-member departure SHALL make the messaging group inactive, retain historical messages without active client access and prohibit further messages/additions. Current and legacy operations SHALL enforce these boundaries.

#### Scenario: Creator leaves and final member follows
- **WHEN** the creator leaves a two-member chat and the remaining member later leaves
- **THEN** neither departure needs transfer or approval, and the empty group becomes inactive and inaccessible through inbox, RPC, table and event paths

#### Scenario: Peer removal bypass
- **WHEN** a creator or ordinary member tries to remove someone else through any supported or legacy path
- **THEN** the target's membership remains unchanged

### Requirement: Reused message visibility boundaries
Every new or returning messaging member SHALL have a fresh admission boundary. Messages sent before that admission, including during absence, SHALL remain inaccessible through history, previews, unread, direct database reads and realtime. Leaving SHALL revoke current access while preserving historical messages and author attribution for remaining authorized readers. Separate membership-history or departure-reason infrastructure SHALL NOT be required unless necessary to enforce authorization; it SHALL NOT be introduced for removed acceptance rules.

#### Scenario: Automatic re-add after absence
- **WHEN** an active member adds someone who previously left after messages were sent during absence
- **THEN** re-addition succeeds automatically if authorized, only post-readdition messages are available and earlier-tenure/absence messages are not restored

#### Scenario: Send races with leave
- **WHEN** a send or addition races with a membership departure
- **THEN** a consistent authorization order prevents departed callers from sending/adding after their access is revoked and preserves the correct join floor

### Requirement: Simple Study Buddy retention
Study Buddy invitations SHALL still require acceptance and verified course-section authorization. Leaving SHALL delete active membership and availability. While members remain, their group and data SHALL be preserved. When the final member leaves, the group and associated data SHALL be allowed to be deleted. No historical Study Buddy membership tracking, archive, contribution recovery or additional retention infrastructure SHALL be introduced. Existing Study Buddy ownership for academic roles/tasks is separate from messaging groups.

#### Scenario: Leave while others remain
- **WHEN** a private student leaves a Study Buddy group with other accepted members
- **THEN** active roster and availability omit them, remaining members retain their group/data and no historical membership record or recovery feature is required

#### Scenario: Final Study Buddy departure
- **WHEN** the final member leaves a Study Buddy group
- **THEN** the group and associated data can be deleted without creating an archive or contribution recovery record

### Requirement: Authorized group identity and pictures
All active messaging-group members SHALL be able to see active co-members' display names, profile pictures and basic identity within that group, regardless of friendship or private status. Missing pictures SHALL use a fallback. This audience SHALL NOT require enabling general/classmate picture sharing and SHALL NOT expose emails, detailed schedules, unshared optional fields, full profiles or reusable private storage references. Group membership SHALL NOT make private students generally searchable. Historical messages SHALL retain appropriate author attribution after departure without granting unrelated profile or current private-picture access. Database authorization and backend APIs SHALL enforce the group context.

#### Scenario: Private non-friend co-member
- **WHEN** an authorized active member views an active private co-member to whom they are not a friend
- **THEN** the group can show the private student's display name, picture and basic identity, but search/autocomplete and full-profile lookups remain unauthorized and DM rules remain independent

#### Scenario: Outsider or departed viewer requests group picture
- **WHEN** a nonmember or former member supplies a group and student identifier to identity/picture endpoints
- **THEN** group-scoped private identity/picture access is denied server-side, including privileged backend resolver paths

#### Scenario: Historical author leaves
- **WHEN** a sender leaves and another active member reads an authorized historical message
- **THEN** appropriate sender attribution remains, without using the historical sender identifier to retrieve unrelated private fields or their current private picture
