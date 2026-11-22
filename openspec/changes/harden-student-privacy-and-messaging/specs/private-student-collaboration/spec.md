# Spec Delta

## Purpose

Support private voluntary collaboration through verified-offering Study Buddies invitations and member-managed group chats, preserving contextual privacy, capacity, departure and message-history boundaries.

## ADDED Requirements

### Requirement: Verified offering Study Buddies selection
Study Buddies SHALL preserve the course selection, classmate selection, group name and create/send invitations workflow. Candidates, initial creation and new invitations SHALL use the group's authoritative verified course, section, professor, semester and academic year. Pending/rejected enrollment or a shared section with another professor/term SHALL NOT qualify. Public eligible classmates SHALL NOT require friendship. A private student SHALL be selectable only through the actual inviter's accepted friendship and matching offering; shared enrollment alone SHALL NOT expose private non-friends. Private creators and invitees SHALL NOT be required to become public. Study Buddies SHALL NOT introduce group messaging.

#### Scenario: Public classmate and private friend
- **WHEN** a creator selects eligible public non-friend and private accepted-friend classmates matching the exact verified offering
- **THEN** both can receive invitations while a private non-friend remains hidden and no profile becomes generally discoverable

#### Scenario: Offering mismatch
- **WHEN** a candidate has pending/rejected enrollment or differs in course, section, professor, semester or academic year
- **THEN** initial and additional invitation operations reject the candidate generically without silently changing the offering

### Requirement: Any accepted member can invite additional classmates
Any eligible accepted Study Buddies member SHALL be able to invite additional eligible classmates after group creation using the existing pending invitation and explicit acceptance workflow. Owner status SHALL NOT be required. Pending invitees, former members and unrelated students SHALL NOT send invitations. Invitation authority SHALL be revalidated at submission using the authenticated actor, group membership, verified offering, privacy and bilateral inviter-invitee blocking rules. Invitations SHALL NOT create friendships, override DM preferences or require group-chat addition consent.

#### Scenario: Ordinary accepted member invites
- **WHEN** an eligible accepted non-owner selects another authorized classmate for the group's verified offering
- **THEN** the classmate receives a pending invitation through the same acceptance workflow as an initial invitee

#### Scenario: Pending member attempts to invite
- **WHEN** a pending invitee or departed member invokes an invitation operation using the group identifier
- **THEN** no invitation or membership is created and member-only information remains unavailable

### Requirement: Eight occupied Study Buddies places
A Study Buddies group SHALL have at most eight total occupied places, counting all accepted memberships and verified unexpired pending invitations, including the creator. Declined invitations SHALL consume no capacity. Initial selection SHALL support one to seven invitees; additional selection SHALL be limited by remaining capacity. Acceptance SHALL convert the invitee's reserved pending place without consuming another place. Duplicate invitations and exact retries SHALL NOT consume additional places or replace an existing invitation's actual inviter. Invalid or oversized invitation batches SHALL fail atomically without silently excluding selected students.

#### Scenario: Pending reservations fill the group
- **WHEN** a group has five accepted members and three pending invitees
- **THEN** an additional invitation fails without changing the group, and accepting a reserved pending invitation does not exceed eight occupied places

#### Scenario: Decline frees capacity
- **WHEN** one pending invitee declines a full group's invitation
- **THEN** exactly one place becomes available for an authorized accepted member to invite another eligible classmate

#### Scenario: Concurrent invitations for the final place
- **WHEN** two accepted members simultaneously invite different classmates into a group with one remaining place
- **THEN** at most one additional place is reserved, with no ninth participant, partial batch or duplicate notification

### Requirement: Actual inviter provenance and acceptance
Each invitation SHALL preserve the authenticated actual inviter independently of current group ownership. Ownership transfer SHALL NOT rewrite inviter identity, substitute the new owner for authorization checks or by itself cancel the invitation. An invitation SHALL be acceptable only within 168 hours of verified issuance; acceptance SHALL revalidate target eligibility, the group's exact current verified offering, verified issuance and bilateral blocking between that inviter and invitee. Privacy/friendship authorization SHALL be checked at issuance, not reimposed because the recipient later becomes private or loses friendship. Acceptance SHALL NOT reject a student solely because another co-member has a block with them. Inviter identity SHALL NOT grant unrelated private profile access. A pending invitation SHALL NOT be reassigned to evade a direct block.

#### Scenario: Inviter and owner are different
- **WHEN** an accepted non-owner invites a classmate and group ownership later transfers
- **THEN** the invitation still identifies that original inviter and acceptance uses that pair's privacy/block authorization rather than the current owner's relationship

#### Scenario: Direct block before acceptance
- **WHEN** an invitee and the recorded actual inviter become blocked in either direction before acceptance
- **THEN** acceptance fails generically, decline remains available, and no friendship or DM permission is created

### Requirement: Pending Study Buddies invitation privacy
Pending invitees SHALL receive only safe invitation metadata, including limited actual-inviter attribution and offering/group identity needed to accept or decline. They SHALL NOT receive the roster, availability, study roles, tasks, private shared-group warnings or other member-only content through any RPC, direct read or event path. Decline SHALL NOT reveal private-profile status or blocking information. Privacy changes SHALL NOT automatically accept or silently delete pending invitations; applicable checks still govern acceptance.

#### Scenario: Pending identifier bypass
- **WHEN** a pending invitee requests a full group, co-member roster, task/availability data or private warning using a saved identifier
- **THEN** only the authorized invitation preview remains available until acceptance

### Requirement: Configurable messaging-group addition permissions
Messaging groups SHALL offer All Members (default for new and migrated groups) and Creator Only addition permissions. In All Members mode, any eligible active member SHALL be able to add authorized students. In Creator Only mode, only the original eligible active creator with unrevoked creator privileges SHALL be able to add. The creator SHALL select the mode at creation and may change it only while active and before their first departure. Ordinary members SHALL NOT change the mode. Public candidates SHALL NOT require friendship/major/course/section matching; private targets SHALL require the adding actor's accepted friendship. Creation SHALL require two distinct selected students plus the creator, and total active membership SHALL NOT exceed 50. No administrator, moderator or ownership transfer SHALL be introduced.

#### Scenario: Default any-member addition
- **WHEN** an active non-creator selects an eligible public non-friend in All Members mode with all admission checks satisfied
- **THEN** the addition succeeds without creating friendship or DM permission

#### Scenario: Creator Only setting
- **WHEN** the active original creator selects Creator Only and an ordinary member attempts an addition or setting change
- **THEN** both actions are denied without changing the group, while the eligible active creator may still add or change the mode

### Requirement: Automatic additions and re-additions
Every messaging-group addition and re-addition SHALL be automatic and SHALL revalidate the actual adding member's eligible active membership, target eligibility, public visibility or accepted friendship for a private target, independent allow-group-additions consent, capacity and bilateral actor-target blocking. No pending messaging invitations, accept/decline or rejoin-request functionality SHALL be introduced. Former members SHALL NOT rejoin independently. Every authorized addition SHALL receive a fresh message visibility boundary. Ineligible or unauthorized selected students SHALL NOT be silently excluded: the whole creation/addition batch SHALL fail atomically with a generic explanation that does not identify whether privacy, blocking, consent or another authorization condition failed. Candidate disabled-state explanations SHALL likewise not expose the restriction category.

#### Scenario: Returning student disables additions
- **WHEN** an active member attempts to re-add a former member who disabled group additions
- **THEN** the whole attempted batch fails generically, existing group state is preserved and no message access or partial membership is granted

#### Scenario: Former member self-rejoins
- **WHEN** a former member invokes addition using a copied group identifier or stale receipt
- **THEN** no membership is created without a new authorized active-member addition

### Requirement: Actor-target blocks and third-party shared membership
Messaging additions and Study Buddies invitations SHALL deny either-direction blocks between the actual adding/inviting actor and each target. They SHALL NOT reject independent third-party admission solely because selected students or other co-members have blocked one another. All other eligibility, privacy, capacity and consent requirements SHALL still apply. Blocking SHALL NOT automatically remove memberships. Shared access SHALL NOT grant DM or general profile authority. Only a viewer who initiated a block SHALL receive the private contextual warning described in student-communication-authorization; no shared payload SHALL expose that direction.

#### Scenario: Sally admits Alice and Bob
- **WHEN** Alice has blocked Bob and Sally independently adds or invites both with valid actor-target authorization
- **THEN** automatic messaging admission or pending Study invitations succeed respectively, Study acceptance is still required, and only Alice receives her private warning once both are active/accepted co-members

#### Scenario: Direct blocked invitation
- **WHEN** Alice attempts to add/invite Bob, or Bob attempts to add/invite Alice, while either direction is blocked
- **THEN** the operation fails generically without disclosing the blocking party or granting a direct-contact exception

### Requirement: Messaging send threshold with retained small groups
Messaging groups SHALL require three to 50 eligible students at creation and at least three eligible active members for each genuinely new group message. When fewer than three eligible active members remain, the group SHALL retain existing history and memberships with a generic disabled-composer explanation. Authorized additions and voluntary leave SHALL remain available while members remain. Reaching three eligible active members SHALL restore normal send authorization without automatically sending retained drafts. Blocks or DM preferences SHALL NOT reduce the eligible-member count by themselves. Exact committed retries SHALL NOT insert a new message or fabricate activity/unread events.

#### Scenario: Departure from three to two
- **WHEN** one member leaves a three-member group
- **THEN** the remaining members retain authorized history, cannot insert new messages, and can leave or add authorized students to restore the minimum

#### Scenario: Eligibility changes without membership deletion
- **WHEN** a three-member group has only two currently eligible active accounts
- **THEN** new group messages fail generically even though three membership rows remain, with no account restriction details disclosed

### Requirement: Self-leave and inactive messaging groups
Every eligible active messaging member SHALL be able to leave regardless of remaining count. Members SHALL NOT remove another member. No administrator, moderator, ownership-transfer or peer-removal role SHALL exist. On the original creator's first departure the database SHALL atomically set All Members and permanently revoke their special addition/setting privileges while retaining original creator attribution. Final-member departure SHALL make the group inactive, retain historical messages without active client access and prohibit messages/additions. Current and legacy entry points SHALL enforce these boundaries.

#### Scenario: Creator and final member leave
- **WHEN** the creator leaves a two-member group and the remaining member later leaves
- **THEN** neither departure needs approval or transfer, and the empty group is inactive and inaccessible through inbox, RPC, table and event paths

#### Scenario: Former creator returns
- **WHEN** an authorized member re-adds the original creator after that creator left
- **THEN** the group remains All Members and the former creator has only ordinary member permissions, with no ability to restore Creator Only or change settings

#### Scenario: Peer removal bypass
- **WHEN** a creator or ordinary member attempts to remove someone else through any supported or legacy path
- **THEN** the target's membership remains unchanged

### Requirement: Reused message visibility boundaries
Every new or returning messaging member SHALL have a fresh admission boundary. Messages sent before that admission, including previous-tenure and absence messages, SHALL remain inaccessible through history, previews, unread, direct reads and realtime. Leaving SHALL revoke current access while preserving messages/author attribution for remaining authorized readers. Separate membership-history or departure-reason infrastructure SHALL NOT be introduced unless necessary for demonstrated authorization needs.

#### Scenario: Automatic return after absence
- **WHEN** an authorized active member re-adds a former member
- **THEN** only messages after the new admission boundary become available; earlier-tenure/absence history is not restored through reads or stale retries

#### Scenario: Send races with leave
- **WHEN** a new send or addition races with membership departure or a drop below the send minimum
- **THEN** common authorization ordering prevents unauthorized new messages/additions and preserves the correct history boundary

### Requirement: Simple Study Buddies retention and owner departure
Study Buddies SHALL retain explicit acceptance and exact verified offering authorization for new admission. Members SHALL leave voluntarily, removing active membership and availability. Owner departure SHALL preserve the remaining accepted memberships and the group's existing tasks, notes, contribution attribution and other retained data, transferring Study ownership under the existing succession model where another accepted member remains. Two accepted members SHALL continue collaborating without a group-chat minimum or messaging feature. Study ownership SHALL NOT control additional invitation rights or rewrite historical actual-inviter identity. When no accepted Study members remain, the group SHALL be deleted and pending invitations invalidated with generic group-unavailable handling; durable private notification delivery is deferred to Stage 3C; no archives, membership-history ledger or contribution-recovery infrastructure SHALL be introduced.

#### Scenario: Owner leaves two accepted members
- **WHEN** the owner leaves a group with two other accepted members
- **THEN** the group/data and both accepted memberships survive, Study ownership transfers, recorded inviter identities remain unchanged and either eligible accepted member may send further authorized invitations within capacity

#### Scenario: Ordinary private member leaves
- **WHEN** a private accepted member leaves while others remain
- **THEN** active rosters/availability omit them, the remaining group's data is preserved and no historical membership ledger is created

### Requirement: Authorized group identity and pictures
All active messaging-group members SHALL be able to see active co-members' display names, profile pictures and basic identity within that context, regardless of friendship/private status. Missing pictures SHALL use a fallback. This audience SHALL NOT require general/classmate picture sharing or expose emails, detailed schedules, unshared optional fields, full profiles or reusable private storage references. Historical author attribution SHALL NOT grant current private-picture/full-profile access after departure.

#### Scenario: Private non-friend co-member
- **WHEN** an authorized active member views a private non-friend co-member
- **THEN** group-scoped identity/picture access is available without general search, full-profile, DM or unrelated-field access

#### Scenario: Outsider or departed viewer
- **WHEN** a nonmember or former member supplies group/student identifiers to identity/picture endpoints
- **THEN** the server denies current private identity/picture access outside their authorized context

#### Scenario: Historical author leaves
- **WHEN** a sender leaves and another active member reads an authorized historical message
- **THEN** appropriate sender attribution remains without unrelated private fields or current private-picture access

### Requirement: Preserved legacy and departed-inviter Study invitations
Existing invitations and accepted memberships SHALL be preserved when introducing inviter provenance. Every new invitation SHALL permanently record its authenticated actual inviter; missing historical inviter identities SHALL NOT be fabricated. Invitations may remain actionable after the inviter leaves or becomes ineligible if the group exists and the invitee remains eligible, subject to verified issuance, expiry, capacity and original-inviter blocking checks. Ownership transfer SHALL NOT replace inviter identity.

#### Scenario: Inviter departure with remaining accepted members
- **WHEN** the actual inviter leaves or becomes ineligible while the group remains and a pending invitee meets the applicable checks
- **THEN** departure/ineligibility alone does not invalidate acceptance, and the original inviter's block relationship remains enforced

#### Scenario: Last accepted Study member leaves
- **WHEN** no accepted Study members remain after departure
- **THEN** the group is deleted, pending invitations cannot be accepted, and affected invitees receive generic unavailable handling (durable notifications are deferred to Stage 3C) without private group or block details

### Requirement: Study invitation expiry and generation safety
Every new invitation SHALL expire exactly 168 elapsed hours after trusted database issuance. At database time greater than or equal to the deadline it SHALL NOT be accepted or reserve capacity. Pending/accepted storage statuses MAY be retained with derived expired/unavailable projections. Accepted membership SHALL NOT expire. New issuance after expiry SHALL require fresh current inviter/target offering, visibility, block and capacity authorization, a new generation and explicit operation; retries SHALL NOT extend or replace prior issuance. Acceptance/decline SHALL bind to the recipient's current generation. Legacy unverifiable invitations SHALL be unavailable and non-reserving without modifying accepted data or inventing provenance. Existing groups lacking confirmed offering context SHALL remain usable by accepted members with new admissions closed.

#### Scenario: Public invitee becomes private or loses friendship
- **WHEN** a verified, unexpired invitation's recipient becomes private or loses friendship after authorized issuance
- **THEN** explicit acceptance remains possible with current recipient/offering eligibility and no original-inviter block, without granting general discovery or DM permissions

#### Scenario: Deadline crosses during lock wait
- **WHEN** acceptance waits on a group or pair lock until its deadline has passed
- **THEN** a trusted post-lock time check rejects acceptance and the invitation no longer reserves a place

#### Scenario: Stale response after a fresh invitation
- **WHEN** an expired invitation is replaced by a fresh authorized generation and a delayed accept or decline names the older generation
- **THEN** the fresh invitation remains unchanged and no membership is granted

#### Scenario: Receipt replay after expiry or deletion
- **WHEN** an old issuance request is retried after expiry, dismissal, replacement or final group deletion
- **THEN** it cannot issue another invitation, renew a deadline, replace an inviter or recreate the group

#### Scenario: Pending projection privacy
- **WHEN** pending/expired recipients or accepted members list their groups
- **THEN** recipients receive safe invitation metadata, accepted members receive accepted identities and active pending counts, and pending identities are disclosed only to authorized invitation management
