# Design

## Context

See proposal.md for motivation. The current `Profile` editor holds interests as a comma-separated draft string, splits it on save, and calls `normalizeProfile`. The existing account API already loads and writes `profiles.interests` as `string[]`. The main OpenSpec inventory has no student-profile capability yet; an in-flight account setup change contains the initial student-profile persistence requirements.

## Goals / Non-Goals

**Goals:**
- Keep selection state in the profile draft and use the existing save/load path.
- Make the five-item limit consistent in the UI and client-side profile normalization.
- Preserve previously stored interest strings in the editor so students can review and remove values that do not match the new catalog.

**Non-Goals:**
- Change Supabase schema, policies, functions, or migrations.
- Add free-form interest creation, category persistence, or new profile-sharing behavior.

## Decisions

- Define the category catalog as client-side data and derive the displayed options and search results from it. This keeps the category labels out of persistence and makes the initial list straightforward to maintain.
- Keep selected interest names as the profile draft's `string[]`; save through the existing `saveProfile` path. Avoid a separate category-aware storage model because downstream profile display already consumes plain strings.
- Use a search input to filter available catalog options while rendering grouped selectable controls. Preserve the query only during the editing session; it is not profile data.
- Enforce the cap when toggling selections and in `normalizeProfile`, so non-UI calls cannot save more than five. At the limit, disable unselected options but keep selected options enabled for deselection.
- Treat previously saved names absent from the catalog as selected legacy values. Display them so they can be removed, count them toward the limit, and prevent new custom values from being created. When more than five legacy values exist, require trimming before save.
- Retain case-insensitive deduplication and normalized selected strings; do not include category names in the saved list.

## Risks / Trade-offs

- [Existing profiles may contain many arbitrary interests] → Keep all legacy values visible and selected during editing, prevent adding more while over the cap, and require the user to remove values before saving.
- [A search filter can hide options that are already selected] → Keep a visible selected summary/removal control independent of filtered category results.
- [Older clients may still write more than five values] → Enforce the five-value limit in the current client normalization and validate the draft before persistence; schema changes are outside this change.

## Migration Plan

No database migration is needed. Deploy the client change; existing strings are loaded as before and handled as legacy selections when they are not catalog entries. Roll back by restoring the previous client bundle; the stored column format remains compatible.
