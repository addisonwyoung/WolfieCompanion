# Tasks

## 1. OCR adapter and result contract

- [x] 1.1 Add `@google-cloud/vision` to the server dependencies and lockfile; verify installation and `npm run build` from `server` succeed under the existing NodeNext configuration.
- [x] 1.2 Define provider-neutral positioned OCR document and versioned draft-class result types under `server/src`; verify type checking covers nullable metadata, source evidence, warnings, and unverified/requires-review fields.
- [x] 1.3 Implement the injectable Google document-OCR adapter using ADC, image bytes, a 30-second deadline, and disabled retries; verify offline tests assert one call and conversion of text, layout, confidence, and omitted-zero vertices.
- [x] 1.4 Add safe diagnostic mapping for credential, permission/API/billing, quota, decoding, annotation, and timeout failures; verify mocked failures produce actionable messages without raw secrets or successful empty results.
- [x] 1.5 Document provider authentication and project/API/billing setup in `server/README.md`, including the reported `wolfie-companion` quota project and the distinction between CLI login and ADC; verify commands against Google's current official setup documentation.

## 2. Course parsing for both layouts

- [x] 2.1 Add synthetic class-list and calendar OCR fixtures with expected codes, terms, sections, and evidence positions; verify fixtures contain no real names, IDs, or private schedule data.
- [x] 2.2 Implement normalized course-code extraction using positioned same-line tokens and conservative text fallback; verify tests cover joined/spaced/hyphenated codes, token boundaries, missing geometry, ambiguous substitutions, unsupported suffixes, and raw-text preservation.
- [x] 2.3 Implement class-list row/block association and calendar region association for explicit titles, terms, and section/components; verify fixtures cover neighboring cells, missing metadata, explicit local versus global terms, and conflicting associations without guesses.
- [x] 2.4 Merge repeated code/term occurrences while retaining evidence and distinct lecture/lab components; verify tests cover repeated calendar meetings, same-course sections, separate explicit terms, unknown terms, and conflicting metadata warnings.
- [x] 2.5 Return reviewable no-text and no-course results and consistently mark all candidates unverified; verify empty-input OCR fixtures and successful parsing fixtures match the JSON contract.
- [x] 2.6 Document the initial course grammar, explicit layout selection, metadata association limits, and human-review requirement in `server/README.md`; verify examples match parser fixtures rather than claiming catalog validation.

## 3. Local experiment command

- [x] 3.1 Add the `ocr:schedule` script and CLI entry point accepting `--image` and `--layout`; validate local readability, signature, nonempty content, and 10-MiB maximum before cloud access. Verify command tests reject missing/bad arguments, URLs, invalid formats, unreadable files, and oversize input without provider calls.
- [x] 3.2 Connect input validation, adapter, and parser with one success JSON object on stdout and safe errors/nonzero exit on stderr; verify injected-provider command tests for both layouts, no-text/no-course success, provider failure, and no automatic result/image persistence.
- [x] 3.3 Document exact invocation for both layouts, direct CLI use for clean JSON output, terminal/redirection privacy, input limits, and troubleshooting in `server/README.md`; verify offline command smoke tests follow the documented arguments and preserve existing application data.

## 4. End-to-end evaluation

- [x] 4.1 Deliver a reproducible live-evaluation checklist and synthetic screenshot samples/expected class lists for at least three examples per layout, including degraded/cropped input and repeated meetings; verify sample inventory and document precision/recall, false-addition, duplicate, and metadata-correction calculations.
- [x] 4.2 Run server tests/build and client build; verify offline checks need no credentials or cloud calls and existing crowd-report API tests still pass.
- [ ] 4.3 Run opt-in Google OCR evaluation on available samples using configured credentials and compare expected results for each layout. Verify clear synthetic examples recover all expected codes with zero false additions/duplicates; record sanitized aggregate results and corrections. If credentials or representative screenshots are unavailable, explicitly record live or real-world accuracy as unverified rather than marking it successful.

## Verification note

Task 4.3 is pending: Google returned status 7 and the diagnostic classified billing as disabled for the configured ADC quota project. Offline checks passed (14 tests and both builds); live extraction and real-world accuracy are unverified. Enable project billing and repeat the six-sample evaluation.
