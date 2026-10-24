# Tasks

## 1. Server moderation and persistence

- [x] 1.1 Add OpenAI Moderation API score mapping and fail-closed validation; verify server TypeScript compilation and confirm severe category thresholds.
- [x] 1.2 Add authenticated eligible review submission through Express and server-only Supabase writes; verify auth, duplicate, blocked, and failure responses by inspection.

## 2. Client and database integration

- [x] 2.1 Route client submissions through the server and expose appropriate/flagged review sections; verify flagged rows do not affect aggregates and drafts remain on errors.
- [x] 2.2 Add an unapplied additive migration for status projection and insert revocation; verify SQL changes only course review objects and is not run automatically.

## 3. Local setup documentation

- [x] 3.1 Document OpenAI API-key setup, free moderation limits, data flow, and required server environment; verify documentation matches implementation.
- [x] 3.2 Build the client, typecheck the server, and review the final diff for secrets, accidental migration execution, or unrelated changes.

## 4. Moderation policy refinement

- [x] 4.1 Add normalized whole-term hard blocks for strong profanity and selected slurs while preserving substring words.
- [x] 4.2 Route lower-confidence harassment and hate signals to the existing flagged section instead of rejecting them.
- [x] 4.3 Document the policy and its limits; do not treat the word list or model as exhaustive.
- [x] 4.4 Block hate-category results and use a lower hate-score threshold while keeping borderline harassment in the flagged section.
- [x] 4.5 Apply stricter blocking across moderation categories while preserving a flagged path for lower-confidence results.
- [x] 4.6 Block new submissions that meet the former flagged criteria; retain the separate display for previously saved flagged reviews.
- [x] 4.7 Restore the flagged outcome for moderate or uncertain signals and reserve blocking for explicit terms or stronger severe-category scores.
- [x] 4.8 Lower the hate-category block threshold while keeping lower-confidence harassment signals flagged.
- [x] 4.9 Add stricter category thresholds for threats, sexual content involving minors, sexualization, self-harm, and violence; document political-content and fact-checking limits.
- [x] 4.10 Moderate the full review and clause-level/overlapping fragments in one request, then aggregate the strongest category signals.
- [x] 4.11 Flag targeted wishes for serious illness, death, betrayal, or abandonment without blocking them solely through this heuristic.
