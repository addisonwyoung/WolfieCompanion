# Design

## Context

See proposal.md for motivation. The current React 19/TypeScript/Vite app uses local view state in `client/src/App.tsx`, not a routing library. Its authenticated workspace injects the Supabase client from `account.ts`. `academicItems.ts` demonstrates typed API factories, explicit columns, normalization, and affected-row checks; `useAcademicItems.ts` demonstrates request-generation guards and retained drafts. `useAcademicDialog.ts` and delete dialogs provide modal/focus patterns. Supabase migrations define `private.is_eligible()` and `private.touch_updated_at()`; migrations are reviewed and manually applied by the owner, with SQL tests on disposable local PostgreSQL only. CI currently runs client lint/build but not client tests. No editor role or map dependency exists. The crowd meter has separate Express/JSON persistence.

Existing `prototype-dashboard` requirements do not prescribe a closed navigation menu. The older `docs/design-doc.md` mentions Mapbox and Firebase, but runtime code uses Supabase and no map provider; use runtime patterns as the integration baseline. No existing capability needs a modified requirement.

## Goals / Non-Goals

**Goals:** Accessible map and equivalent list; a small maintainable resource model; database-authorized maintenance; bounded work for tens to a few hundred locations; provider configuration independent of resource data.

**Non-Goals:** New router, new Express/Prisma API, editor-role administration UI, geocoding, routing, geolocation tracking, PostGIS, live subscriptions, clustering, hours/schedules/availability fields or controls, crowd integration, or automatic university dataset ingestion.

## Decisions

### 1. Separate, lazy-loaded authenticated view

Add Campus Explorer next to Study spaces in the existing main navigation, with selected state exposed accessibly. Mount Explorer only in the eligible authenticated workspace. Use a lazy module boundary so map dependencies are not loaded with the dashboard. Preserve viewport/filter values in the current account workspace across navigation, unmounting map listeners when inactive. Account changes clear capability state, selection, requests, and editor drafts. This avoids hidden-map sizing and event issues; if a later implementation retains a mounted hidden map, it must invalidate map size on reveal and suspend inactive work. No new router is needed for a standalone view in this application.

Proposed modules: `CampusExplorer.tsx`, `CampusMap.tsx`, scoped Explorer styles, `campusLocations.ts`, `useCampusLocations.ts`, and a location editor dialog. Pass a memoized API factory the existing client. Reuse dialog behavior where suitable without coupling Explorer to academic records. Keep crowd code, IDs, tables, endpoints, and polling untouched.

### 2. React Leaflet + patched MapLibre Leaflet bridge + MapTiler vector style

Keep React Leaflet 5/Leaflet 1.9 and all resource markers and interactions. Use @maplibre/maplibre-gl-leaflet 0.1.4 and maplibre-gl 6.4.1. The adapter explicitly supports renderer ^6.0.0 and Leaflet ^1.9.3; the old MapTiler adapter/SDK is removed rather than overriding its 5.x constraint. Vite 8.3.5 and transitive Zod >=4.6.6 address the other reviewed advisories without adding Zod as an application dependency.

Load the renderer/adapter only when configured, set the Vite-bundled worker URL before initialization, and keep the canvas in tilePane below Leaflet resource markers. The adapter owns renderer synchronization and cleanup; listen to renderer errors, retry the basemap only, and remove the layer/listeners on teardown. Keep the same VITE_MAPTILER_API_KEY and VITE_MAPTILER_MAP_ID. The style URL stays https://api.maptiler.com/maps/{mapId}/style.json; transformRequest attaches the key only to HTTPS api.maptiler.com resources. Never substitute a different style/provider or attach the key to other source hosts. Use the customized vector style's building/path details and existing colors; no raster endpoint or zoom offset applies.

Set attributionControl:false explicitly: the bridge must not copy remote attribution HTML to Leaflet. Add only fixed reviewed MapTiler/OpenStreetMap credits and preserve the MapTiler logo. Balance manual attribution on cleanup/retry. Additional source-credit obligations must be reviewed and rendered safely, never forwarded as arbitrary HTML. Resource details remain React text; no renderer HTML popup is introduced. Retain bridge ISC and renderer BSD-3-Clause notices alongside existing library notices. Provider service terms still apply.

This change has no impact on the lazy view, initial campus viewport, Return to campus, filter/list selection, lightweight custom markers or database authorization. Missing configuration/WebGL/network failures leave the resource list usable. Validate bundler/worker compatibility in the browser using an intercepted synthetic vector style; the actual customized campus style, allowed origins, billing and full live-provider acceptance remain owner prerequisites. No hosted data changes or editor UI are included.

### 3. One resource per database row

Create additive `public.campus_locations` with the following proposed fields. Null optional fields render as absent rather than invented facts.

| Fields | Type and constraints |
| --- | --- |
| id | UUID generated primary key |
| name | Trimmed nonblank text, 1-160 characters |
| category | Constrained text: microwave, outdoor_lounge, study_spot, printer, drinking_water |
| latitude / longitude | Required double precision, finite, inclusive global ranges -90..90 / -180..180 |
| building / floor | Optional trimmed text, up to 160 / 40 characters; building optional for outdoor/residential points |
| directions | Required trimmed nonblank text, up to 1000 characters |
| description | Optional nullable trimmed text, up to 2000 characters when supplied; blank editor input normalizes to null |
| access_note | Optional trimmed text up to 500 characters, for restrictions such as card access; not schedules |
| source_url / source_note | Optional validated HTTPS URL up to 2000 characters / provenance note up to 1000 characters; at least one required before publication |
| verified_at | Nullable timestamptz, required for publication; explicit curator verification, not automatically advanced by unrelated edits |
| status | Constrained text: draft or published, default draft |
| created_at / updated_at | Database-assigned timestamptz, existing updated-at trigger pattern |
| revision | Positive integer, database-controlled increment on update |

No campus-specific constraint, uniqueness on building/coordinates/category, or required building FK. A printer and water station in the same building are independent records, as are two printers on different floors. Category remains singular; resource-specific wording (fountain, filler, or both) belongs in the name/description initially. A normalized building catalog, arbitrary JSON metadata, and spatial extension add complexity without current need. Index status/category if warranted by straightforward publication/filter queries; no spatial indexing now. UI normalization mirrors database checks but never replaces them. No hours, schedules, occupancy or availability fields.

Use confirmed hard deletion for Remove, not a new archive workflow. Draft/published enables curation before student exposure. No editor identities need to be stored in student-readable rows; an audit log is deferred rather than exposing Auth UUIDs. `revision` allows conditional update/delete so stale dialogs report a conflict and retain their draft. Returning affected IDs/rows distinguishes a successful mutation from RLS or revision zero-row results.

### 4. Private capability and operation-specific RLS

Introduce private `campus_location_editors(user_id UUID primary key references auth.users(id) on delete cascade)`. No client table privileges or membership CRUD. The trusted project owner manually grants/revokes membership by UUID; map editors cannot appoint editors. Initial editors must satisfy existing Stony Brook eligibility, aligning with the current application gate.

A stable narrowly scoped security-definer `private.can_manage_campus_locations()` checks current `auth.uid()`, existing eligibility and membership. Set empty search_path, fully qualify references, revoke default PUBLIC execution, grant only required authenticated execution, and ensure no direct role-table exposure. An authenticated security-invoker public capability RPC returns only the caller's boolean; it accepts no user ID. Capability lookup fails closed in the UI.

Enable RLS and revoke inherited grants before granting authenticated select/insert/update/delete. Grant no anon access, truncate, trigger or membership powers. SELECT permits eligible students to read published rows and eligible editors to read all rows. INSERT WITH CHECK requires editor capability. UPDATE requires editor capability on both old and new rows. DELETE requires editor capability. Prevent client changes to generated IDs/timestamps/revisions using appropriate column grants or triggers; timestamps/revision remain authoritative. Check publication completeness at database level. Direct REST calls by students must fail regardless of UI controls. Membership revocation blocks subsequent writes without JWT role-refresh dependence; in-flight transactions follow database transaction semantics.

Reuse the publishable client and caller JWT; no browser service-role key or new privileged server endpoint. Client capability flags are presentation only. Database tests must exercise direct reads/writes, self-promotion attempts, revocation, invalid data, and helper permissions.

### 5. Accessible interaction and overlapping resources

Use a persistent visible legend of five labeled checkbox/toggle filters, all selected initially, with matching icons and text. Support no selected categories and explicit no-matches messaging. Filter a memoized loaded array; do not fetch again for every filter toggle. A synchronized filtered list includes every matching resource regardless of viewport or marker overlap; each button opens persistent location details and can recenter the map. List text distinguishes building, floor and category. Do not offset stored coordinates for visual separation or add clustering as a default dependency. For coincident icons, any directly selected marker also offers access to other coincident filtered records; the full list remains the universal fallback for near-overlaps at any zoom.

Use five reusable local SVG/CSS icon definitions with distinct shapes and stable anchors. Cache Leaflet icon objects by category; render one lightweight keyed marker per filtered record. Avoid a React root per marker, rich HTML in every marker, or individual Supabase subscriptions. Share one selected detail surface and one transient hover preview. Keep map movement/temporary editor coordinates local to the map; do not drive every marker through React state on every pointer/move event. Memoize derived filtering and stable handlers where beneficial; measure before additional optimization.

Desktop hover/focus reveals a small name/category/building preview. Keep hover content reachable, dismissible with Escape and present while hovered/focused. Click/tap or keyboard activation opens persistent details with required directions, description when present, optional access note, source/verification details and issue link. Database and editor validation both permit an absent description; publication does not require one. Close returns focus appropriately. Close obsolete selection when filters exclude it or its row disappears. On mobile, use a compact details panel with adequate touch targets; keep attribution, legend, zoom and close controls usable. Respect reduced motion and visible focus. Scope control styling so global button/input rules do not distort Leaflet controls or checkboxes.

### 6. Explicit placement/editor lifecycle

An editor enters Add location mode before clicks capture coordinates. A background click reads event.latlng into a temporary pin and editor draft; it never immediately writes. Subsequent reposition action/click updates that draft. Marker/control clicks do not bubble into placement. Keyboard users pan the map and activate Use map center to capture coordinates without typing. Edit opens the same form with a reposition mode; Cancel discards unsaved edits and temporary pins. Remove requires confirmation.

Show draft/published state only to editors and provide an explicit publish control after required provenance/verification validation. Disable duplicate submissions while pending; retain draft and coordinates on failed save, conflict or permission loss, but clear drafts on sign-out/account change. On success reconcile the returned authoritative row. Re-check capability on entry and after authorization errors; disable editing if revoked. Do not automatically retry writes with a different identity.

Load the modest dataset on entry; refresh on returning to the view, explicit retry and tab foreground. Show retained data as potentially stale if refresh fails. Invalidate late responses after logout, account changes, unmount or superseding requests. No occupancy polling, Realtime, viewport pagination or repeated requests during map movement. Handle missing migration separately from successful empty results; never insert fixtures as a live fallback.

### 7. Manual curation and external feedback

Use https://it.stonybrook.edu/services/tech-spaces/map and https://linguistics.stonybrook.edu/commcms/_archive/sustainability/Environmental/wbfsdashboard.php as reference leads only. Verify actual resource, position, floor/directions and access restrictions manually; do not infer printers from lab presence or invent fountain subtype. The archived water URL was inaccessible during exploration; obtain a current authorized source or on-site verification if it remains unavailable. Do not scrape/import datasets or assume copying rights. Verification is provenance, not a claim of current availability.

Use the configured external form/email destination for Suggest a location and per-location Report an issue. Include resource ID/name in encoded report context where supported, never authentication tokens or student identity. These submissions cannot publish or alter records. No reporting table, endpoint or processing automation.

## Risks / Trade-offs

- [Campus footprint/name/path gaps] -> Compare Melville Library, SAC, academic mall, engineering and residential edges at campus/building zoom and mobile size; accept a suitable style only after review. No provider-specific campus quality claim is treated as verified.
- [Vector rendering requires WebGL and provider access] -> Keep resource markers/list independent, handle renderer/network errors, and verify custom style detail and actual plan usage before release.
- [Dependency license or provider terms not accepted] -> Resolve before map dependency implementation; do not silently replace the chosen stack.
- [Unauthorized writes or stale UI capability] -> Database membership lookup in every RLS-authorized write; negative direct-query tests and revocation coverage.
- [Shared-project migration differences] -> Confirm deployed prerequisites with owner; additive reviewed SQL, local fixtures only, no automatic deployment migrations.
- [Resources become outdated] -> Named curator, visible verification details, discreet report link and agreed review cadence; no real-time claims.
- [Overlap and crowded controls on phones] -> Equivalent list, coincident-record chooser, 375px/touch/keyboard acceptance checks rather than premature clustering.

## Migration Plan

1. Resolve prerequisites only before dependent work: license review precedes installation of affected dependencies; credentials/style validation gate live-provider acceptance, not independent schema, typed API or UI scaffolding. No provisioning occurs in this planning change.
2. During a separately authorized apply workflow, add dependencies/client code, additive migration and isolated SQL/UI tests. Document configuration and owner steps. Keep hosted writes separate from local tests.
3. Owner reviews local evidence and manually applies the migration after confirming the accounts migration and helpers are deployed. App must handle absent storage until that step.
4. Owner provisions restricted provider key/style/plan and initial eligible editor UUIDs. Curator manually enters verified academic-campus records; launch data must not be synthetic. Confirm publication, second-user read-only access and revocation in owner-approved acceptance.
5. Release after map quality, responsive/accessibility and permission acceptance. Roll back by disabling/removing the Explorer entry and optionally revoking editor membership while retaining curated data; do not drop tables or change crowd storage as routine rollback.

## Prerequisites and Open Questions

The stack, authenticated audience, eligible-editor rule, publication model and confirmed hard deletion are design decisions, not deferred choices. During a separately authorized Apply, independent local schema/migration authoring, typed API work, UI scaffolding and fixture-backed checks may proceed while MapTiler credentials/style and release-only prerequisites are pending. License review must precede installing affected dependencies. Use existing local schema definitions to develop; deployed helper confirmation is a hosted-release prerequisite, not a blocker to local work. Provider-backed visual acceptance requires the key, allowed origins and approved style/plan; feedback destination, curator and editor UUIDs are needed for their corresponding release checks. Record blocked acceptance checks explicitly rather than stopping unrelated work or claiming live verification. No hosted database changes are authorized by this plan; hosted migration, grants and content writes require separate owner authorization.

### Proportional verification

Use a CSE 416 capstone-sized verification effort: prioritize direct RLS/security checks, persistence, student discovery, editor CRUD, accessibility and regressions. Use the existing SQL and Vitest/Testing Library setup. Keep database permission tests authoritative for security, focused API tests for normalization and mutation results, and a small set of component flows for discovery/editor behavior and account cleanup. Reuse fixtures and assertions across tasks; do not retest the same behavior at every layer. Manual browser checks are sufficient for real tile alignment, hover/touch behavior, narrow layouts and a representative modest dataset. Run existing regression suites, lint and build once after relevant changes; repeat only for failures or new changes. Do not add a new browser automation framework, visual snapshot service, benchmark harness, exhaustive device matrix or infrastructure solely for Explorer.

Deferrable values: exact style ID/colors and initial center/zoom, feedback form versus mailto destination, curator review interval and initial verified location inventory. These values do not change the specs or architecture. No account creation, license acceptance on behalf of the team, hosted SQL, or implementation is authorized by this planning deliverable.

Reference documentation for implementation revalidation: [React Leaflet 5 release](https://github.com/PaulLeCam/react-leaflet/tree/v5.0.0), [MapTiler Leaflet](https://docs.maptiler.com/leaflet/), [MapTiler pricing](https://www.maptiler.com/cloud/pricing/), [attribution](https://docs.maptiler.com/guides/map-design/attribution/add-attribution/), [API keys](https://docs.maptiler.com/guides/developer/credentials/api-key/), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
