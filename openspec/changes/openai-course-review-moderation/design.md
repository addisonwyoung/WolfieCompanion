# Design: Local AI course review moderation

## Context

Course reviews currently write directly from the browser to Supabase, which would let a client bypass moderation. The feature needs contextual moderation without per-request moderation charges. The Express server already verifies Supabase users for other server-owned flows.

## Goals / Non-Goals

- Moderate each written review before persistence.
- Keep moderate or uncertain moderation signals available in the separate flagged section; reserve blocking for explicit terms and stronger severe-category scores.
- Enforce the path server-side and preserve reviewer anonymity in reads.
- Use the free OpenAI moderation endpoint, with developers' keys held only by their server process.
- Do not apply database migrations or change shared Supabase data.
- This is an experimental filter, not a guarantee of detection or a substitute for human review.

## Decisions

- Call OpenAI's `omni-moderation-latest` endpoint from Express after authenticating and checking eligibility, before any insert. Send only the review text, never identity or account data. Fail closed when the key is absent, the request fails, or its response is invalid.
- Before the API request, normalize Unicode, diacritics, common leetspeak, repeated letters, and separators, then block a whole-term match from the server-only `COURSE_REVIEW_HARD_BLOCK_TERMS` setting. Do not use substring matching. The setting is supplemental and is not exhaustive; keep its actual contents out of tracked files and client configuration.
- Apply category-specific blocking thresholds: hate/hate-threatening at 0.25; threatening harassment at 0.25; sexual content at 0.35 and sexual content involving minors at 0.15; self-harm and violence categories at 0.25–0.35. API-flagged results, moderate category scores, and non-threatening personal insults remain in the separate flagged section unless they meet a blocking threshold. Keep ordinary negative course criticism appropriate when the model does not signal abuse. This free classifier has no political-content or fact-verification category, so it cannot reliably enforce a ban on political comments or determine whether an accusation is true.
- Moderate the whole review plus clauses split at sentence punctuation, commas, semicolons, and common conjunctions. Also moderate neighboring clause pairs to retain context. Aggregate using the strongest result, so a benign introduction does not hide a harmful passage. Flag a review when it combines a first-person wish, a person/professor target, and a serious-misfortune outcome such as illness, death, betrayal, or abandonment; violence-category scores alone do not escalate a recognized wish to blocked. Explicit hard-block terms and separate high-risk categories still block, as do direct threats.
- Use Supabase service role only on the server for the final insert, while validating the bearer token and eligibility with the user's publishable-key client. The server derives `user_id` from the verified token.
- Add a `moderation_status` column and expose it through the existing anonymous view. Revoke authenticated direct insert privileges. Keep flagged reviews public but outside the primary list and aggregates.
- Keep the migration as a reviewable file; never apply it automatically.

## Risks / Trade-offs

- The moderation endpoint can miss coded language, overflag criticism, or disagree with human judgment. It is not a general chat model and does not make the app's three-way decision directly; the application maps category scores to outcomes. Thresholds may need recalibration as the underlying service changes.
- The lexical list catches only terms it contains and common obfuscations. It can block quoted language and will not catch every slur, euphemism, or semantic insult. Lower harassment thresholds can move valid criticism into the flagged section, where it remains readable.
- Reviews leave the user's device and are sent to OpenAI for moderation. Developers need an API key on each local server, or a team-managed key on a shared backend. Never commit keys.
- The free endpoint has rate limits and requires internet access; preserve drafts when the API is unavailable or rate-limited.
- Existing rows default to appropriate because their text was not reclassified; the migration does not retroactively analyze them.
- The new endpoint requires the additive migration and server service-role configuration. Until migration application, writes return an error.

## Migration Plan

1. Review and apply `202610230002_course_review_moderation.sql` manually in the intended Supabase environment after confirming the base course-review migration exists.
2. Configure server Supabase values, `OPENAI_API_KEY`, and the private `COURSE_REVIEW_HARD_BLOCK_TERMS` value in the ignored server environment file.
3. Run client and server locally and exercise appropriate, flagged, blocked, and API-unavailable outcomes.
4. Rollback by reverting this code and, only with database-owner approval, dropping the added status column and restoring authenticated insert grants. Existing review rows are not deleted by this migration.
