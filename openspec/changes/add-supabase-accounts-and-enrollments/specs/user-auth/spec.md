# Spec Delta

## Purpose

Give eligible students a persistent Google-backed identity and securely restore their personal Wolfie Companion workspace across visits.

## ADDED Requirements

### Requirement: Google account creation and eligibility
The system SHALL use Supabase Auth with Google for both first-time account creation and returning sign-in. Application data access SHALL require a provider-verified email whose normalized domain is exactly `stonybrook.edu`. Domain hints and browser checks SHALL NOT be the authorization boundary. The system SHALL NOT offer password registration in this change.

#### Scenario: First eligible sign-in
- **WHEN** a student completes Google sign-in with a verified Stony Brook email
- **THEN** an account and exactly one associated profile are available without a separate registration form

#### Scenario: Returning student
- **WHEN** the same Google identity signs in again
- **THEN** the system uses the existing account and preserves its profile and classes

#### Scenario: Ineligible or canceled sign-in
- **WHEN** Google sign-in is canceled, fails, or returns an unverified or non-Stony Brook email
- **THEN** the interface explains the outcome, allows retry, and grants no protected application-data access

### Requirement: Session lifecycle and isolation
The application SHALL restore valid sessions on reload, handle the OAuth return, refresh sessions, and provide sign-out. While session resolution is pending it SHALL show a loading state without sample or previous-user personal data. On sign-out, expiration, or account change it SHALL clear personal state and reject stale in-flight responses. Unauthenticated access and direct attempts to read or mutate another user's profile, enrollments, or avatar SHALL be denied by Supabase authorization policies.

#### Scenario: Reload and sign out
- **WHEN** a signed-in student reloads and later signs out
- **THEN** the valid session is first restored, and sign-out subsequently returns to sign-in and clears personal state

#### Scenario: Account switch during loading
- **WHEN** account A signs out and account B signs in while A's requests are pending
- **THEN** no late result or cached personal data from A appears in B's workspace

#### Scenario: Direct unauthorized access
- **WHEN** an anonymous, ineligible, or different user's client directly requests protected rows or avatar objects
- **THEN** the system denies access independently of visible UI controls
