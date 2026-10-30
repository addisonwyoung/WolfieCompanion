# Tasks

## 1. Secure recommendation data projection

- [x] 1.1 Write a dedicated read-only, authenticated course recommendation SQL handoff under `supabase/migrations/`; verify it validates caller eligibility and course membership, excludes the caller, deduplicates peers across sections, and returns only allowlisted public fields.
- [ ] 1.2 Add isolated SQL verification under `supabase/tests/` for authorization, private-field omission, nullable/empty profile values, and duplicate sections; run the checks only against a local test database and do not apply changes to hosted Supabase.
- [x] 1.3 Add a typed client API and response parser for the new projection; verify malformed responses and RPC failures produce a safe recommendation error without exposing raw database details.

## 2. Calculate privacy-aware similarity

- [x] 2.1 Implement the scoring utility for normalized major, distinct shared interests, academic year, and residence; verify 30/8-per-match-capped-at-40/15/15 scoring against a fixed 100-point maximum.
- [x] 2.2 Gate candidate display and shared-interest details by the returned public projection and caller's own share flags; verify private or missing factors earn no points and do not shrink the denominator.
- [x] 2.3 Cover empty public interests, no shared interests, duplicate/case-varied interest names, partial profiles, ties, and no available factors; verify candidates with unavailable factors earn zero points and remain ranked by score.

## 3. Add selected-course recommendations to the dashboard

- [x] 3.1 Add course-scoped loading, retry, and stale-response handling for the selected course; verify changing course or account never displays prior results.
- [x] 3.2 Render sorted recommendation cards with score out of 100, name, major, and only public academic year, residence, and shared interests; add mutually exclusive Classmates and People you may connect with views; verify candidates appear once and private fields are absent.
- [x] 3.3 Add accessible loading, empty, and error states; show zero points when no comparison fields are available, and verify recommendation failures do not break the existing classmate roster or change its output.

## 4. Integrate and document

- [x] 4.1 Document the new recommendation projection's relationship to existing classmate discovery and the manual migration apply/rollback steps; verify no edits are made to the existing `classmate-discovery` requirements or functions.
- [x] 4.2 Verify the client production build succeeds and review the complete dashboard flow for multiple course selections, deduplication, ranking, and privacy-gated display.
