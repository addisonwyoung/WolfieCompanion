# Design

## Context

Course reviews are stored in `course_reviews` with a UUID, offering ID, owner ID, review fields, and moderation status. Public results come from `course_reviews_public`, which omits owner identity. The browser submits through `/api/course-reviews`; the Render Express router authenticates with Supabase and uses its server-only service role for writes. Authenticated browser roles have no direct update or delete grant. The Vercel rewrite already forwards `/api/*` to the Render service.

## Goals / Non-Goals

**Goals:** Let an author find and manage reviews from old offerings, preserve anonymity and moderation, keep all review summaries in sync, and support another submission after deletion.

**Non-Goals:** Change offering eligibility for first submissions, change public review visibility, add database columns, or deploy changes as part of this proposal.

## Decisions

### Keep owner operations in the Render API

Add authenticated `GET /api/course-reviews/mine`, `PATCH /api/course-reviews/:reviewId`, and `DELETE /api/course-reviews/:reviewId` routes. The `mine` route returns only the caller's review ID, offering ID, editable fields, and moderation status. It never returns the owner ID. Every route validates the Supabase bearer token and account eligibility; every lookup or mutation also filters on the authenticated user's ID. Update and delete responses for missing or unowned IDs use the same not-found behavior.

The update route accepts only weekly hours, difficulty, class rating, recommendation, and review text. It rejects or ignores attempts to change the review ID, owner, or offering. It validates the same field bounds as initial submission and re-runs existing text moderation before writing. The update is conditional on both review ID and owner ID. Deletion uses the same ownership filter and does not require a current enrollment: a previous author must be able to manage a past review.

Use the Render service role for these operations rather than granting browser roles update/delete access. The existing schema already contains the required values and the unique `(user_id, offering_id)` constraint. The existing Vercel rewrite continues to route these endpoints, so no database migration or Vercel rewrite change is needed.

**Alternative considered:** Direct Supabase browser updates/deletes under RLS. This would create another moderation path for edits and expose more database mutation capability to the browser, so owner operations stay server-side.

### Refresh from persisted rows after mutations

After a successful edit or delete, the client reloads the author's review list and the affected offering's public review rows. It derives averages, recommendation results, and counts from those refreshed rows using the current rule that flagged reviews appear separately and do not affect the main summaries. Deletion removes the offering from the author's active review list; the existing submit flow then becomes available again. The database uniqueness constraint remains the final guard against concurrent duplicate submissions.

**Alternative considered:** Adjust averages locally from the previous values. Re-fetching keeps counts and aggregates correct when moderation status changes, a response is retried, or another student changes the offering's reviews at the same time.

### Keep the deployed frontend and backend compatible during release

Deploy the additive Render routes first; the current Vercel client will continue to use the existing POST endpoint. After Render is healthy, deploy the Vercel UI that uses the new routes. No Supabase migration or database change is planned. If rollback is needed, roll back Vercel first; the additive Render routes can remain deployed or be rolled back after the old client is restored.

**Alternative considered:** Deploy both at once. Separate deploys preserve a working older client while the backend update is checked.

### Confirm permanent deletion

Require a clear confirmation in the UI before calling DELETE. If the user cancels, keep the saved review and editor state unchanged. If deletion fails, keep the review visible and report the error; after success, refresh the review list and summaries.

## Risks / Trade-offs

- **A service-role operation bypasses RLS** → Require a validated bearer token, derive the owner only from that token, and include both review ID and owner ID in every update/delete predicate. Add cross-account API tests.
- **Editing text may change moderation status** → Reuse the current moderation service and refresh both the owner's row and the public offering projection after saving.
- **A review history could reveal private submission content if scoped incorrectly** → Return only the authenticated caller's rows and test that a different account cannot list, edit, or delete them.
- **The Render backend could be unavailable during release** → Deploy and verify backend routes before deploying the Vercel client; retain existing draft and saved-review state on request errors.

## Migration Plan

1. Add the owner-scoped routes and backend tests. Keep the existing POST route unchanged.
2. Deploy the backend to Render and verify health plus authenticated owner read/update/delete behavior.
3. Deploy the client to Vercel. Its existing `/api/:path*` rewrite already points to Render.
4. Verify an older published review can be edited and deleted, displayed averages and counts refresh, and a replacement review can be submitted.
5. If the client release needs rollback, restore the Vercel deployment first. The database has no migration to roll back; the backend routes are additive.
