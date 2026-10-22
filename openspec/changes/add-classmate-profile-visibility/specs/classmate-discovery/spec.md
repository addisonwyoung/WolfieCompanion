# Spec Delta

## MODIFIED Requirements

### Requirement: Limited profile projection and preserved ownership
The roster discovery RPC SHALL continue returning exactly a stable student identifier, name, and nullable major, and cards SHALL display name and major with an unset-major placeholder. A separate authorized detail lookup SHALL expose name, nullable major, stable student identifier, and only the optional fields the owner has chosen to share: year of study, interests, residence status, and profile picture. Unshared optional values and avatar references MUST NOT be sent to the viewer. Email, timestamps, sections, and other course memberships SHALL remain excluded. Direct peer profile/enrollment/section reads and all peer writes SHALL remain denied; avatar reads SHALL be permitted only for the current shared picture under the eligibility and visibility rules below.

#### Scenario: Limited peer information
- **WHEN** a student retrieves classmates whose profiles contain additional personal fields
- **THEN** the roster response contains exactly identifier, name, and major, and cards display name and major only

#### Scenario: Direct access remains private
- **WHEN** a student sharing a saved course attempts direct reads or writes of a peer's profile, courses, or sections, or writes to their avatar
- **THEN** owner-only authorization denies access

#### Scenario: Only selected details are returned
- **WHEN** a peer shares interests but keeps year, residence, and picture private
- **THEN** the detail response includes interests and baseline identity but excludes private values and avatar references

### Requirement: Explicit prototype visibility limitations
The interface and setup documentation SHALL explain that name and major are always visible to eligible students sharing a saved course, optional details are shared only by owner choice, and memberships are self-reported without term or official enrollment verification. Discovery SHALL NOT be presented as a public directory or proof of official registration. Visibility controls SHALL identify the audience and distinguish always-shared fields from optional sharing.

#### Scenario: Understand restricted visibility
- **WHEN** a student uses classmate discovery or edits sharing settings
- **THEN** explanatory text identifies the shared-course audience, mandatory name/major visibility, optional sharing controls, and self-reported course limitations

## ADDED Requirements

### Requirement: Owner-controlled optional sharing
Eligible owners SHALL independently enable or disable sharing of year, interests, residence status, and profile picture. Existing and new profiles SHALL default all four controls to private. Name and major SHALL have no hide control; a missing major SHALL retain the existing placeholder and SHALL NOT block access. Saving settings SHALL persist across sessions without deleting underlying private profile values. Failed saves SHALL retain the draft and show a retryable error without claiming success.

#### Scenario: Private defaults
- **WHEN** an existing or newly created account has not enabled optional sharing
- **THEN** peers can retrieve name and major only, even when optional profile values are populated

#### Scenario: Save and revoke individual fields
- **WHEN** an owner saves sharing for year and interests, then later disables year
- **THEN** subsequent authorized lookups include interests but exclude year, the owner's year value remains saved, and the settings persist after reload

#### Scenario: Save fails
- **WHEN** persistence of sharing choices fails
- **THEN** the owner sees an error, retains the draft, and can retry without a false success message

### Requirement: Course-scoped profile authorization
Every detail and picture request SHALL derive caller identity from the authenticated session, require both users to meet existing trusted eligibility criteria, exclude self as a peer, and verify both users have saved the selected normalized course. Unknown, inaccessible, or no-longer-eligible targets SHALL return a generic unavailable result without leaking profile values. A supplied student identifier SHALL NOT itself authorize access.

#### Scenario: Forged or stale target
- **WHEN** a caller requests a target outside the selected course, a nonexistent target, or a target that lost eligibility or shared membership
- **THEN** no peer details or picture bytes are returned

#### Scenario: Invalid caller
- **WHEN** an anonymous or ineligible caller requests details or a picture, or the caller lacks the selected course membership
- **THEN** the request is denied without peer information

### Requirement: Accessible classmate profile flow
Each roster entry SHALL offer a keyboard-accessible View profile action identifying the student. Activation SHALL open a read-only profile dialog showing baseline identity and shared optional details. Private sections SHALL be omitted, shared-but-empty fields SHALL use honest empty states, and unavailable pictures SHALL use initials. The dialog SHALL support close and Escape, manage focus, and restore focus to its originating action when available. Closing SHALL preserve the selected course and roster. Loading, retryable failure, and unavailable states SHALL be distinct and SHALL NOT use fictional data.

#### Scenario: Open and return
- **WHEN** a student activates a classmate's View profile action and closes the dialog
- **THEN** they see authorized shared details, return to the same roster/course, and regain focus on the originating action

#### Scenario: Loading and retry
- **WHEN** a detail request is loading or fails due to a transient error
- **THEN** the dialog shows the corresponding state and offers retry for the failed request without displaying another student's data

#### Scenario: Context changes during a request
- **WHEN** the selected peer, course, account, authentication state, or main app view changes
- **THEN** old details and picture resources are cleared, late responses cannot repopulate them, and reopening triggers fresh authorization

### Requirement: Revocable picture delivery
Peer pictures SHALL be delivered only when picture sharing is enabled and the requested object is the target's currently saved avatar. Private storage SHALL remain private and arbitrary or superseded paths SHALL be denied. Subsequent requests after revocation SHALL be denied; responses SHALL prevent caching and SHALL NOT expose reusable public or signed picture URLs. Previously delivered bytes cannot be recalled.

#### Scenario: Disable sharing or replace picture
- **WHEN** an owner disables picture sharing or replaces/removes the saved picture
- **THEN** subsequent requests for the disabled or superseded picture are denied and profile UI falls back to initials

### Requirement: Stable identity for later connections
Profile details SHALL use the same account student identifier as the roster, independent of display name changes. This change SHALL NOT expose a functional or placeholder messaging action or create conversations.

#### Scenario: Renamed classmate
- **WHEN** a peer changes their name and the viewer reopens the profile
- **THEN** the updated name has the same stable student identifier and no messaging action appears
