## ADDED Requirements

### Requirement: Moderate review text before persistence
The application SHALL send authenticated review submissions to the Express server for moderation before storing them. The server SHALL use OpenAI's `omni-moderation-latest` endpoint and SHALL send only review text. Before the API request, the server SHALL block whole-term matches from the server-only `COURSE_REVIEW_HARD_BLOCK_TERMS` setting without matching substrings of unrelated words. Category-specific blocking thresholds SHALL be: hate and hate/threatening 0.25; harassment/threatening 0.25; sexual 0.35; sexual/minors 0.15; self-harm and violence categories 0.25–0.35. API overall-flagged results, moderate category scores, or lower-confidence harassment signals SHALL be stored as `flagged`; other reviews SHALL be stored as `appropriate`. Flagged reviews remain readable in a separate section and do not affect aggregates. The system does not claim to reliably detect political content or verify factual accusations. If the key is missing, moderation is unavailable, or its response is invalid, the submission SHALL fail without saving and retain the user's draft. Empty written reviews SHALL skip moderation.

The server SHALL moderate the complete review and sentence/clause fragments, including overlapping neighboring fragments, and SHALL aggregate the strongest result. A review that expresses a wish for serious illness, death, betrayal, or abandonment directed at a professor or their family SHALL be stored as `flagged`, unless an explicit hard-block term, a separate high-risk category, or a direct threat requires blocking. A violence score caused solely by the recognized wish SHALL NOT by itself escalate the review from flagged to blocked.

#### Scenario: Publish appropriate criticism
- **WHEN** an eligible student submits a relevant negative review or blunt criticism without targeted abuse
- **THEN** the server stores it as appropriate and it appears in the main review list

#### Scenario: Preserve uncertain content for review
- **WHEN** the moderation model flags a review without a configured blocking-level severe score
- **THEN** the server stores it as flagged and the client places it in a separately expandable flagged section

#### Scenario: Detect targeted wishes inside a longer review

- **WHEN** a review mixes positive wording with a wish that a professor or their family experience serious illness, death, betrayal, or abandonment
- **THEN** clause-level moderation and the targeted-misfortune rule classify it as flagged, while keeping it available in the separate flagged section

#### Scenario: Preserve ordinary positive wishes and criticism

- **WHEN** a review wishes a professor well or criticizes their teaching without a targeted serious-misfortune wish or other moderation signal
- **THEN** the targeted-misfortune rule does not flag it

#### Scenario: Block clear severe abuse
- **WHEN** the model identifies high-confidence severe hate, sexual abuse, or a threat/encouragement of violence or self-harm
- **THEN** the server rejects the submission and does not save its text

#### Scenario: Block explicit terms without substring matches
- **WHEN** a review contains a listed profanity or slur as a whole term, including common separator or leetspeak obfuscation
- **THEN** the server rejects the submission before persistence
- **AND** an unrelated word that merely contains the same letters is not blocked by the word list

#### Scenario: Moderation API unavailable or output invalid
- **WHEN** the API key is missing, OpenAI is unavailable or rate-limits the request, or the response is invalid
- **THEN** the server does not save the review and the client retains the draft with a retry message

### Requirement: Prevent moderation bypass
The client SHALL submit reviews only through the authenticated Express endpoint. The endpoint SHALL validate the Supabase session and student eligibility, derive the reviewer ID from that session, enforce the one-review-per-offering rule, and write through the server-only Supabase service role. The migration SHALL revoke direct authenticated inserts while preserving anonymous read projection behavior.

#### Scenario: Reject unauthenticated or ineligible submitter
- **WHEN** a request lacks a valid eligible student session
- **THEN** no model request or review write occurs

#### Scenario: Reject direct client insert
- **WHEN** an authenticated browser attempts to insert directly into `course_reviews`
- **THEN** database privileges reject the insert

### Requirement: Keep flagged reviews out of summaries
The public review projection SHALL include moderation status without exposing reviewer identity. Flagged reviews SHALL not affect average hours, difficulty, or the main review count and SHALL be displayed only in a clearly labeled separate section.

#### Scenario: Summarize only appropriate reviews
- **WHEN** an offering has both appropriate and flagged reviews
- **THEN** summary averages and the main review count use appropriate reviews only, while flagged reviews remain accessible separately
