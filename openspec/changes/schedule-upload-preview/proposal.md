# Proposal

## Why

Students should be able to test schedule extraction inside Wolfie Companion instead of running a terminal command. The real calendar output demonstrated usable course detection but incorrect sections and a building mistaken for a class; the preview must address those errors and let students correct results.

## What Changes

- Add an Import schedule area beside Your courses, with PNG/JPEG selection, image preview, and an explicit choice of SOLAR class list or weekly calendar.
- Add a local-development upload endpoint that reuses the existing Google Vision adapter and parser to return draft course codes and section labels.
- Improve parsing of attached sections such as `CSE 310-01`, prevent meeting times from becoming sections, and suppress location words such as `BLDG` as course departments.
- Show an editable preview containing course code and section only, with add/remove rows, review warnings, loading, empty, failure, and retry states.
- Keep extraction, images, and draft edits temporary. When integrated with add-supabase-accounts-and-enrollments, explicit reviewed confirmation saves only course/section pairs to the signed-in account.

## Capabilities

### New Capabilities

- `schedule-upload-preview`: Local browser upload, course/section extraction, and editable temporary preview, including regression behavior for the observed parsing errors.

### Modified Capabilities

None within this change. The companion add-supabase-accounts-and-enrollments change modifies prototype-dashboard and owns account-backed confirmation; this feature keeps extraction/draft state separate from saved membership. The unarchived `google-vision-schedule-ocr` change remains a prerequisite and is not rewritten by this proposal.

## Impact

- Client: new import component and styles, mounted in the existing courses area; existing Vite `/api` proxy supports the request path.
- Server: opt-in local upload route, bounded image validation, provider injection, parser improvements, and regression/API tests. Reuse the installed `@google-cloud/vision`; account-backed class confirmation is supplied by the companion account change, while screenshot storage remains unnecessary.
- Privacy/cost: images are sent to Google only after explicit extraction and kept in application memory; no automatic image/raw-text storage. The paid route is disabled by default and restricted to a loopback development server.
- Existing OCR experiment output remains compatible. Missing titles and semester/year do not block the code/section preview. Live user output demonstrates successful cloud access, superseding the earlier billing blocker as evidence; extraction accuracy still requires validation.
