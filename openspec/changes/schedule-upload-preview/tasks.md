# Tasks

## 1. Course and section parser corrections

- [x] 1.1 Add synthetic regression fixtures reproducing the five supplied course codes, attached sections, multiline lecture/time text, and room references; verify fixtures contain no private screenshot or identifying text.
- [x] 1.2 Extract attached section labels with leading zeros and reject times as sections, handling explicit labels and conflicts conservatively; verify tests return CSE 310/01, COM 120/30, CSE 351/01, CSE 416/03, and AMS 315/01 and never time digits.
- [x] 1.3 Filter common location words consistently and preserve repeated-pair deduplication, distinct sections/components, and the existing CLI schema; verify regression tests exclude BLDG 120 while original OCR parser tests still pass.
- [x] 1.4 Update server OCR documentation with attached-section support, conflict behavior, and remaining syntactic-matching limitations; verify documented examples match the regression fixtures.

## 2. Local upload endpoint

- [x] 2.1 Factor reusable bounded image-byte validation from the CLI and add route-specific raw PNG/JPEG handling for POST /api/schedule-preview with required layout; verify offline endpoint tests reject bad signatures, unsupported content types, missing layout, empty bodies, and oversized payloads before provider calls, preserving the 8-KB JSON routes.
- [x] 2.2 Add explicit development opt-in, production denial, loopback binding/socket checks, exact allowed local Origin, and expected request-header checks; verify tests cover disabled/production/unrelated-origin requests with zero provider calls and permitted local Vite-proxied requests.
- [x] 2.3 Inject the provider, project extraction to code/section rows with row-associated review warnings and relevant empty-result messages, and enforce one in-flight request with safe errors; verify mocked tests cover distinct sections, no-text/no-course responses, busy rejection, timeout/failure recovery, and absence of raw text or persistence.
- [x] 2.4 Document endpoint configuration, local origin overrides, cloud prerequisites, two-terminal startup, and the development-only boundary in server/README.md; verify a local endpoint smoke test works through the existing Vite proxy with the documented settings.

## 3. Browser upload and editable preview

- [x] 3.1 Add the expandable Import schedule component beside Your courses with labeled image/layout inputs, local preview, explicit extraction, and temporary-processing notice; verify component tests cover valid selection, undecodable/invalid/oversized rejection, and no request until Extract classes is pressed. Add client test tooling if needed and verify it runs offline.
- [x] 3.2 Implement code/section-only editable rows, add/remove controls, row warnings, and Clear/Close without automatic enrollment writes; the companion account change supplies explicit confirmation; verify tests show edits remain local, missing titles/terms do not block preview, and sample courses/classmates are unchanged.
- [x] 3.3 Implement loading/error/empty/retry states, duplicate-submit prevention, request invalidation on image/layout changes, and object-URL cleanup; verify asynchronous tests cover stale successes/failures after replacement/clear/close and no automatic retries or retained browser storage.
- [x] 3.4 Add responsive styling and keyboard/accessibility behavior using existing dashboard patterns; verify labeled controls, live status announcements, focus visibility, keyboard operations, and no overflow at 375 pixels. Document client startup and temporary-preview versus explicit-confirmation usage in client/README.md.

## 4. Integration verification

- [x] 4.1 Run server tests/build and client tests/build/lint; verify all offline suites use mocked OCR, existing API checks pass, and OpenSpec validation succeeds.
- [x] 4.2 Exercise selection, extraction, edits, clearing, service-disabled/error behavior, and reload through the browser with an injected provider; verify projected rows appear without altering dashboard data and record browser verification results.
- [x] 4.3 Perform an explicit live Google upload check on a synthetic screenshot through the browser when cloud access is available; verify code/section projection and record sanitized results or the precise external blocker without claiming unverified accuracy.
