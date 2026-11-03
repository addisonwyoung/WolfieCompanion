# Proposal

## Why

The browser toxicity classifier was inconsistent on indirect insults and hate speech. Course reviews need a contextual check that can sort comments into ordinary, flagged, or blocked outcomes without per-request moderation charges or per-device model downloads.

## What Changes

- Add an OpenAI Moderation API request through the Express server.
- Block a small, normalized whole-term list of strong profanity and common slurs; do not match terms inside unrelated words.
- Classify comments as appropriate, flagged for review, or blocked; flag targeted harassment and hate at a more sensitive threshold, and fail closed if moderation is unavailable or returns invalid output.
- Persist the moderation category and route review submissions through the server so browser clients cannot skip moderation.
- Prepare an additive Supabase migration; do not apply it automatically or modify shared database contents.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `course-evaluations`: Written reviews are moderated before persistence and shown in appropriate or flagged categories; clearly abusive reviews are rejected.

## Impact

- Client: review categories and submission status.
- Server: authenticated review endpoint, eligibility and duplicate checks, OpenAI moderation request, and privileged database write.
- Supabase: additive migration for the review category, public view projection, and disabling direct authenticated inserts.
- Local setup: an OpenAI API key stored server-side; moderation endpoint is free within its current limits.
