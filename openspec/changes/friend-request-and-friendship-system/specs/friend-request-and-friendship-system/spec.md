# Spec Delta

## Purpose

Let eligible students send and manage friend requests, establish durable accepted friendships, and find friends in each shared course. All friend and request data remains private to the participants, and profile details continue to follow existing sharing choices.

## ADDED Requirements

### Requirement: Private and unique friend relationship records
The system SHALL persist friend requests with a stable identifier, sender, recipient, status (`pending`, `accepted`, or `declined`), and timestamps. A request SHALL NOT target its sender. At most one pending request SHALL exist for an unordered pair of students, regardless of direction. Declined requests SHALL remain as history, and a later retry SHALL create a new pending request row. The system SHALL persist accepted friendships in a separate table with one row per pair, storing the two distinct student identifiers in a consistent canonical order and a friendship timestamp. Pending or declined requests SHALL NOT count as friendships.

#### Scenario: Prevent duplicate and reverse pending requests
- **WHEN** a pending request already exists between two students in either direction
- **THEN** another pending request for the same pair cannot be created

#### Scenario: Preserve declines and allow a later retry
- **WHEN** a recipient declines a request and the sender later retries
- **THEN** the declined request remains historical, leaves the pending inbox, and a new pending request may be created

#### Scenario: Store accepted friendship once
- **WHEN** a recipient accepts a pending request
- **THEN** one canonical friendship row exists for the pair, and no second friendship row can be inserted for the same two students

### Requirement: Authorized friend request actions
The system SHALL derive the caller from the authenticated session and require current student eligibility for friend-request actions. A student SHALL be able to request friendship only with another eligible student they are allowed to recommend in the selected shared course. A student SHALL NOT request themself, create a request with an existing friend, or create an additional request while a pending request exists in either direction. Only the recipient of a pending request SHALL be able to accept or decline it. Only the sender and recipient SHALL be able to read that request or its state. Unauthorized callers SHALL receive no request or profile data.

#### Scenario: Send a request from a course recommendation
- **WHEN** an eligible student requests friendship with an eligible person recommended in their selected course and no friendship or pending request exists
- **THEN** one pending request is created and its recipient can see it in their incoming requests

#### Scenario: Reject self, unrelated, ineligible, or already-connected requests
- **WHEN** a student requests themself, a person outside the allowed course recommendation boundary, an ineligible user, or a person already connected by friendship or a pending request
- **THEN** the request is rejected without creating a duplicate or exposing unrelated relationship data

#### Scenario: Restrict response actions to the recipient
- **WHEN** the sender or an unrelated student attempts to accept or decline a request
- **THEN** the request remains unchanged and no friendship is created

### Requirement: Incoming request inbox and profile privacy
The signed-in student's profile area SHALL include a Friend requests control with a badge equal to the number of their pending incoming requests. Opening it SHALL show only requests addressed to that student. Each entry SHALL display the sender's name and available major, a View profile action, and Accept and Decline actions. The profile view SHALL show only fields the sender has chosen to share under the existing profile privacy controls. Pending incoming requests SHALL NOT appear as accepted friends.

#### Scenario: View only incoming pending requests
- **WHEN** a student opens Friend requests
- **THEN** the list and badge count include only pending requests whose recipient is the signed-in student

#### Scenario: View a request sender's public profile
- **WHEN** a student selects View profile for an incoming request
- **THEN** the sender's name and available major are shown and optional profile fields appear only when the sender has enabled the corresponding sharing settings

#### Scenario: Accept an incoming request
- **WHEN** the recipient accepts a pending request
- **THEN** the request becomes accepted, one friendship is created, the request disappears from the pending inbox, and the badge count and relevant lists update without a manual page refresh

#### Scenario: Decline an incoming request
- **WHEN** the recipient declines a pending request
- **THEN** the request is marked declined, disappears from the pending inbox, the badge count updates, and no friendship is created

### Requirement: Request states on course recommendations
Each eligible student in a course recommendation list SHALL have an Add friend action when there is no accepted friendship or pending request for the pair. After sending, the sender SHALL see a pending state and SHALL NOT be able to create another pending request. An incoming request SHALL be identified as awaiting the recipient's response. Accepted friendship SHALL be reflected as connected wherever the relationship is shown. After a decline, the sender SHALL be informed of the declined state and SHALL be allowed to send a new request later. Accepted friends SHALL be excluded from all course recommendation lists in both directions.

#### Scenario: Send and reflect a request
- **WHEN** a student sends a request from a recommendation card
- **THEN** the card immediately shows a request-sent state after success and prevents duplicate sending

#### Scenario: Reflect the recipient's decision to the sender
- **WHEN** a recipient accepts or declines a pending request while the sender's dashboard is open
- **THEN** the sender's relationship state updates to connected or declined without requiring a manual page refresh when realtime delivery is available

#### Scenario: Exclude friends from recommendations
- **WHEN** two students become accepted friends and share one or more saved courses
- **THEN** each is excluded from the other's recommended-student results for every shared course

#### Scenario: Allow a new request after decline
- **WHEN** the prior request between two students is declined and the sender chooses Add friend again
- **THEN** a new pending request can be created and shown as request sent

### Requirement: Friends in this class
For each selected course, the course people area SHALL provide a Friends in this Class list containing only accepted friends who are currently eligible and have saved that same normalized course. A friend SHALL appear once in each shared course list, even if either student has multiple sections. Pending and declined requests SHALL NOT appear in this list. Friend profile actions SHALL show only information permitted by the friend's sharing settings.

#### Scenario: Show accepted friends in each shared course
- **WHEN** an accepted friend shares multiple saved courses with the signed-in student
- **THEN** the friend appears once in the Friends in this Class list for each shared course and not in unrelated courses

#### Scenario: Exclude pending requests from friends
- **WHEN** a request is pending or declined
- **THEN** neither student sees the other in Friends in this Class unless an accepted friendship also exists

### Requirement: Keep friend state current and independent
Successful send, accept, and decline actions SHALL update the affected inbox count, request status, recommendation action, and course friend list without requiring a manual refresh. A remote decision SHALL update the other participant's open dashboard when realtime delivery is available. Failures SHALL preserve the last confirmed relationship state and show a retryable, accessible message. Friend inbox, profile, and course friend-list failures SHALL NOT break existing classmate discovery or the selected-course roster.

#### Scenario: Update visible relationship state after a successful action
- **WHEN** a friend action succeeds
- **THEN** all affected views in the current session reflect the confirmed state immediately

#### Scenario: Preserve state on a failed action
- **WHEN** sending, accepting, or declining fails
- **THEN** the last confirmed request or friendship state remains visible with an accessible error and retry option

#### Scenario: Keep classmate discovery independent
- **WHEN** friend data cannot be loaded
- **THEN** the existing classmate roster continues to load and behave according to its existing contract
