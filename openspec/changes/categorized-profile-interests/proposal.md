# Proposal

## Why

The current profile editor asks students to type comma-separated interests, which makes selection inconsistent and gives no quick way to browse common activities. Categorized selectable options make profile editing faster and give classmates a consistent set of interest labels.

## What Changes

- Replace the free-text interests textarea with searchable, categorized options that users can select and deselect individually.
- Populate the requested sports & fitness, games & entertainment, technology & computing, arts, and food options; typing filters these options for selection.
- Limit selections to five across all categories, show a live counter, and prevent further selections at the limit while allowing deselection.
- Persist only selected interest names as strings in the existing `profiles.interests` text array, and restore those selections when loading or editing a profile.
- Keep the existing database table and column unchanged; no Supabase changes are part of this work.

## Capabilities

### New Capabilities
- `student-profile`: Define categorized interest selection and persistence behavior within the editable student profile.

### Modified Capabilities

## Impact

- `client/src/Profile.tsx` and profile-related styles for the selector and count.
- `client/src/account.ts` for client-side interest validation and normalization as needed.
- OpenSpec student profile requirements. Existing Supabase profile storage remains `profiles.interests` as `text[]` containing interest-name strings; no database, policy, RPC, or migration changes are requested.
