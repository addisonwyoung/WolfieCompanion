# Spec Delta

## Purpose

Let eligible students contact friends and other permitted profile peers through private text conversations that remain available across chat closure, reloads, and sign-in sessions.

## ADDED Requirements

### Requirement: Profile messaging entry and saved inbox
Authorized friend and non-friend profile views SHALL provide a Message action for a currently eligible peer, independent of friendship status. A new conversation SHALL require accepted friendship, a pending friend request involving both students, or a saved shared course authorizing the profile context. A copied peer UUID alone SHALL NOT permit new contact. An existing participant conversation SHALL be reopened instead of creating another. Messages navigation SHALL list the signed-in student's saved conversations and allow reopening them without visiting a profile. Transitioning from a profile to messaging SHALL close the profile dialog before opening the chat, without stacking modal dialogs or losing keyboard focus. Unavailable messaging SHALL NOT break profile viewing.

#### Scenario: Contact a non-friend classmate
- **WHEN** an eligible student activates Message on an eligible shared-course classmate's profile and the recipient allows new DMs
- **THEN** a composer for that person opens without requiring a friend request or friendship

#### Scenario: Contact a friend or request participant
- **WHEN** an eligible student activates Message on an authorized accepted-friend or pending-request profile
- **THEN** messaging uses the same stable account pair and availability rules as any other profile entry

#### Scenario: Return through inbox
- **WHEN** a participant selects a conversation from Messages after closing its chat
- **THEN** the saved conversation and its history reopen without requiring a current course match or friendship

### Requirement: Availability controls new conversations only
Each eligible user SHALL have an owner-controlled Allow new direct messages preference, default true for existing and new accounts. Saving it SHALL persist across reloads and devices and affect other people's ability to establish a new conversation with that user. A disabled preference SHALL NOT delete, hide, freeze, or prevent either participant from sending in an existing conversation. It SHALL NOT prevent the owner from initiating an allowed outgoing conversation. Availability SHALL be checked on the server when the first message is committed; merely opening a composer SHALL NOT establish a conversation or reserve permission. The interface SHALL explain these semantics and preserve the last confirmed setting with a retryable error on failed save.

#### Scenario: New and existing account defaults
- **WHEN** an existing or new account has not changed the preference
- **THEN** new direct messages are enabled

#### Scenario: Close new DMs while preserving chats
- **WHEN** a user disables new DMs
- **THEN** first messages creating new conversations with that recipient are rejected, while both participants can continue existing conversations and their history remains available

#### Scenario: Disable after composer opening
- **WHEN** a sender opens a composer before the recipient disables new DMs but has not stored a first message
- **THEN** attempting the first send fails without creating an empty conversation or storing the message

### Requirement: Durable unique participant conversations
The system SHALL durably store at most one one-to-one conversation for each unordered pair of distinct eligible student accounts, with stable identifiers and server-assigned timestamps. A conversation and its first message SHALL be committed atomically. Closing chats, navigation, reloads, sign-out, course changes, or friendship changes SHALL NOT delete saved messages. Established conversations SHALL remain readable to an eligible participant even if the other account becomes ineligible, using a neutral identity placeholder when needed; sending SHALL require both accounts to remain eligible. Account deletion and retention beyond existing account-lifecycle behavior are outside this change.

#### Scenario: Concurrent first contact
- **WHEN** the two students send initial messages concurrently from either direction or from multiple tabs/courses
- **THEN** one conversation exists containing each distinct confirmed message once, without an empty duplicate thread

#### Scenario: Conversation survives closure and reload
- **WHEN** a participant sends text, closes the chat, signs out, and signs back in or uses another device
- **THEN** the confirmed message remains available in that participant's saved conversation

### Requirement: Participant-only database authorization
Every messaging operation SHALL derive caller identity from the authenticated session and require current student eligibility. Only the two conversation participants SHALL read its rows, message bodies, inbox preview, or events. Sender identity and timestamps SHALL be assigned by the server. Clients SHALL NOT add participants, impersonate senders, edit or delete messages, or insert messages bypassing first-contact and availability checks. Unauthorized, unknown, or unrelated lookups SHALL not reveal private profile details, conversation existence, message text, or settings. Messaging SHALL not grant access to private optional profile fields, pictures, emails, or full course lists.

#### Scenario: Forged conversation and sender
- **WHEN** an unrelated student or anonymous/ineligible caller guesses a conversation ID or tries to supply another sender's identity
- **THEN** no conversation content is disclosed and no unauthorized message is stored

#### Scenario: Direct database and event access
- **WHEN** a third party attempts direct message-table reads/writes or subscribes to conversation events
- **THEN** participant authorization denies private data and all protected mutation bypasses

### Requirement: Text-only validated idempotent sends
Messages SHALL contain plain text only, preserving line breaks and rendering markup literally. The system SHALL reject blank or whitespace-only text and text exceeding 2000 Unicode code points; client and server SHALL agree on validation. Each send attempt SHALL have a client-generated stable request identifier, scoped to its sender. A retry of the same identifier, recipient, and body SHALL return the original confirmed message without another insertion; reuse with different content or recipient SHALL fail. Sending SHALL show pending state, prevent accidental duplicate submission, and clear the draft only after server confirmation. Failed or uncertain sends SHALL retain their text and request identity for safe retry, never claim success, and never automatically send after a later sign-in.

#### Scenario: Lost acknowledgement and retry
- **WHEN** the server commits a message but its response is lost and the sender retries the same attempt
- **THEN** the original message is returned and appears once in both histories

#### Scenario: Invalid or unsafe-looking text
- **WHEN** a student sends blank/oversized content or text containing HTML, script-like content, or line breaks
- **THEN** invalid text is rejected, and valid text is stored and displayed literally with its line breaks rather than executed or interpreted as rich content

### Requirement: Ordered bounded history and incoming updates
Saved history SHALL have deterministic server order and bounded pages, with a Load older messages action that can reach all earlier messages without duplicates or omissions for an unchanged history. Inbox pages SHALL likewise allow access to all saved conversations and order by latest activity. New incoming messages SHALL appear in an open active conversation without a manual reload under normal connectivity. The client SHALL reconcile authoritatively on chat opening, application focus, reconnect, and successful send; delayed/duplicate delivery SHALL not duplicate rows. Updating incoming messages SHALL preserve the reader's position when viewing older content, with a reachable new-messages indication instead of forced scrolling.

#### Scenario: Incoming text and reconnect
- **WHEN** the other participant sends while a chat is open or a connection recovers after missing updates
- **THEN** confirmed messages appear in deterministic order once and the inbox reflects the conversation's latest activity

#### Scenario: Long conversation
- **WHEN** history exceeds one page and the student repeatedly loads older messages
- **THEN** earlier saved messages remain reachable in stable order and overlapping refreshes do not duplicate them

### Requirement: Accessible and session-safe chat interface
The inbox and active chat SHALL identify the other person, distinguish sent/received messages, display readable hour/minute timestamps without the date on message bubbles, and provide a labeled compact text composer and accessible send icon. Enter or the send icon SHALL submit; Shift+Enter SHALL insert a line break. IME composition Enter SHALL NOT submit. Loading, no conversations, no messages, recipient closed to new conversations, unavailable recipient, send pending, failed send, and history failure SHALL remain distinguishable with appropriate retry/navigation controls. At desktop and 375-pixel widths, long text SHALL wrap and every action SHALL remain keyboard/touch operable without horizontal page overflow. Closing a chat SHALL preserve confirmed messages but discard unsent draft text; normal unsent drafts and retry state SHALL remain memory-only. Account replacement, sign-out, or session loss SHALL immediately clear private chat rows, drafts, errors, and subscriptions and ignore obsolete results. Messaging failures SHALL stay isolated from the rest of the dashboard.

#### Scenario: Close chat and change account
- **WHEN** a student closes a chat with unsent text or an external account change occurs during a pending operation
- **THEN** unsent text is discarded, confirmed history remains in the database, and no old rows, draft, success state, or subscription content can populate another account

#### Scenario: Phone and keyboard operation
- **WHEN** a student opens a chat from a profile or inbox at 375 pixels or using only the keyboard
- **THEN** focus enters the Messages view, history and controls are accessible, text wraps, and Send/line-break behavior matches its visible instructions


### Requirement: Private unread highlights
The system SHALL highlight Messages navigation and unread conversation rows with incoming unread counts while the eligible participant is signed in. Read positions SHALL persist per participant and conversation, advance monotonically only to valid loaded message sequences, and remain private to the viewer. Own outgoing messages SHALL NOT count as unread. Visible latest-history viewing SHALL clear the corresponding unread position; hidden views and reading older history SHALL NOT clear unseen newer messages. Unread refresh SHALL work outside the active Messages view through protected events and visible polling. Account replacement SHALL clear obsolete private badge state.

#### Scenario: Receive and view a message
- **WHEN** a participant receives a message while viewing their dashboard
- **THEN** Messages navigation and that conversation SHALL highlight until the participant views its latest history
- **AND** reload SHALL preserve the saved read position without exposing read receipts to the sender
