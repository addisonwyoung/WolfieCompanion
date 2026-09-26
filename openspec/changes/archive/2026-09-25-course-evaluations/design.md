# Design

## Context

The client is a React and TypeScript prototype with sample course data, client-side navigation, and no authentication or evaluation backend. This change adds a course-evaluation view alongside the existing dashboard and study-space prototype. See proposal.md for motivation and specs/course-evaluations/spec.md for behavior.

## Goals / Non-Goals

**Goals:**

- Keep course offerings and evaluations as typed sample data with stable offering IDs.
- Make selection, search, aggregation, submission, and duplicate prevention work without a server.
- Preserve the existing dashboard and study-space views.

**Non-Goals:**

- Authentication, enrollment verification, moderation, persistence, or cross-device synchronization.
- Creating or editing course offerings from the UI.
- Account identity, attribution, or review editing and deletion.

## Decisions

- **Offering identity:** Use a stable ID per course/professor/semester/year tuple. Evaluation records reference that ID so same-course offerings cannot share reviews accidentally. A composite key was considered, but an explicit ID keeps UI state and sample fixtures simpler.
- **Sample fixtures:** Define exactly five offerings covering CSE 416, BIO 201, and MAT 210, with two distinct CSE 416 semester/professor combinations. Seed each offering with representative anonymous evaluations, including an offering with no evaluations to exercise the empty state.
- **Client state:** Keep the immutable sample fixtures separate from React state, then initialize a session evaluation map from those fixtures. Submission updates the map and a per-offering submitted set. React state was chosen over localStorage to make the reset-on-reload prototype behavior explicit.
- **Aggregation:** Calculate average hours and difficulty from the selected offering's evaluations at render time. Display a defined empty state when there are no evaluations; avoid storing derived averages that could become stale after a submission.
- **Submission rule:** Track submitted offering IDs in session state. This enforces one review per exact offering while allowing reviews for different offerings sharing a course code.
- **Navigation:** Add a course-evaluations destination to the existing client navigation and keep the selected offering/search state local to the evaluation view. No backend route is needed.

## Risks / Trade-offs

- [Risk] Session-only submissions disappear on refresh and are not shared between users. -> Mitigation: label the view as sample/demo data and keep persistence explicitly out of the contract.
- [Risk] Client-side duplicate prevention is not a security control. -> Mitigation: treat it as prototype behavior; real enforcement belongs with authenticated server persistence in a later change.
- [Risk] Small sample sizes can make averages misleading. -> Mitigation: show review counts alongside averages and retain the individual written reviews.
- [Risk] Existing dashboard navigation may become crowded. -> Mitigation: reuse the current navigation pattern and make the evaluation view a focused page rather than embedding all controls in the dashboard.

