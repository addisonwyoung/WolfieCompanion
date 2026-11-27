# Tasks

## 1. Owner-scoped review API

- [x] 1.1 Add an authenticated owner-review listing route that returns only the caller's editable review fields for all previously reviewed offerings; verify with server tests that past offerings are included and owner IDs are never returned.
- [x] 1.2 Add an owner-scoped update route that validates review fields, keeps offering and owner immutable, and re-runs existing text moderation; verify valid edits, invalid values, moderation failures, unauthenticated requests, and cross-account attempts in server tests.
- [x] 1.3 Add an owner-scoped delete route with a consistent not-found response for unowned IDs; verify only the owner can delete and a deleted row no longer conflicts with a new review for that offering.

## 2. Review management interface

- [x] 2.1 Add client API methods for listing, updating, and deleting the current user's reviews with the existing session token; verify request methods, paths, payload allowlist, and error mapping in `courseReviews` tests.
- [x] 2.2 Add a review-history view for current and past offerings with an edit form prefilled from the author's saved review; verify edits update the existing review, retain drafts after failure, and remain available when the offering is not a current enrollment in component tests.
- [x] 2.3 Add explicit delete confirmation and failure handling; verify cancel preserves the review, failed deletion leaves it visible, and successful deletion removes it from the author's history.
- [x] 2.4 Refresh the affected offering's public review rows and the author's history after successful edits or deletion; verify difficulty, weekly hours, class rating, recommendation results, and counts update, flagged reviews stay outside main summaries, the last-review empty state appears, and a new review can be submitted after deletion.

## 3. Release guidance and integration

- [x] 3.1 Document the Render-first then Vercel release sequence, existing Vercel API rewrite, and the fact that no database migration is required; verify the documented paths and endpoint behavior match the deployed configuration.
- [x] 3.2 Run the focused client and server review tests plus their builds.
- [ ] 3.3 Verify the full edit/delete/resubmit flow against a local or staging environment with two accounts to confirm ownership and aggregate refresh end to end.
