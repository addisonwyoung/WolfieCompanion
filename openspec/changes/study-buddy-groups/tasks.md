# Tasks

## Data and authorization

- [x] Add group, membership, and availability schema with constraints and private access.
- [x] Add RPCs for group creation, invitation response, member listing, availability updates, and leaving.
- [ ] Add database verification for authorization, consent, ownership transfer, and private availability behavior.

## Client experience

- [x] Add typed group API with response validation.
- [x] Add course-based classmate invitations and persistent invitation/group views.
- [x] Add recurring availability editor and shared-window calculation by meeting length.
- [x] Accept minute-level availability times in the editor and database validation.
- [x] Prevent duplicate availability windows from appearing in the editor.
- [x] Replace preset meeting lengths with a flexible 1–1,440 minute input.
- [ ] Apply the minute-precision availability migrations to the shared Supabase project.
- [x] Integrate the Study buddies page with current navigation while preserving Study spaces.

## Handoff

- [x] Document requirements, privacy rules, and manual migration workflow.
- [x] Review client production build; manual flow verification remains for after applying the migration in a non-production environment.
