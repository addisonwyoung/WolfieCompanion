# Proposal

## Why

Students can find classmates who share a saved course, but they cannot create a persistent study group or compare recurring free time together.

## What Changes

- Allow a student to create a course-specific group and invite up to seven eligible classmates who share that course.
- Let invitees accept or decline; accepted members can save their own recurring weekly availability and leave a group.
- Show group availability only to accepted members and calculate windows long enough for a chosen meeting duration.
- Keep the feature on its own Study buddies page and reuse the existing classmate-discovery boundary.

## Capabilities

### New Capabilities
- `study-buddy-groups`: Persistent course study groups, invitations, private member availability, and shared-time calculation.

### Modified Capabilities
- None. Existing classmate discovery and study-space crowd reporting remain unchanged.

## Impact

- Client: `StudyGroups.tsx`, a typed Supabase RPC client, schedule intersection logic, and a new Study buddies navigation page.
- Supabase: owner-reviewed migration with group, membership, and availability tables plus authenticated RPCs.
- The migration is a handoff only; do not apply it to shared Supabase as part of implementation.
