# Spec Delta

## Purpose

Help authenticated Stony Brook students discover curated campus resources through an accessible interactive map and equivalent location list, separately from crowd reporting.

## ADDED Requirements

### Requirement: Standalone authenticated campus map
The application SHALL expose Campus Explorer from its authenticated main navigation as a separate view. Its initial map SHALL frame Stony Brook's main academic campus with surrounding residential context, recognizable buildings, pedestrian paths, and clean solid greens and blues. Users SHALL be able to pan beyond that initial area and return to campus. Explorer SHALL NOT depend on crowd-meter location IDs, reports, endpoints or storage, or display opening hours, operating schedules or real-time availability.

#### Scenario: Open and navigate Explorer
- **WHEN** an eligible signed-in student selects Campus Explorer
- **THEN** the selected navigation state is exposed visually and programmatically and a campus-centered map is shown independently of Study spaces
- **AND** the user can pan to residential areas and return to campus without an academic-campus boundary restriction

#### Scenario: Signed-out visitor
- **WHEN** a visitor has no eligible session
- **THEN** existing sign-in/eligibility behavior applies and Explorer data/editor controls are not exposed

#### Scenario: Crowd service unavailable
- **WHEN** the crowd-meter backend is unavailable but location storage and tiles are available
- **THEN** Explorer still loads its curated resources without requesting crowd data or showing availability claims

### Requirement: Filterable resource legend
The system SHALL provide distinct icons and a visible interactive legend for microwaves, outdoor lounges, study spots, printers and drinking water fountains/bottle-filling stations. All five categories SHALL initially be selected. Filters SHALL be keyboard operable, expose selected state, use text as well as visual distinctions, and update both map markers and the location list consistently.

#### Scenario: Combine category filters
- **WHEN** a student selects only printers and drinking water
- **THEN** the map and list show only matching published resources and the legend identifies both selected categories

#### Scenario: No selected categories or no matches
- **WHEN** all categories are deselected or selected categories have no matching records
- **THEN** an explicit no-matches state and a way to change/reset filters are shown without implying a storage failure

### Requirement: Accessible previews and persistent details
The system SHALL offer a small desktop hover/focus preview and persistent details opened by click, tap or keyboard activation. Details SHALL include name, category, required directions, description when present, present building/floor/access information, and source/verification details. An absent description SHALL be omitted without placeholder or invented text. Hover content SHALL remain reachable while hovered, be dismissible, and persist while relevant hover/focus remains. Persistent details SHALL remain open until dismissal or the selected record ceases to match/exist. Controls SHALL provide visible focus, meaningful labels, Escape dismissal and appropriate focus restoration.

#### Scenario: Preview then inspect
- **WHEN** a student hovers or focuses a marker and then activates it
- **THEN** a concise preview is available before persistent details open, and moving the pointer away does not close persistent details

#### Scenario: Touch or keyboard inspection
- **WHEN** a student taps a marker or activates a location-list entry with the keyboard
- **THEN** the same persistent information is available without requiring hover
- **AND** closing details returns focus to an appropriate invoking control

#### Scenario: Selected record filtered away
- **WHEN** a filter change excludes the selected record or a refresh removes it
- **THEN** its details close and no obsolete selection remains

### Requirement: Every overlapping resource remains reachable
The system SHALL preserve separate resource records within the same building or coordinates and SHALL provide a synchronized filtered location list through which every matching resource can be selected regardless of viewport or marker overlap. Coincident-marker selection SHALL provide access to the other coincident matching records. Resource labels SHALL distinguish category and available floor/building information. Overlap handling SHALL NOT alter stored positions.

#### Scenario: Resources share coordinates
- **WHEN** a published printer and water station share a building coordinate
- **THEN** both can be independently opened through the list and coincident-record selection, including on touch and keyboard interfaces
- **AND** filtering to water retains only matching water entries

#### Scenario: Nearby markers overlap at campus zoom
- **WHEN** two different resource points visually overlap at the current zoom
- **THEN** each remains independently selectable through the filtered list without forcing precise pointer targeting

### Requirement: Responsive reliable student experience
The Explorer SHALL fit 375px mobile and desktop viewports without page-level horizontal overflow. Legend, map controls, details and provider attribution SHALL remain readable and operable with touch and keyboard. It SHALL distinguish loading, successful empty data, no filter matches, stale retained data and failures, with retry where applicable. Late requests SHALL NOT restore data or editor state after account changes or sign-out. Tile failure SHALL preserve a usable location list; missing map configuration SHALL explain setup needs. Live failures SHALL NOT be replaced with invented locations.

#### Scenario: Tiles fail
- **WHEN** location data loads but the tile service fails
- **THEN** the student sees a map-specific error and can still filter and inspect the location list

#### Scenario: Storage empty or unavailable
- **WHEN** the location request returns no records successfully
- **THEN** the view explains that no published locations are available
- **WHEN** the location request fails or storage is not configured
- **THEN** the view instead shows a retryable error with an appropriate setup explanation when applicable

#### Scenario: Refresh and account race
- **WHEN** a refresh fails after a successful load
- **THEN** retained data is marked potentially stale
- **WHEN** a response arrives after sign-out or switching accounts
- **THEN** it cannot populate the new workspace or restore the previous editor draft

#### Scenario: Narrow-screen navigation
- **WHEN** a student uses Explorer at 375px width with touch or keyboard controls
- **THEN** filters, overlapping-location selection, details dismissal and attribution remain available without horizontal page scrolling

### Requirement: Provider compliance and campus detail validation
The deployed map SHALL use configured authorized provider access, required visible attribution and dependency notices. Campus detail SHALL be visually validated at campus/building zooms on desktop and mobile before release, including Melville Library, SAC, the academic mall, engineering buildings and residential edges. Public browser keys SHALL be restricted to approved origins; secret credentials SHALL NOT be shipped. Actual rendering quality SHALL be recorded rather than assumed from provider marketing.

#### Scenario: Release map review
- **WHEN** a style is evaluated for release
- **THEN** review confirms useful building outlines/names, pedestrian paths, solid green/blue styling and readable markers at the named campus areas
- **AND** required attribution remains visible alongside legend/details at mobile and desktop sizes

### Requirement: Discreet external feedback
The system SHALL provide Suggest a location and per-location Report an issue using a configured HTTPS external form or email link. Issue context SHALL identify the resource where supported without exposing authentication tokens or automatically including student identity. Feedback SHALL NOT directly change published records or require a reporting backend.

#### Scenario: Report an issue
- **WHEN** a student activates Report an issue from a location
- **THEN** the configured destination opens with encoded resource context where supported and no marker changes are made

#### Scenario: Suggest a resource
- **WHEN** a student activates Suggest a location
- **THEN** the configured external destination is available without granting placement or publication permissions
