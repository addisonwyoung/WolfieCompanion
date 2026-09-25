# Tasks

## 1. Sample data and branded shell

- [ ] 1.1 Add typed fictional profile, student, and course fixtures under client/src with CSE 416, CSE 310, AMS 210, and AMS 261; verify each course has at least two other students, differing rosters, and valid membership IDs.
- [ ] 1.2 Replace the Vite starter in App.tsx with a Wolfie Companion header and profile/course/classmate sections, update document title and starter branding, and replace starter layout styles; verify the root page shows the sample-data label and no starter counter or framework links.
- [ ] 1.3 Update client/README.md with prototype start commands, fictional-data scope, and session-only profile behavior; verify the documented client command starts the screen without a backend.

## 2. Profile editing

- [ ] 2.1 Implement the labeled inline editor for major, comma-separated interests, and year with separate draft and saved state; verify Save updates all three fields, Cancel preserves previous values, and reopening uses saved values.
- [ ] 2.2 Add nonblank-major validation, supported year choices, interest trimming/empty-entry removal, and an empty-interests display; verify whitespace-only major is rejected and clearing interests saves successfully.
- [ ] 2.3 Show the reload-reset note and preserve saved profile state during course selection; verify changing courses retains edits and reloading restores the original sample profile.

## 3. Course-based classmate browsing

- [ ] 3.1 Render the four course selection controls with CSE 416 initially selected and accessible selected-state feedback; verify every control updates the selected course and classmates heading.
- [ ] 3.2 Filter fictional classmates by selected course, exclude the current user and duplicates, and display profile summaries and derived counts; verify all four rosters against the fixtures and confirm an overlapping classmate appears once in each relevant course.
- [ ] 3.3 Add a zero-results message; verify with a temporary empty-roster development fixture that no previous results remain, then restore the required seeded classmates.

## 4. Integrated verification

- [ ] 4.1 Verify the complete profile-edit and course-browse journey at desktop and 375-pixel widths, including keyboard-only Save/Cancel and course selection, visible focus, labels, and absence of horizontal page overflow; record results and fix any failures.
- [ ] 4.2 Run npm run lint and npm run build from client and verify both pass; confirm the browser has no application errors during the complete demo and record any remaining limitations.
