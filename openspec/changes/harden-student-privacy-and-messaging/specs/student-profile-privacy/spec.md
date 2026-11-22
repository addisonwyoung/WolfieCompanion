# Spec Delta

## Purpose

Give students reversible control over general discoverability while preserving authorized relationships, voluntary collaboration, and personal academic work.

## ADDED Requirements

### Requirement: Reversible private discoverability
The system SHALL persist an owner-controlled private-profile setting. Public eligible students SHALL be searchable university-wide regardless of major, course, section or friendship. Private targets SHALL be omitted from general searches, autocomplete, classmate lists, recommendations and general invitation candidates; an authorized friendship picker SHALL be allowed to return private accepted friends without treating enrollment alone as authority. Private callers SHALL remain able to discover authorized public students. Creating or joining a group SHALL NOT change profile privacy.

#### Scenario: Private target and private caller
- **WHEN** a private student searches authorized public classmates while another private student matches
- **THEN** public authorized results remain available and the private target is absent from the server response

#### Scenario: Reverse privacy
- **WHEN** the owner saves public mode after being private
- **THEN** subsequent authorized discovery may include them without restoring removed friendships or changing messaging preferences

### Requirement: Contextual identity and optional sharing
Accepted friends SHALL retain authorized profile access subject to optional-field sharing and blocking. Existing conversation and group participation SHALL disclose only identity authorized within that context, not general profile access. Active messaging co-members SHALL see display name, profile picture and basic identity regardless of friendship/private status; this scoped picture audience is independent of general/classmate sharing, while other optional fields remain protected. Direct identifiers, avatar requests and legacy lookups SHALL NOT bypass privacy. Previously delivered data and historical authorship SHALL NOT be represented as erased.

#### Scenario: Copied private identifier
- **WHEN** an unrelated eligible student requests a private student's details or picture using a copied identifier
- **THEN** no profile values or picture bytes are returned through current or legacy access paths

#### Scenario: Friend and group access
- **WHEN** an unblocked accepted friend opens a private profile or an authorized group member reads its roster
- **THEN** the friend sees only permitted profile fields and the member sees contextual identity without an unrelated profile grant

### Requirement: Privacy defaults and informed onboarding
Existing profiles SHALL remain public during migration. Accounts created after migration SHALL default public. Subsequent upgrades SHALL NOT reset existing explicit private choices. Onboarding and profile settings SHALL explain discoverability, intentional identity disclosure through contact, group-specific name/picture visibility, retained message attribution and limited Study Buddy retention, optional sharing and accessible switching between public and private. Failed saves SHALL retain drafts without claiming success.

#### Scenario: Existing versus new accounts
- **WHEN** migration preserves an existing profile and a new account is subsequently created
- **THEN** the existing profile is public and the new account is public with an accessible explanation and private-mode control

### Requirement: Independent academic and voluntary participation
Private mode SHALL NOT disable personal enrollment, schedule import, assignments, exams, calendar, reminders, or voluntary authorized Study Buddies and messaging-group participation. Existing account eligibility and owner-only academic access SHALL remain enforced.

#### Scenario: Private voluntary collaboration
- **WHEN** an eligible private student creates or accepts admission to a group with all applicable admission checks satisfied
- **THEN** participation succeeds without switching to public and personal academic features remain available

### Requirement: Public search limits and friendship exceptions
Student search SHALL return only authorized identity and owner-shared optional fields. Public visibility SHALL NOT expose email, private messages, detailed schedules or unshared fields. Blocks SHALL override public and friendship discovery. Group identity SHALL NOT authorize unrelated profile lookup.

#### Scenario: Cross-major university search
- **WHEN** an eligible student searches for a public student outside their major and courses with no friendship
- **THEN** the public student is discoverable without course or friendship prerequisites and sensitive fields remain absent

#### Scenario: Private friend autocomplete
- **WHEN** a recipient picker combines public search with accepted-friend suggestions
- **THEN** private friends can appear through friendship authorization, private non-friends do not appear even with shared enrollment, and blocked pairs are excluded

#### Scenario: Group identity is not general discovery
- **WHEN** a private student joins a group chat containing non-friends
- **THEN** active co-members can see the student's name, picture and basic identity only in that authorized group context, without making the profile searchable or exposing full-profile fields, email or schedules

### Requirement: Private blocking management and safe admission explanations
Profile Block/Unblock actions and Blocked Students settings SHALL expose only the viewer's own directed blocks and retain management access to hidden targets without granting general profile access. Group and Study invitation candidates and failed operations SHALL NOT disclose whether another student's privacy setting, block relationship or another authorization restriction caused unavailability. Private shared-group warnings SHALL be scoped to the blocker and their authorized active/accepted contexts, never included in another member's profile, roster or notification payload.

#### Scenario: Generic failed group addition
- **WHEN** a selected student cannot be added because of consent, privacy, blocking or account eligibility
- **THEN** the operation fails atomically with a generic explanation such as "This student couldn't be added to the group chat," without exposing the restriction category or silently dropping that student

#### Scenario: Warning is not general profile access
- **WHEN** a blocker sees a private warning about an authorized co-member
- **THEN** the warning reveals no unrelated private profile fields and grants neither general discovery nor a DM exception; no block-direction information is returned to other members

### Requirement: Verified Study invitation is contextual consent
A legitimately issued unexpired Study invitation SHALL remain acceptable after recipient privacy/friendship changes, subject to eligibility, exact offering and original-inviter blocks. It SHALL NOT authorize general discovery, profiles, DMs or renewal after expiry. Newly issued invitations SHALL still enforce current private-friend visibility.

#### Scenario: Expired invitation to a now-private non-friend
- **WHEN** an inviter attempts fresh issuance to a now-private non-friend using an expired invitation or copied UUID
- **THEN** current visibility authorization denies the operation generically
