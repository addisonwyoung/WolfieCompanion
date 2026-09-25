# Tasks

## 1. Evaluation data model and sample fixtures

- [ ] 1.1 Add typed course-offering and evaluation models with stable offering IDs, field constraints, and published-state data; verify the client type-checks and the model represents course, professor, semester, four-digit year, hours, difficulty, and anonymous review text.
- [ ] 1.2 Add exactly five published sample offerings covering CSE 416, BIO 201, and MAT 210, including two distinct CSE 416 semester/professor combinations and representative evaluations; verify fixture counts and offering identities in a focused data test or development assertion.

## 2. Course evaluation browsing experience

- [ ] 2.1 Add a course-evaluations view reachable from the existing client navigation without removing dashboard or study-space views; verify each destination remains selectable and renders its expected content.
- [ ] 2.2 Implement case-insensitive partial search by course code/title, empty-search reset, offering cards, and no-match state; verify searching by partial code finds the expected offerings and an empty query restores all five.
- [ ] 2.3 Implement offering selection keyed by stable offering ID and render only that offering's anonymous evaluations, review count, average weekly hours, and average difficulty; verify the two CSE 416 offerings never share evaluation results.
- [ ] 2.4 Add explicit no-evaluations and review-list states, plus responsive and keyboard-accessible labels/focus behavior; verify an offering without reviews does not display zero-valued averages and the view remains usable at narrow width.

## 3. In-session review submission

- [ ] 3.1 Add a submission form that selects an existing offering and collects weekly hours, difficulty, and written review with field-level validation for 0-40 hours, integer difficulty 1-5, and a 1,000-character review limit; verify invalid values prevent publication and show actionable feedback.
- [ ] 3.2 Store evaluation updates and submitted-offering IDs in React state only, publish valid submissions immediately, and recompute the selected offering's aggregates; verify a successful submission appears anonymously and changes its averages without affecting another offering.
- [ ] 3.3 Enforce one published review per exact offering while allowing reviews for different offerings with the same course code; verify duplicate submission is rejected and a second CSE 416 offering remains reviewable.
- [ ] 3.4 Add submission success, duplicate, and reset-on-reload messaging; verify reloading restores the original sample evaluations and removes session submissions.

## 4. Integration verification

- [ ] 4.1 Run the client build and lint checks, then manually exercise search, offering switching, empty states, valid and invalid submission, duplicate prevention, and navigation; verify all checks pass and existing prototype views still work.

