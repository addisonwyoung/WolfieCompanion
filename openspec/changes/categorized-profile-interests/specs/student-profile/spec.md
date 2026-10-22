# Spec Delta

## Purpose

Students can maintain a concise set of interests on their persistent profile using browsable, searchable choices. The same interest-name strings remain usable by profile displays and persistence.

## ADDED Requirements

### Requirement: Categorized and searchable profile interests
The profile editor SHALL present the following selectable interest names grouped under their listed categories:

- **sports & fitness**: volleyball, basketball, soccer, going to the gym, running, hiking, yoga, walking, baseball, tennis, swimming, rock climbing
- **games & entertainment**: video games, board games, anime & manga, movies, tv shows, listening to music, reading
- **technology & computing**: web development, game development, robotics, engineering
- **arts**: crafting, drawing, painting, graphic design, photography, video editing, creative writing, knitting & crocheting, playing instruments, singing, pottery
- **food**: cooking, baking, trying new restaurants, trying new cafes

Users SHALL be able to select and deselect each interest independently. Typing in the interest search field SHALL filter the listed options so a matching option can be selected; typing alone SHALL NOT add an interest. A live counter SHALL show the selected total out of five across all categories. The editor SHALL prevent selecting a sixth interest while leaving selected interests available for deselection. Selection controls SHALL expose their selected and disabled states to assistive technology.

#### Scenario: Browse and search interests
- **WHEN** a user opens profile editing and enters text matching one or more listed interests
- **THEN** the matching selectable options appear within their categories and entering text by itself does not change the selected interests

#### Scenario: Select and deselect choices across categories
- **WHEN** a user selects interests from multiple categories and then deselects one
- **THEN** each selection toggles independently and the total counter updates across all categories

#### Scenario: Enforce the five-interest limit
- **WHEN** a user has five selected interests and attempts to select another
- **THEN** the additional interest cannot be selected, the counter remains 5/5, and existing selections can still be deselected

### Requirement: Persist selected interest names
The profile editor SHALL save selected interest names as strings in the existing `profiles.interests` text array. It SHALL NOT store category names or category objects. On profile load and when profile editing begins, saved interest names SHALL appear selected. Saving a valid profile SHALL preserve the selected names so they remain selected after reload and subsequent edits. The stored interest total SHALL be at most five.

#### Scenario: Save and restore selected interests
- **WHEN** a user saves up to five selected interests and later reloads the application or edits the profile again
- **THEN** the same interest names are present as selected and remain saved in the existing text array

#### Scenario: Persist names without category metadata
- **WHEN** selected interests are saved
- **THEN** the array contains the selected interest-name strings and contains no category names or structured category values

#### Scenario: Retain and prune legacy values
- **WHEN** a saved profile contains interest strings that are not among the listed choices, or more than five saved interests
- **THEN** those saved strings remain visible as selected removable legacy values, count toward the five-interest limit, cannot be newly added by typing, and must be reduced to at most five before a successful save
