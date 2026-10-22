# Tasks

## 1. Build the categorized interest selector

- [x] 1.1 Add the five requested categories and complete option catalog to the profile editor, and verify every option appears under the correct category.
- [x] 1.2 Replace the comma-separated textarea with a search field and individually selectable options; verify typing filters matching options without selecting or creating an interest.
- [x] 1.3 Add the cross-category selection counter and enforce the five-item limit while retaining deselection; verify a sixth option cannot be selected and the count updates after deselection.
- [x] 1.4 Add a visible selected-interest summary that supports removing selections hidden by the active search; verify all selected interests remain reviewable regardless of filtering.

## 2. Preserve profile data behavior

- [x] 2.1 Update client-side normalization and save validation to accept at most five selected names and retain case-insensitive deduplication; verify invalid over-limit drafts are rejected before persistence.
- [x] 2.2 Initialize selection state from loaded profile values and restore it when editing begins; verify save, page reload, and reopening edit retain selected names in `profiles.interests` as strings.
- [x] 2.3 Keep unrecognized existing values visible as removable legacy selections and count them toward the limit; verify over-limit legacy values can be pruned and cannot be newly added through search.
- [x] 2.4 Confirm the existing profiles table and text-array column require no schema, policy, function, or migration edits.

