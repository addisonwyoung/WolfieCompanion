# Design

## Context

See proposal.md for motivation and specs/academic-agenda-interface/spec.md for the interaction contract. `AcademicPlanner.tsx` currently owns filters, a full inline draft form, padded item cards, visible Edit/Complete/Delete buttons, and browser confirmations. `useAcademicItems` owns loads and guarded server-confirmed mutations; failures are currently announced outside the editor. `App.tsx` retains the planner across navigation but mounts it beneath an account-keyed workspace. Shared CSS sets 44px control heights and visible keyboard focus. The client has React/TypeScript, no dialog/menu library, Vitest/Testing Library, and an installed-Chrome loopback browser fixture.

The completed `add-assignments-and-exams` change is the implemented baseline. Its academic-items delta has not yet become a main spec. This change adds a distinct presentation contract, retaining storage/privacy/date requirements and refining Cancel into a discard request when dirty. It neither rewrites that completed change nor creates a MODIFIED delta against a nonexistent main spec. When finalizing the changes later, establish the baseline academic-items spec first and retain this explicit UI refinement; no archive or spec sync is part of this planning request.

## Goals / Non-Goals

**Goals:** Improve scanning and keyboard/mobile editing using native browser modality and a small, testable interaction state model. Preserve the existing API, mutation sequencing, account teardown, validation, date grouping, and CRUD behavior.

**Non-Goals:** Adapter/hook/authentication refactors, SQL or RLS changes, hosted database work, new dependencies, section fields, calendar integration, optimistic persistence, custom DST handling, reminder frequency controls, or email notifications. No general-purpose design-system or modal framework is introduced.

## Decisions

### 1. Restrict production edits to presentation

Update `client/src/AcademicPlanner.tsx` and scoped rules in `client/src/App.css`; extract the editor to new `client/src/AcademicItemDialog.tsx` and use a small `client/src/AcademicDeleteDialog.tsx` for item deletion confirmation. Share CSS and explicit lifecycle conventions between confirmation views without creating a general-purpose modal framework. Keep the small row menu and date formatting local to the planner unless implementation size justifies a presentation-only extraction. Update `client/test/academicPlanner.test.tsx`, `client/test/account.test.tsx`, focused dialog tests if separated, `client/test/academic-browser.mjs` and its local fixture, and `docs/academic-items.md`.

Leave `academicItems.ts`, `useAcademicItems.ts`, `account.ts`, `useAccount.ts`, account-keyed `App.tsx` ownership, server code, migration files, and SQL policies unchanged. Reuse `normalizeItem`, `compareItems`, `itemGroup`, `state.mutate`, `busy`, `actionFailed`, and `message`. Frontend component callbacks adapt these existing contracts; they do not change them. Reusing the established persistence boundary is smaller and safer than rebuilding async state around the dialog.

### 2. Compact rows and readable dates

Keep semantic lists within named group sections. Use a small checkbox, flexible title/course column, type badge, deadline, and trailing actions button; use separators or one shared group surface instead of independent padded cards. Show location as secondary metadata when present and full notes in the editor. Type badges always include text; overdue styling is accompanied by the group label, not color alone. Retain burgundy primary actions and existing focus styling. Visually small checkbox/ellipsis icons keep an approximately 44px interactive target.

On narrow screens, metadata wraps beneath the title while checkbox/menu remain reachable. Long titles wrap rather than covering controls. Bound menus to the viewport, repositioning upward or inward when near an edge. Scope CSS so global full-width input and flex-button rules do not enlarge row checkboxes or compress menu labels.

Render dates with a stable human-readable month/day/year representation and optional 12-hour time, with an explicit America/New_York label for timed entries. Format stored calendar components directly (or use a UTC-only display formatter consistently for date-only formatting), never the browser's local interpretation of `new Date(dateString)`. Present stored campus wall time without shifting it through the browser zone. Display changes never feed back into grouping, sorting, or payloads. Existing campus-clock refresh remains authoritative; no new timezone-conversion dependency is needed.

Completion checkboxes are controlled by persisted `completed_at` and call the existing partial-completion operation. Do not optimistically change them. Keep the existing global mutation guard; unrelated filtering can remain usable when no modal is open. If an update removes the focused row, choose the next visible row checkbox, an available group heading, then Add item as fallbacks.

### 3. Small action menu with complete keyboard semantics

Use a button named `Actions for <title>`, `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls`, plus a menu of Edit/Delete menuitems. Keep only one menu ID in local state. Enter/Space opens to Edit; arrow keys wrap between actions, Home/End jump to endpoints, and activation uses Enter/Space. Escape returns to the trigger. Tab/Shift+Tab dismiss and continue the logical document sequence rather than trapping focus. Outside-pointer dismissal does not run either action. Handle menu keys locally so Escape never also dismisses an editor opened from that menu.

Close the menu before opening Edit or Delete and record the persistent row actions button as the dialog's return target, not the transient menuitem. Edit opens the editor; Delete opens the styled native confirmation described below, preserving the existing delete mutation and server-confirmed removal. No `window.confirm()` or `window.alert()` remains in this feature. Save, Mark Complete, and Reopen run directly through their existing validation/mutation flow without confirmation prompts.

### 3a. Consistent confirmation dialogs and Delete lifecycle

Coordinate editor versus delete confirmation with mutually exclusive presentation state: at most one native dialog is open. The Delete dialog is entered only from a row's actions after its menu closes, never stacked over an Add/Edit dialog. Unsaved-draft confirmation remains a content view inside the existing Add/Edit dialog; it does not create a second dialog.

Use the same scoped dialog surface, backdrop, heading/description spacing, footer alignment, focus styles, and destructive-action treatment for Delete and Discard Changes. Keep safe actions neutral and visible. Confirmations have accessible headings and associated descriptions; use native `<dialog>` with appropriate confirmation semantics (for example, `role="alertdialog"` for the short confirmation view), `aria-labelledby`, and `aria-describedby`. Set initial focus on Cancel for Delete and Keep Editing for unsaved changes. Both contain Tab/Shift+Tab, block background pointer/keyboard interaction, ignore backdrop clicks, and share viewport-bounded scrolling and cleanup conventions.

Delete copy identifies the selected title (and course when useful) and explicitly says deletion cannot be undone. Show Cancel and a clearly labeled destructive Delete button. Do not put confirmation actions in an auto-submitting form or use `method="dialog"`; pressing Enter on the initially focused Cancel must cancel, not delete. Cancel and Escape before a request or after a failed request close the confirmation without issuing another mutation and return focus to the row's actions button, or a logical visible fallback.

Only explicit activation of Delete calls the existing `api.remove(id)` through `state.mutate`, using the selected item ID without modifying the adapter/hook. While pending, keep the dialog open, announce deletion progress within it, disable repeat Delete and Cancel/dismissal, and prevent Escape. This does not imply that a committed server request can be canceled. On failure, preserve the row and item context, keep the confirmation open with an announced in-dialog error, and re-enable Cancel and Delete for retry. Do not surface unrelated old mutation errors as current deletion errors. On confirmed success, remove only the item through the existing hook, close the dialog, announce success, and focus the next sensible row control/group heading or Add item. Session/account teardown overrides every delete state without prompting or restoring previous-account focus.

A plain disclosure could save code, but the requested action-menu contract warrants the focused keyboard/ARIA behavior rather than styling a list with incomplete menu roles.

### 4. Native modal and same-dialog confirmation

Open a native `<dialog>` with `showModal()` after mount, guarding against duplicate open calls under React Strict Mode. Do not substitute the `open` attribute, a CSS overlay, or an application-wide portal. Browser modality supplies background inertness and top-layer presentation while the React component remains inside its current account lifetime. Label it with its visible title. Focus Title on entry; use a visible, named Close icon and Cancel button.

Keep title/course/type/date and optional campus time immediately available, plus existing completion status. Put notes/location in native `<details>/<summary>` named Optional details. Start it expanded when those values exist, and open it before focusing a hidden validation error. Collapsing is presentation state and never clears values. Use an ordinary submit handler, not `method="dialog"`, so validation or failed persistence cannot auto-close the editor.

Use one modal with the following content states; keep the draft outside conditional confirmation markup so switching views cannot erase it:

```text
closed --> editing clean/dirty --> saving --> closed (confirmed success)
                  |                  |
                  |                  +--> editing (failure; same draft)
                  v
           confirm discard --> editing (Keep Editing or Escape)
                  |
                  +--> closed (Discard Changes)

account/session teardown --> closed from every state, without prompting
```

Cancel, Close, and native `cancel` events (Escape/platform close requests) all use the same request-dismiss function. Prevent native cancellation first. Clean closes; dirty replaces the editor content with a named discard confirmation inside the same dialog. Only Keep Editing and Discard Changes are active in this view. Default focus is Keep Editing; Escape means Keep Editing. Restore disclosure state, values, and an appropriate editor focus target on return. Backdrop clicks are ignored entirely: do not attach click-outside dismissal or enable light dismiss.

Compute dirtiness from editable field values against an opening snapshot, excluding item ID, generated completion timestamp, errors, focus, and disclosure state. Compare completion as a boolean and treat equivalent optional blanks/time precision consistently. Preserve an existing completion timestamp if the final completed state has not changed; only a genuinely newly completed draft needs a new timestamp. Do not run full validation to decide whether an incomplete draft is dirty. Reverting every value restores a clean state.

For short mobile viewports, give the dialog a viewport-bounded width and height, an internally scrolling body, reachable header/footer, and background scroll locking with cleanup. No elaborate animation is required. Native modality is preferred over a custom focus-trap library; actual browser tests must verify Tab/Shift+Tab containment, including the disclosure and confirmation views.

### 5. Save, error, and focus lifecycle

Pass submission through `normalizeItem`, current saved-course ownership selection, and the existing `state.mutate` callback. While saving, disable inputs, Save, Cancel, and Close, expose progress within the modal, and ignore Escape. Duplicate invocations remain guarded by the existing hook. Do not show discard confirmation during a pending write; it could imply the write was canceled when it was not.

Keep validation and server errors visible and announced inside the dialog; an outside `role="alert"` is insufficient while the rest of the document is inert. Associate field errors with controls and focus the first invalid field after expanding optional details if necessary. A presentation-level submission attempt distinguishes current save failures from unrelated old row-action messages. False/stale mutation results never trigger success closure. On failure keep all fields and allow retry; on success close and announce the existing success status in the agenda.

Track the opener separately from draft values. After close, focus Add item for creation, or the original row actions button for editing if still connected and visible. If a course/type/status change removed it, use a visible group heading or Add item. Delayed focus callbacks must be invalidated on unmount; never focus a hidden, disconnected, or previous-account element.

Auth-driven teardown takes precedence over dirty confirmation, saving, delete confirmation, and deletion. The active native dialog and any menu disappear when the account-keyed subtree unmounts, releasing scroll locks/inertness without a prompt. No draft moves to localStorage, URL state, or an application-global portal. Existing request-generation guards handle stale responses. Normal background navigation and the Sign out button are inert while either modal is open; tests simulate external sign-out/session events to validate forced teardown without weakening modality.

### 6. Focused verification

Component tests cover observable keyboard/menu behavior, completion, dirty/revert/discard flows, optional fields, validation, async outcomes, payload equivalence, focus fallbacks, and account teardown. Add Delete tests for item/warning text, accessible heading/description, initial Cancel focus, Cancel/Escape/no-request behavior, pending duplicate/dismissal prevention, in-dialog failure/retry, successful single-item removal, and focus restoration. Assert only one modal is active and that ordinary Save/Mark Complete/Reopen add no confirmation. Make any call to `window.confirm()` or `window.alert()` fail the feature tests. Keep existing date/API/hook regressions intact. Use minimal dialog-method stubs only if the test DOM requires them; they cannot prove native inertness or focus trapping.

Extend the existing installed-Chrome fixture at desktop (1280px) and 375px, with a short-height/expanded-details case, long titles, and menus near viewport edges. Browser checks prove background pointer/keyboard isolation, forward/reverse focus containment, ignored backdrop clicks, modal/confirmation Escape behavior, menu keys, reachable controls, clean/dirty close behavior, and logical restoration. Include both confirmation experiences: safe initial focus, consistent layout, no nested active modal, deletion cancellation, pending deletion, failure with the row retained, explicit retry, and successful restoration after removal. Synthetic delayed/failing API responses in the local fixture exercise save/delete outcomes without hosted requests. Fail the browser check on unexpected JavaScript confirm/alert dialogs. Keep fixture persistence clearly separate from Supabase acceptance.

References informing the accessibility contract: [native dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), [modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), and [menu-button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/).

## Risks / Trade-offs

- [Mock DOM tests falsely suggest native modality works] -> Require real-browser focus, inertness, backdrop, and Escape checks; do not accept stubs as browser evidence.
- [Delete confirmation closes before outcome or stacks over the editor] -> Use mutually exclusive modal state, retain context/errors until success or explicit cancellation, and verify one active modal throughout failure/retry and account teardown.
- [Saving changes the current filter membership] -> Restore focus using a visible fallback rather than a removed menuitem/row.
- [Dirty comparison causes false prompts or loses optional details] -> Compare editable snapshots independent of validation/timestamps; test edits, reversions, optional blanks, and disclosure toggles.
- [Background auth event arrives during a save] -> Retain account-keyed component ownership and mutation guards; invalidate delayed focus work on teardown.
- [Shared form CSS makes compact controls unusable] -> Scope checkbox/menu/modal overrides and verify desktop/375px plus short-height overflow.
- [Existing parent-navigation tests expect inline editing] -> Replace those expectations with modal blocking and externally driven auth teardown, keeping privacy assertions.

## Migration Plan

No database migration or hosted operation is part of this change. Implement the presentation and focused tests, then run the client suite, lint, build, and local browser checks. Review the diff to confirm adapter/hook/auth/backend/migration files are unchanged. Deploy through the existing frontend release process when separately requested; hosted storage readiness remains the prerequisite established by the original feature. Roll back only the frontend presentation release, retaining all stored academic items and constraints.
