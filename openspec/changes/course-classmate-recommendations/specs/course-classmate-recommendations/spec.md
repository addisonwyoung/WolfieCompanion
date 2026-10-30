# Spec Delta

## Purpose

Recommend eligible peers who share the currently selected course, ranking them by the profile information both students have chosen to make public. Recommendations complement the existing course-scoped classmate roster while preserving its contract and privacy controls.

## ADDED Requirements

### Requirement: Course-scoped peer recommendations
For the currently selected saved course, the dashboard SHALL show recommendations only for other eligible students with a saved enrollment in that normalized course. The recommendation request SHALL derive caller identity from the authenticated session, require caller eligibility and caller membership in the selected course, and exclude the caller. Section records SHALL be considered when establishing course enrollment, but a shared section SHALL NOT be required. A student SHALL appear no more than once for the selected course even when multiple section records exist. The existing classmate-discovery behavior and response contract SHALL remain unchanged.

#### Scenario: Recommend peers enrolled in the selected course
- **WHEN** an eligible student selects a course they have saved
- **THEN** the recommendation section contains only other eligible students with a saved membership in that same normalized course, regardless of section, and excludes the signed-in student

#### Scenario: Avoid duplicate and unrelated recommendations
- **WHEN** an enrolled peer has multiple saved sections or a student is enrolled only in a different course
- **THEN** the first peer appears once and the unrelated student does not appear

#### Scenario: Reject unauthorized recommendation requests
- **WHEN** an anonymous or ineligible user requests recommendations, or an eligible user requests a course they have not saved
- **THEN** the request is rejected without returning recommendation or profile information

### Requirement: Selectable course people lists
For a selected course, the dashboard SHALL provide Classmates and People you may connect with controls. It SHALL show only the list selected by the user at a time and SHALL default to Classmates. Switching views SHALL preserve the independent loading, empty, and error behavior of each list.

#### Scenario: Switch between course lists
- **WHEN** the user selects either Classmates or People you may connect with
- **THEN** only the chosen course list is displayed, and the other list is hidden until selected

#### Scenario: Recommendation loading does not alter roster results
- **WHEN** recommendations are loading or fail while either view is selected
- **THEN** the existing classmates roster data remains available when the user selects Classmates

### Requirement: Use and display only public profile information
The system SHALL use a profile field in a comparison only when that field is available and public for both the signed-in student and the candidate. Major SHALL follow the existing classmate visibility rule and SHALL be unavailable when either major is missing or blank. Academic year, interests, and residence status SHALL be available only when both students have opted to share the respective field and the values are present; an explicitly public empty interest array SHALL be available and yields zero shared-interest points. Private or unavailable fields SHALL be omitted from the comparison and SHALL NOT be returned as public candidate information. Recommendation cards SHALL display only candidate fields that are public under existing profile-sharing controls, including name and major as currently available, and public academic year, residence, and interests when shared. Shared-interest labels SHALL show only the matching interests when both students have opted to share interests.

#### Scenario: Respect optional profile privacy settings
- **WHEN** either student has not opted to share academic year, interests, or residence status
- **THEN** that factor is unavailable for comparison, the private value is not returned or displayed, and the user's remaining public profile information may still be used

#### Scenario: Display public profile details only
- **WHEN** a recommendation card is shown
- **THEN** it shows the candidate's name and available public details, and omits optional fields the candidate chose to keep private

#### Scenario: Handle empty or missing profile fields
- **WHEN** a major, year, or residence value is unset, or a shared interests array is empty
- **THEN** unset values are treated as unavailable rather than mismatches, while an available empty interests array contributes zero shared-interest points without causing an error

### Requirement: Score and rank recommendations on a fixed scale
The system SHALL calculate a similarity score against a fixed 100-point maximum. A same normalized nonblank major SHALL earn 30 points; each distinct matching interest SHALL earn 8 points up to 40; the same academic year SHALL earn 15 points; and the same residence status SHALL earn 15 points. A factor that is private or unavailable for either student SHALL earn zero points and SHALL NOT reduce the fixed denominator. An available factor that does not match SHALL also earn zero points. The displayed score SHALL be the earned points out of 100, rounded to the nearest whole point. Recommendations SHALL be ordered from highest to lowest score, with ties ordered deterministically by candidate name and stable student identifier. If no factors are available, the candidate SHALL remain eligible to appear with a score of 0/100.

#### Scenario: Calculate score from matches
- **WHEN** two students have the same public major, two distinct shared public interests, the same public academic year, and different public residence statuses
- **THEN** the candidate earns 61 points and displays 61/100

#### Scenario: Award no points for private or unavailable factors
- **WHEN** only the major and interests factors are available and both public majors match with one shared interest
- **THEN** the score is 38/100; unavailable year and residence factors earn no points and do not reduce the 100-point denominator

#### Scenario: Rank matches and handle no shared interests
- **WHEN** recommendations have different calculated scores, including candidates with public but empty or nonmatching interests
- **THEN** candidates are ordered by score descending, and public empty or nonmatching interests earn zero points out of the fixed 100-point maximum

#### Scenario: No factors available
- **WHEN** no comparison factor is public and available for both students
- **THEN** the candidate receives 0/100 and is ranked with other candidates at that score
