# Proposal

## Why

Oversized item cards and the inline editor make the existing Assignments & Exams agenda slow to scan and consume space needed for coursework. A compact agenda and focused modal editor will improve desktop and mobile use while preserving the completed persistent workflow.

## What Changes

- Replace individual cards and always-visible action buttons with compact rows: completion checkbox, title/course, subtle textual type badge, readable deadline, and a keyboard-operable three-dot Edit/Delete menu.
- Retain Overdue/Today/Upcoming groups, chronological ordering, all saved-course/type filters, and Pending/Completed status selection.
- Replace the inline Add/Edit form with a native `showModal()` dialog, essential fields, optional time, collapsible notes/location, and the existing completion status.
- Block background interaction and contain keyboard focus while the modal is open. Backdrop clicks do not dismiss it.
- Route Cancel, Close, and Escape through a dirty-draft check. Confirm discard inside the same dialog with Keep Editing and Discard Changes; no second modal or browser confirmation for unsaved drafts.
- Replace browser-native Delete confirmation with a styled native `showModal()` dialog identifying the item, explaining that deletion cannot be undone, and offering Cancel and a destructive Delete button. Use consistent confirmation styling, safe initial focus, Escape handling, background inertness, and logical focus restoration; only one modal is active at a time.
- Keep the modal open during pending saves and failures, retain failed drafts, announce errors inside the dialog, close after confirmed success, and restore focus with a fallback when a row disappears.
- Keep Delete confirmation open during its existing mutation and on failure, with in-dialog progress/errors and retry; close only on cancellation or confirmed success. Do not use `window.confirm()` or `window.alert()` anywhere in this feature, and do not add confirmation prompts to Save, Mark Complete, or Reopen.
- Preserve existing confirmed item deletion, authentication, account-keyed privacy, API payloads, async protections, campus-time date-only/optional-time behavior, and all persistence/authorization constraints.
- Add focused unit/component regressions and real-browser desktop/375px checks; no reminder frequency controls, email notifications, backend changes, or new runtime dependencies.

## Capabilities

### New Capabilities

- `academic-agenda-interface`: Compact, accessible presentation and modal editing of existing academic items, including action menus, unsaved-draft confirmation, save/error feedback, focus lifecycle, and responsive behavior.

### Modified Capabilities

None of the current main capabilities change. `academic-items` currently exists only in the completed but unarchived `add-assignments-and-exams` change, not in `openspec/specs`; this proposal does not invent a MODIFIED delta against a missing main capability. The new presentation capability supplements that baseline rather than duplicating storage requirements. Its explicit discard confirmation refines the earlier immediate-Cancel UI behavior.

## Impact

- Production frontend: `client/src/AcademicPlanner.tsx`, scoped `client/src/App.css` rules, new `client/src/AcademicItemDialog.tsx`, and a small `client/src/AcademicDeleteDialog.tsx`. Share confirmation styling/lifecycle conventions without introducing a modal framework; keep small menu/presentation helpers local unless extraction improves clarity.
- Tests/docs: existing academic planner and account component tests, focused dialog/presentation tests as needed, local browser fixture/script, and `docs/academic-items.md`.
- Preserve `academicItems.ts`, `useAcademicItems.ts`, account/course UUID adapters, the account-keyed workspace boundary, Supabase RLS/migrations/schema, and server code. Read-only review and unchanged regression coverage protect these boundaries.
- No migration is generated or executed. No hosted Supabase access is needed for this change. The existing manual migration/deployment prerequisites remain separate.
