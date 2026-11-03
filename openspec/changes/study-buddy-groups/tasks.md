# Tasks

## Data and authorization

- [x] Add group, membership, and availability schema with constraints and private access.
- [x] Add RPCs for group creation, invitation response, member listing, availability updates, and leaving.
- [ ] Add database verification for authorization, consent, ownership transfer, and private availability behavior.
- [x] Add member-assigned project roles and a shared task board with accepted-member authorization.
- [ ] Add database verification for role permissions, task visibility, task limits, and task deletion permissions.

## Client experience

- [x] Add typed group API with response validation.
- [x] Add course-based classmate invitations and persistent invitation/group views.
- [x] Add recurring availability editor and shared-window calculation by meeting length.
- [x] Accept minute-level availability times in the editor and database validation.
- [x] Prevent duplicate availability windows from appearing in the editor.
- [x] Replace preset meeting lengths with a flexible 1–1,440 minute input.
- [ ] Apply the minute-precision availability migrations to the shared Supabase project.
- [x] Integrate the Study buddies page with current navigation while preserving Study spaces.
- [x] Add member role controls and persistent shared tasks/notes with completion state.

## Handoff

- [x] Document requirements, privacy rules, and manual migration workflow.
- [x] Review client production build; manual flow verification remains for after applying the migration in a non-production environment.
- [ ] Apply `202611010003_study_group_roles_and_tasks.sql` after the section-scoped group migration and verify with multiple accepted accounts.
