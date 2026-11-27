# Course evaluation review management

Users can review their own submissions from the course evaluations screen, including reviews for past offerings. The API checks the signed-in Supabase user and scopes list, update, and delete operations to that user's `course_reviews` rows. Updates change only review fields and run written text through the existing moderation step. Deletion removes the row, so the existing one-review-per-user/offering constraint permits a new submission.

The public course review view reads from the existing `course_reviews_public` view. Its aggregates are calculated from the rows returned by that view, excluding flagged rows from the main summaries. A successful edit or deletion refreshes both the selected offering's public rows and the current user's review history.

## API

- `GET /api/course-reviews/mine` returns the signed-in user's review fields and offering IDs. It does not return account IDs.
- `PATCH /api/course-reviews/:reviewId` updates the owner's review fields. It returns `404` for a missing review or one owned by another account, `422` for invalid or blocked content, and `503` if moderation is unavailable.
- `DELETE /api/course-reviews/:reviewId` deletes the owner's row and returns `204`. Missing and unowned IDs both return `404`.

All three management routes require a valid Supabase bearer token and an eligible account. No schema change or database migration is needed: the existing `course_reviews` table, owner ID, uniqueness constraint, and public view support these operations.

## Release order

1. Deploy the backend to Render first. Wait until the new management routes are live at `https://wolfiecompanion.onrender.com`.
2. Deploy the client to Vercel. The current `client/vercel.json` rewrite sends `/api/:path*` to `https://wolfiecompanion.onrender.com/api/:path*`, so the client uses the updated Render API without a new rewrite.
3. Sign in with two eligible accounts in a local or staging setup. Confirm each account sees only its own history, can edit and delete its own review, cannot modify another account's review, sees updated course summaries, and can submit again after deletion.

Do not run a Supabase migration for this feature.
