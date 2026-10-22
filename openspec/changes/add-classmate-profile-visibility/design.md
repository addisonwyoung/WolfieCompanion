# Design

## Context

See proposal.md for motivation. `CourseBrowser.tsx` renders inert name/major cards. `find_classmates` already returns account UUIDs and checks trusted Google student eligibility and shared normalized course membership. Owner profile editing includes year, interests, residence, and an avatar; profiles and Storage are owner-only. Existing avatar uploads use an authenticated Node endpoint and a caller-scoped Supabase client, without service credentials. Current discovery specs explicitly prohibit extra details and visibility controls; this delta replaces those restrictions while retaining the roster contract.

## Goals / Non-Goals

**Goals:** Separate owner data from a minimal peer projection; persist explicit opt-in flags; authorize every profile/picture request; make the roster-to-profile interaction accessible and resilient to account/course changes.

**Non-Goals:** Messaging infrastructure or buttons, public profiles, verified enrollment, semester matching, enrollment removal, realtime updates, and requiring majors on existing accounts.

## Decisions

1. **Persist four non-null boolean flags on profiles**, default false: `share_year`, `share_interests`, `share_residence_status`, `share_avatar`. Extend `StudentProfile`, account save/load, and `Profile.tsx` with independent checkboxes beside optional fields and fixed Name/Major sharing copy. Save values and flags in the same profile update; cancel discards both. Existing owner RLS already protects updates. Dedicated settings tables would add joins and extra atomic-save coordination for four fixed fields. Treat absent flags in transitional client data as false.

2. **Keep `find_classmates` unchanged; add a detail RPC** taking selected course code and peer UUID. Derive caller from `auth.uid()`, reuse normalization/eligibility rules, check both memberships, reject self, and return an allowlisted JSON projection. Always return `student_id`, `name`, and nullable `major`; add optional keys only when shared. For a shared but empty value, return null or an empty interests array. Return `has_shared_avatar` as a boolean only, with no object path. Use a tightly granted security-definer function with empty search path. Do not broaden table RLS or select full peer records in browser code. Expanding the roster RPC would unnecessarily preload optional details for every peer.

3. **Serve peer picture bytes through an authenticated Node endpoint** accepting course and peer UUID, never an arbitrary path. Verify the bearer token with Supabase Auth; call the caller-scoped detail authorization first. A separate service-role-only resolver must independently recheck caller identity eligibility, both course memberships, current picture-sharing flag, and saved avatar path before returning that path to the server. Only this resolver accepts an explicit caller UUID, taken from verified Auth, and its execute privilege is denied to public/anon/authenticated. The server then downloads the current private object using a server-only Supabase service-role credential and responds with an allowlisted image content type and `Cache-Control: private, no-store`. Do not return paths or signed URLs or log credentials/paths. Existing owner Storage policies and upload flow remain unchanged. Alternatives: peer Storage SELECT permits reusable signed URLs; public buckets defeat revocation; a new privileged proxy requires careful credential handling but keeps authorization and byte access restricted. Add the service credential only to server deployment secrets; missing configuration fails closed for pictures while text profiles still work.

4. **Use a read-only modal dialog** from an explicit View profile button in each card. Keep selected course and roster mounted beneath it. Give the dialog a title, focus trap, Escape/close handling, and focus restoration. Reuse `Interests` and `Avatar` display components, not the owner editor. Omit private sections; show placeholders for shared-but-empty values and initials for unavailable pictures. No messaging button; preserve the account UUID on the detail model as a future recipient identity.

5. **Key detail requests by account, course, peer, and retry attempt**, following `useClassmates` stale-response masking. Clear selection on course/account/auth/view changes; mask data synchronously before effects. Reopen/refetch rather than cache profile details. Use authenticated fetch for picture blobs; revoke object URLs on changes/close. Abort obsolete requests and ignore late completions. Network errors get Retry; inaccessible/unknown targets get generic Profile unavailable and Close. A picture-only failure leaves text visible. No realtime guarantee: changed sharing takes effect on subsequent authorized requests, and already delivered bytes cannot be recalled.

## Risks / Trade-offs

- Service credential expands server privilege → isolate it to the picture resolver/download path, authenticate before use, restrict resolver grants, add denial tests, and never ship it to Vite/browser configuration.
- Sharing changes after text load or during picture download → recheck at picture resolution; future requests fail after revocation, but in-flight or previously delivered bytes cannot be recalled.
- Existing users may assume all profile data is private → leave optional flags false and clearly explain mandatory name/major visibility and the audience.
- Shared courses are self-reported and may be stale → retain explicit limitation copy; this change does not establish official enrollment.
- Existing SQL tests assert all policies/ACLs unchanged → retain those guarantees for existing objects; add explicit assertions for new resolver grants and default-private projection.

## Migration Plan

1. Implement an additive migration after accounts/discovery: false-default flags, detail RPC, and service-only avatar resolver. Exercise it only in an isolated local database with synthetic accounts.
2. Update setup documentation for owner review/manual SQL application and server-only credential configuration. No automatic shared database migration.
3. Owner applies migration, configures server secret, deploys server endpoint, then client. Old clients retain their exact name/major roster contract. New-client/missing-migration errors remain retryable and fail closed.
4. Verify using two eligible accounts: independent sharing choices, reload persistence, unrelated-account denial, picture revocation/replacement, and sign-out cleanup. Record live acceptance separately from mocks/local SQL.
5. Roll back client/server, revoke new function execution through owner-reviewed SQL, and retain profile data/settings. Do not roll back to broader avatar policies or delete account data.
