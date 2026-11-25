# Spec Delta

## Purpose

Help authenticated students compare university-monitored library spaces using SBU occupancy readings, scoped facilities information, and independently available historical trends without student participation.

## ADDED Requirements

### Requirement: University-only location comparison
Study Spot Finder SHALL preserve its existing authenticated navigation and show five responsive selectable cards: ID 1 North Reading Room capacity 900, ID 2 Central Reading Room 300, ID 3 Health Sciences Library 350, ID 4 Music Library 110, and ID 5 3rd Floor 300. SBU SHALL be the sole crowd-information source. Each usable reading SHALL show a percentage, textual crowd level, source attribution and retrieval time. Rounded percentages through 50 SHALL be Low, through 80 Moderate, and above 80 Busy, matching SBU's boundaries; visual percentages SHALL be capped at 100 while preserving valid actual counts.

#### Scenario: Compare five locations
- **WHEN** an eligible signed-in user opens Study Spot Finder with usable SBU readings
- **THEN** all five cards show their own percentages and text levels, with source and retrieval information, without student-report content

#### Scenario: Boundary classification
- **WHEN** rounded percentages are 50, 51, 80 and 81
- **THEN** their labels are respectively Low, Moderate, Moderate and Busy

### Requirement: On-entry requests and shared freshness
The browser SHALL request all five live readings through the application backend on feature opening, subject to a shared five-minute process-local cache. Concurrent cache misses for a reading SHALL share upstream work. History SHALL be requested only when a detail view is opened and SHALL have a separate one-hour backend cache with request deduplication. Expiry, idle time, foreground changes and selecting cards SHALL NOT cause live polling or background refresh; the UI SHALL NOT expose a refresh button. Reopening the feature SHALL allow another cache-controlled request.

#### Scenario: Concurrent visitors
- **WHEN** two visitors open the feature concurrently with an empty live cache and another opens within five minutes of success
- **THEN** each library needs only one upstream population request and all visitors receive its cached result

#### Scenario: Remain open and reopen
- **WHEN** a visitor leaves the feature open beyond cache freshness, switches browser visibility, and selects a detail
- **THEN** no automatic live request occurs and age/staleness remain apparent
- **WHEN** the visitor leaves and reopens Study Spot Finder
- **THEN** the backend checks freshness and fetches expired readings on demand

### Requirement: Isolated and truthful failure states
Upstream requests SHALL have bounded timeouts and response validation. Genuine zero SHALL be distinguished from missing, invalid or failed data. Failed live refreshes SHALL retain a last successful reading only as explicitly stale within 30 minutes of retrieval; older or absent values SHALL be unavailable with no invented level, percentage or retrieval timestamp. Failures SHALL NOT reset successful retrieval times. Historical errors SHALL NOT hide or replace live occupancy, and one location failure SHALL NOT hide successful locations. Retrieval time SHALL NOT be described as sensor measurement time.

#### Scenario: Partial failure and valid zero
- **WHEN** one population request fails and another returns a valid zero
- **THEN** the failed location is stale or unavailable, the zero location shows 0%, and other successful cards remain usable

#### Scenario: Stale data expires
- **WHEN** a failed refresh has a last good reading 20 minutes old
- **THEN** that reading is labeled stale with its original retrieval time
- **WHEN** the last good reading exceeds 30 minutes
- **THEN** it is unavailable as a current reading

#### Scenario: History fails independently
- **WHEN** history times out or returns unusable data while live occupancy is usable
- **THEN** the detail retains live occupancy and amenities and shows a history-only unavailable explanation

#### Scenario: Already-open view reaches the stale limit
- **WHEN** a reading in an already-open frontend becomes older than 30 minutes without another API response
- **THEN** its population, percentage, crowd level and remaining-capacity estimate cease to be usable current values and the view shows unavailable without any API request or polling

### Requirement: Scoped details and image placeholders
Each selectable card SHALL open its own detail view with a way back, current occupancy state, two side-by-side number-first metrics labeled Current occupancy and Est. remaining capacity, sourced static amenities and useful verified numerical facilities information where available. Estimated remaining capacity SHALL be max(0, capacity minus population) for usable readings and SHALL NOT be represented as actual free seats. Configured capacity SHALL remain internal to calculations. The short clarification SHALL read "Estimated capacity, not guaranteed available seats." Computer counts SHALL describe installed facilities, not live computer availability. Broader-area amenities SHALL be labeled with their scope; unconfirmed location amenities SHALL NOT be inferred. Consistent image placeholders SHALL remain available for missing or failed photographs. The five user-approved optimized WebP photographs SHALL appear in development and production with unchanged mappings, alt text, cover positioning and reserved dimensions. Details SHALL show clickable photo source attribution, with Health Sciences labeled LinkedIn and its original post hyperlink retained. Original JPEGs SHALL remain locally preserved, ignored by Git and excluded from production assets; optimized WebP files SHALL be eligible for Git tracking and included in production output. Documentation SHALL retain original source/attribution and accurately disclose unresolved third-party permissions without representing user production approval as verified reuse rights.

#### Scenario: Inspect facilities and capacity
- **WHEN** the user opens North Reading Room details
- **THEN** verified facilities such as 44 computer seats and 700+ outlets can appear with their source, and remaining occupancy capacity is explicitly distinguished from free study seats

#### Scenario: Unconfirmed footprint and photographs
- **WHEN** ID 5 details are opened
- **THEN** its title remains 3rd Floor and its amenities card separately identifies Main Stacks facilities (56 small-table seats, 199 study-carrel seats, 4 lounge chairs and 276+ outlets), sourced from SBU Places to Study, without claiming exclusive sensor coverage; image placeholders remain unchanged

### Requirement: Accurate historical display
For usable historical data, the feature SHALL use SBU's histogram processing with dayOffset 0, 60-minute buckets and 24 requested buckets, using reference weeks 52 for library IDs 1–3, 48,49,50 for ID 4, and 49,50,51 for ID 5. The backend SHALL select the weeks and validate the echoed selection for that room; cached/in-flight results and failure cooldowns SHALL distinguish room and week selection while retaining the independent one-hour history cache. It SHALL preserve returned chronological order and represent the returned time window and midnight crossing accurately without sorting by hour, custom averaging, forecasting, weekday selection or live overlays. It SHALL distinguish historical patterns from live readings and retain source, retrieval metadata and reference-selection context in the API/developer documentation without claiming unverified calendar-day, timezone, seasonality or predictive-accuracy semantics. If focused validation cannot establish a sufficiently accurate interpretation, a documented history-unavailable fallback SHALL permit core delivery.

#### Scenario: Official room-specific reference selection
- **WHEN** users open details for IDs 1–5
- **THEN** historical requests use respectively 52, 52, 52, 48,49,50 and 49,50,51, expose the selected weeks in metadata, and reject mismatched provider selections without changing live data

#### Scenario: Concise explanation with optional technical details
- **WHEN** a historical graph is displayed
- **THEN** it shows concise reference-week wording, a brief not-a-forecast indication, source attribution and guidance for midnight/missing/zero readings
- **AND** a collapsed-by-default About this data briefly explains reference weeks, campus-hour comparison, the returned hourly window, midnight, interaction, missing and zero readings; raw reference timestamps, week parameters, sampling/rounding limitations and timezone uncertainty remain in developer documentation rather than student copy

#### Scenario: Window crosses midnight
- **WHEN** SBU returns ordered buckets from 4 PM through 3 PM the next day
- **THEN** bars retain that sequence, indicate the day transition and returned hour window, and are not labeled as a midnight-to-midnight day

#### Scenario: Internal aggregation details remain unknown
- **WHEN** internal averaging or rounding details remain unknown but returned values and their time window can be presented accurately
- **THEN** implementation of the desired graph is genuinely attempted with transparent explanatory text rather than omitted solely for those unknown details

#### Scenario: Historical data cannot be accurately represented
- **WHEN** a genuine attempt establishes that returned values or the time window cannot be represented accurately
- **THEN** the graph is withheld with a history-only explanation and official link, the specific reason is documented, and live occupancy delivery is not blocked

### Requirement: Accessible responsive hourly bars
Usable historical data SHALL be displayed as rounded vertical hourly bars on a consistent 0–100% scale with application-consistent colors and minimal readable horizontal hour labels. Hover, tap and keyboard interaction SHALL reveal the corresponding hour and percentage; information SHALL NOT depend solely on hover or color. Missing/invalid buckets SHALL remain gaps rather than zero bars. Above-capacity percentages SHALL be disclosed in text while visual bar heights remain bounded. Cards, details and chart SHALL work at desktop and 375-pixel widths without page-level horizontal overflow. Late requests SHALL NOT display another library's data.

The graph SHALL appear in a separate card titled "Historical hourly occupancy" directly beneath amenities in the desktop right-hand column, stacking readably on mobile. Card name/percentage spacing SHALL be compact and aligned. Fresh readings SHALL say "Retrieved" with relative age; older usable readings SHALL say "Last retrieved" with relative age, without a separate Older reading label. Unavailable readings SHALL say "Current occupancy unavailable" and show no usable current metrics. The global amber age/unavailability banner SHALL be replaced by subtle fine print below the main grid. Source attribution and actual request-error handling SHALL remain. Meter colors SHALL use #397B58, #BD8B32 and #AD414D with readable corresponding text labels and no heavy age fading; thresholds and local expiry behavior SHALL remain unchanged.

#### Scenario: Detail graph placement
- **WHEN** a user opens a library detail on desktop
- **THEN** the historical card appears immediately below amenities in the right-hand column and live occupancy remains independent in the other column

#### Scenario: Initial selection and persistent inspection
- **WHEN** history loads with a valid unique bucket matching the live retrieval campus hour
- **THEN** that bucket is initially selected, otherwise the first bucket is selected
- **WHEN** the student inspects another hour
- **THEN** rerenders and local freshness updates preserve their selection without requests

#### Scenario: Inspect a bar on different devices
- **WHEN** a user hovers, taps or keyboard-focuses an hourly bar
- **THEN** the matching hour and percentage are readable through an accessible description and the scale remains 0–100%

#### Scenario: Navigate during loading on mobile
- **WHEN** the user changes libraries before history completes at a 375-pixel viewport
- **THEN** the new library never displays the previous library's late data and the layout remains readable without horizontal page scrolling

### Requirement: Fresh live versus historical comparison
The detail historical card SHALL show a subheading immediately beneath Historical hourly occupancy only when a fresh live reading and exactly one valid historical bucket match. It SHALL match the campus hour of the live retrieval timestamp using America/New_York, explicitly assuming SBU's historical hour labels are campus-local. Actual uncapped percentages SHALL drive classification: at least ten percentage points lower SHALL be Less busy than usual, at least ten higher SHALL be Busier than usual, and otherwise About as busy as usual. Styling SHALL be subtle green, muted blue (#416B9C on #E8EFF8) and muted amber respectively. The compact subheading SHALL have no supporting percentage sentence. Comparison SHALL use existing loaded data and local freshness updates, SHALL disappear when live data ceases to be fresh, and SHALL NOT add requests, polling, backend/cache changes, main-card comparisons or a bar overlay. About this data SHALL disclose the reference-week basis and accepted campus-hour assumption.

#### Scenario: Inclusive comparison thresholds
- **WHEN** fresh actual live percentages differ from the matching historical percentage by -10, +10 or an amount strictly between those boundaries
- **THEN** the detail subheading says respectively Less busy than usual, Busier than usual or About as busy as usual, using uncapped values rather than displayed bar heights

#### Scenario: Retrieval hour determines the match
- **WHEN** the current campus hour changes while a reading remains fresh
- **THEN** comparison continues to use the campus hour of that reading's retrieval timestamp, including midnight and daylight-saving offsets

#### Scenario: No usable comparison or freshness expiry
- **WHEN** live data becomes non-fresh, or history is missing, invalid or has no unique corresponding hour
- **THEN** no comparison is displayed, the graph/live detail remains independently usable, and no extra request is made

### Requirement: Reporting retirement and unrelated feature preservation
Student-report submission, report-derived summaries/history, and legacy report read/write endpoints SHALL be retired with no student-report fallback. Application startup SHALL NOT require report JSON loading or writable report storage; existing stored reports SHALL remain untouched and unused. The change SHALL require no database migration and SHALL preserve current authentication, privacy controls, Campus Explorer data/workflows and unrelated API features. Browser SBU requests SHALL pass exclusively through the backend without forwarding student credentials; only fixed provider endpoints and supported IDs SHALL be accepted. Existing Vercel/Render routing compatibility and independent health checks SHALL be preserved.

#### Scenario: Old report client after cutover
- **WHEN** an old client posts to `/api/locations/:id/reports` after cutover
- **THEN** the request receives 404 or 410 and saves nothing; no old report contributes to occupancy

#### Scenario: Provider or old file unavailable
- **WHEN** SBU is unavailable or the old report file is corrupt or inaccessible
- **THEN** the server can start, health remains independent, and unrelated authenticated features retain their existing behavior and authorization

#### Scenario: Invalid provider request
- **WHEN** a client requests an unsupported library ID or attempts to supply an arbitrary upstream URL
- **THEN** no arbitrary outbound request is made and no student credentials are sent to SBU

### Requirement: Production photograph asset delivery
The five optimized local WebP photographs SHALL be included in production output and eligible for Git tracking, without a development-only gate, external hosting or new dependencies. Original JPEG files SHALL remain locally preserved but excluded from Git and production output. Missing or failed images SHALL preserve the existing named placeholders and reserved dimensions. All source URLs and unresolved reuse permissions SHALL remain documented; the user's authorization SHALL NOT be represented as a third-party license grant.

#### Scenario: Production photo delivery and original exclusion
- **WHEN** the production frontend is built
- **THEN** its static assets contain all five named optimized WebP photographs and no original JPEGs
- **WHEN** a production detail view is opened
- **THEN** the mapped local photograph and its correct source link appear, with Health Sciences displaying LinkedIn and third-floor text describing a staircase without asserting Main Stacks sensor coverage
- **WHEN** an image is missing or fails to load
- **THEN** its named placeholder retains the reserved dimensions without altering occupancy behavior
