# Design

## Context

See proposal.md for motivation. The React dashboard imports fixed courses and fictional students from `client/src/sampleData.ts`; the existing prototype spec fixes enrollment. The Express server currently handles only health, study locations, and crowd reports. Its request body limit is 8 KB, storage is a crowd-report JSON file, and there is no authentication or enrollment database. Server tests use Node's test runner with `tsx`, and TypeScript compilation includes `server/src` under NodeNext strict settings.

Google Vision document OCR exposes recognized text plus page/block/paragraph/word layout. The developer has reported configuring Application Default Credentials for project `wolfie-companion`; access and billing/API enablement have not been independently verified. No actual schedule screenshots have been supplied, so initial fixtures must be synthetic and accuracy claims deferred to live evaluation.

## Goals / Non-Goals

**Goals:** Produce a reusable extraction boundary and pure parser, with source-grounded draft classes and independently testable layout handling. Make the first cloud experiment easy to run and inspect without requiring account/database infrastructure.

**Non-Goals:** Public uploads, camera capture, review UI, catalog matching, verified enrollment, persistence, timetable reconstruction, PDF/HEIC handling, automatic layout detection, and AI-model fallback. These require separate changes after evaluating this experiment.

## Decisions

### 1. Local CLI first

Add `npm run ocr:schedule -- --image /absolute/path/schedule.png --layout class-list` (or `weekly-calendar`) in `server`, using a source entry point compatible with the existing build configuration. Emit one JSON object to stdout; diagnostics go to stderr. This creates a direct inspection path without adding an unauthenticated billable endpoint or changing the dashboard contract. An Express upload route is deferred until authentication and abuse controls exist; Firebase/Supabase selection is independent.

Validate readable file bytes, PNG/JPEG signature, and a 10-MiB maximum before invoking Google; an extension alone is insufficient. A matching signature does not guarantee a decodable image, so provider decode failures remain errors. Accept filesystem paths only, not remote URLs. Do not change global Express body limits.

### 2. Google Vision adapter with injectable provider

Add `@google-cloud/vision` to server dependencies, invoke `documentTextDetection` with image bytes using ADC, and normalize its response into a provider-neutral document: full text, page dimensions, positioned blocks/paragraphs/words, and optional provider confidence. Omitted zero coordinates in Vision vertices must normalize to zero. No separate text-detection call, automatic retries, upload bucket, or saved credential file is needed. Use a 30-second request deadline and disable client retries for the experiment to keep processing bounded and paid requests predictable.

Keep CLI orchestration, provider conversion, and parsing separate. Tests inject a fake provider; Google imports/credential discovery must not require credentials for offline parser tests. Handle both transport errors and annotation-level error fields. Map credential, billing/API/permission, quota, decode, and timeout failures to actionable diagnostics without dumping raw provider objects or secrets. Unexpected errors receive a safe failure message.

Alternative: browser OCR avoids image transfer but changes the chosen experiment and adds client execution concerns. A vision-capable model may help varied layouts later, but adds another provider and inference uncertainty before we have baseline evidence.

### 3. Structured output and conservative parser

The JSON result has `schemaVersion: 1`, `provider: "google-vision"`, `layout`, `rawText`, `classes`, `warnings`, and `requiresReview: true`. Each class has `department`, `courseNumber` (string), canonical `code`, nullable `title`, nullable `term` (semester and four-digit year), `sections` (explicit label and optional component such as lecture/lab/recitation), `evidence` (source snippets and available bounding boxes), `warnings`, and `verification: "unverified"`. Structured warnings use stable codes and readable messages. Optional OCR confidence is evidence quality, not a probability that enrollment is correct.

Initial code grammar is a 2-4-letter department followed by a three-digit course number, separated by whitespace/hyphen or directly joined. This is a documented experiment limitation, not a complete university catalog. Boundaries prevent matching inside unrelated longer identifiers. Handle course-number suffixes or other formats as unsupported evidence requiring review rather than truncating them. Do not restrict candidates to the four demo courses and do not equate syntactic matches with real catalog entries.

Prefer positioned token grouping when available. Reconstruct same-line tokens with relative geometry, preserving block/row context rather than flattening columns together. Class-list parsing associates metadata within the relevant row/block; calendar parsing treats spatial course regions separately. If layout information is missing, use conservative same-line code extraction, omit uncertain metadata, and issue a layout warning. Explicit local term evidence takes priority over an unambiguous screenshot-wide term heading; conflicting global term headings stay unresolved unless local context identifies a term. Titles/sections are populated only with clear association.

Merge candidates by canonical code and explicit term; unknown-term occurrences merge only with other unknown-term occurrences. Retain all occurrences and unique sections/components. Different sections are not automatically a conflict because a course can include lecture and lab. Incompatible title/term association or multiple plausible labels yield warnings instead of arbitrary selection. Ambiguous codes such as `CSE 4I6` remain raw evidence with a warning rather than a fabricated course. Empty OCR and no-course results are separate successful outcomes.

### 4. Privacy and evaluation boundary

Read input in memory and send bytes directly to Google only on explicit invocation. Print recognized text to the developer's terminal as requested, but do not add persistent logs, automatic output files, or private fixtures. Explain that shell redirection can intentionally save output and that it may contain personal information. Provider-side data handling remains subject to Google's service terms; this design only controls app-side persistence.

Use synthetic OCR documents and minimal synthetic images for offline fixtures. Evaluate at least three class-list and three calendar screenshots with known expected classes, including repeated meetings and a degraded/cropped sample per layout. Record course precision/recall, false positives, duplicate counts, and metadata corrections separately per layout. A clear synthetic screenshot per layout should recover all expected canonical codes with zero false additions and duplicates. Do not claim real-world accuracy from synthetic success; representative screenshot availability can remain a reported live-verification limitation.

## Risks / Trade-offs

- [Small or clipped calendar text] --> Return raw evidence and warnings; include degraded samples in evaluation and require review.
- [Incorrect spatial association] --> Conservative metadata extraction and row/cell fixtures; never guess missing term/section fields.
- [Syntactically valid but nonexistent course] --> Label every candidate unverified; defer catalog matching to enrollment integration.
- [Private student details in output] --> No automatic persistence, synthetic fixtures, and documentation for cropping/anonymizing input.
- [Cloud usage or credentials unavailable] --> One request per invocation, bounded deadline, offline default tests, and transparent live-test status.
- [Parser overfits synthetic layouts] --> Compare actual consented/anonymized examples before promoting to a user-facing feature.

## Migration Plan

Install the server-only dependency, add the local command/modules and offline tests, and document ADC/project setup. Run the existing server build/tests and the client build to verify compatibility. Perform opt-in live evaluation when credentials and screenshots are available. No schema or data migration is required. Rollback removes the command, dependency, and modules; existing API behavior and stored data are unchanged.

## Open Questions

- Which consented/anonymized real screenshot samples can be used for the live evaluation? Their availability affects measured accuracy, not the experiment's interfaces or implementation scope.

## References

- Google document OCR: https://docs.cloud.google.com/vision/docs/ocr
- Google Vision authentication: https://docs.cloud.google.com/vision/docs/authentication
- Node client library: https://docs.cloud.google.com/vision/docs/libraries
