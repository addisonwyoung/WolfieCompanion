# Proposal

## Why

Students need a clear, dependable way to find useful campus resources without searching separate university maps or relying on crowd reports. Campus Explorer will present manually verified resources in a polished map while giving a small authorized team a secure way to maintain them.

## What Changes

- Add a standalone Campus Explorer view in the authenticated main navigation, independent of Study spaces and its crowd meter.
- Use React Leaflet 5, Leaflet 1.9, and MapTiler Cloud raster tiles with solid greens/blues, recognizable buildings, and pedestrian paths; validate actual Stony Brook detail before accepting a style.
- Start on the main academic campus, naturally include surrounding residential areas, and allow future locations anywhere valid geographic coordinates permit.
- Provide five resource categories, distinct lightweight icons, an interactive filter legend, desktop hover previews, persistent accessible details, and a synchronized location list that resolves overlapping resources.
- Persist curated resource records in Supabase, with published-only student reads and database-authorized editor CRUD and map-click coordinate capture.
- Provide discreet external suggestion/issue links and source/verification information. Manually verify university printer/water references rather than assume import or reuse rights.
- Exclude opening hours, schedules, real-time availability, crowd integration, student publishing, reporting backend, routing, and premature clustering.

## Capabilities

### New Capabilities

- `campus-explorer`: Authenticated student map, category filters, accessible details/list, provider setup, resilient loading, and external feedback.
- `campus-location-management`: Persistent resource records, publication rules, private editor authorization, secure placement/editing/removal, and curation.

### Modified Capabilities

None. Existing shell requirements allow an additional navigation entry; existing dashboard and crowd-meter contracts remain unchanged.

## Impact

- Future client changes: `App.tsx`, scoped Explorer components/styles, a typed Supabase API factory and request-state hook; reuse existing account lifecycle and dialog patterns.
- Future dependencies: React Leaflet 5, Leaflet 1.9, and Leaflet TypeScript definitions/CSS. MapTiler requires a team-owned account, browser API key, attribution, and a suitable plan; provisioning is outside this planning action.
- Future database changes: additive reviewed migration, `public.campus_locations`, private editor membership/helper, narrowly exposed capability check, constraints/triggers/RLS, and isolated permission tests. No new Express/Prisma service or browser service-role key.
- Prerequisites are dependency-specific: license review precedes installing affected dependencies; MapTiler credentials/style validation and release-only setup do not block independent local schema, typed API or UI scaffolding during a separately authorized Apply. Provider acceptance/release still requires the approved style/plan/key restrictions, feedback destination, eligible editors/curator and deployed account prerequisites. These are tracked in design/tasks, not claimed complete; hosted database changes require separate owner authorization.
- Deliverable now is planning only: no application source edits, dependency installation, migrations, external accounts, or hosted data writes.
