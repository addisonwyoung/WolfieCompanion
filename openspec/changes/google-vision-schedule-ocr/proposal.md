# Proposal

## Why

Wolfie Companion needs to turn students' SOLAR class-list and weekly-calendar screenshots into usable class data. A local Google Vision experiment will establish extraction and parsing quality before coupling the feature to accounts, a database, or enrollment changes.

## What Changes

- Add a developer-run TypeScript command in `server` that accepts a local PNG/JPEG screenshot and returns JSON containing recognized text, deduplicated course candidates, source evidence, and review warnings.
- Use Google Vision document OCR with Application Default Credentials; keep provider extraction separate from deterministic parsing.
- Support both SOLAR class lists and weekly calendars, normalizing course codes and retaining only explicitly readable term/section details.
- Add offline fixtures and parser/provider tests plus a documented live evaluation procedure for both formats.
- Keep this experiment outside the dashboard and HTTP API. No enrollment mutation, cloud image storage, authentication setup, or Firebase/Supabase selection is included.

## Capabilities

### New Capabilities

- `schedule-ocr`: Local screenshot-to-text and draft-course extraction experiment with reproducible evaluation and explicit review warnings.

### Modified Capabilities

None. Existing prototype requirements keep enrollments fixed; this experiment returns draft data without changing those behaviors.

## Impact

- New server-side OCR adapter, parser, CLI entry point, tests, and synthetic fixtures; `server/package.json` and lockfile gain the Google Vision client dependency and experiment script.
- `server/README.md` documents credentials, invocation, output, and live evaluation. Existing Express routes and client components are unaffected.
- Live runs require a billing-enabled Google Cloud project with Vision enabled and consume OCR units. User reports local credentials configured for `wolfie-companion`; API enablement and successful access remain unverified.
- Screenshots and raw OCR text can contain personal data. Input stays local except for the explicit Google OCR request; output is printed to the invoking terminal, and real student data must not be committed.
