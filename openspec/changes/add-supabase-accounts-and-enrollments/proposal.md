# Proposal

Compatibility: this proposal records the account change's original fictional-roster baseline. The subsequent `real-classmate-discovery` change supersedes that baseline with limited name/major discovery through a restricted RPC, preserving owner-only table RLS and separate fixtures. Sync/archive accounts before discovery.

## Why

Wolfie Companion currently resets profile edits and imported classes on reload. Students need a personal account that restores their information and courses across visits and devices before these features can support real usage.

## What Changes

- Add Google account creation/sign-in through Supabase Auth, verified Stony Brook email eligibility, session restoration, and sign-out.
- Provide editable name, major, year, interests, commuter/dormer status, and profile picture, persisted in Supabase Postgres and Storage.
- Persist user-owned course/section enrollment and automatically restore it after sign-in. Save only explicitly confirmed schedule rows; provide manual class entry without requiring OCR.
- Add database constraints, row-level security, private avatar storage, and account-specific loading/error states.
- **BREAKING**: Replace the root dashboard's anonymous, reset-on-reload sample identity and fixed courses with authenticated user data. Keep fictional classmates clearly labeled and separate from private account data; real classmate discovery is outside this change.
- Reconcile the existing schedule-upload-preview planning contract: extraction remains temporary, while an explicit confirmation saves reviewed course/section pairs. Production OCR enablement remains outside scope.

## Capabilities

### New Capabilities

- `user-auth`: Google sign-in, account eligibility, session lifecycle, and data isolation.
- `student-profile`: Editable and persistent student details and avatar lifecycle.
- `user-enrollments`: User-owned course/section persistence, reviewed import/manual entry, and automatic restoration.

### Modified Capabilities

- `prototype-dashboard`: Replace sample-only shell, sample profile, and fixed course selection with authenticated data while retaining explicitly fictional classmate demonstrations.

## Impact

Client: `App.tsx`, `Profile.tsx`, `CourseBrowser.tsx`, `ScheduleImportPreview.tsx`, sample-data types, styles, and tests. Add a Supabase client dependency, auth/data modules, database migrations, policy tests, and environment/setup documentation. Supabase needs Google provider configuration, allowed redirects, Postgres tables/policies, and a private avatar bucket. Existing Express crowd/evaluation features and development-only OCR restrictions remain unchanged. No deployed resources or application code are changed by this proposal.
