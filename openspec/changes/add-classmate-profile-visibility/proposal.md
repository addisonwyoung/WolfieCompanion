# Proposal

## Why

Classmate cards currently stop at name and major, so students cannot learn more before connecting. Clickable profiles with student-controlled sharing provide that next step and preserve a stable identity for future direct messaging.

## What Changes

- Open a read-only classmate profile from a selected class roster and return to that roster.
- Always share name and major with eligible classmates; retain the existing unset-major placeholder rather than requiring every student to enter a major.
- Let profile owners independently share year of study, interests, residence status, and profile picture. All optional sharing defaults off for existing and new accounts.
- Enforce field visibility and shared-course eligibility on the server, including picture access.
- Keep the existing student UUID as the future messaging recipient identity. Direct messaging, conversations, and message buttons are outside this change.
- Supersede the current spec's blanket prohibition on peer details and its statement that visibility controls are unavailable.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `classmate-discovery`: Clickable profiles, owner-controlled optional fields, authorized profile/picture retrieval, and accurate visibility explanations.

## Impact

- React: `CourseBrowser.tsx`, `App.tsx`, `Profile.tsx`, account adapters/state, classmate adapters, and profile detail UI/styles.
- Supabase: additive migration for owner-managed visibility flags and restricted profile lookup; private avatar delivery through the existing Node server with authenticated authorization.
- Tests: client profile/discovery lifecycle and controls, local SQL authorization/projection checks, and server avatar access tests.
- Documentation: `docs/classmate-discovery.md` and account setup guidance. Existing discovery RPC shape stays compatible; direct profile/enrollment access and peer writes remain denied. Shared database changes require owner review and manual application under existing project practice.
