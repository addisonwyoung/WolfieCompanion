# Course classmate recommendations

Recommendations are a separate dashboard feature backed by `public.course_recommendation_profiles(text)`. The function reuses the existing eligibility and same-course visibility boundary and reads the current enrollment records. It does not alter `public.find_classmates(text)`, the `classmate-discovery` requirements, or the existing roster projection.

Scores use a fixed 100-point maximum. Private or missing factors earn zero points and do not reduce the denominator; a candidate with no usable comparison fields receives 0/100.

## Manual migration

Review `supabase/migrations/202610220003_course_classmate_recommendations.sql` and apply it manually only after the existing accounts, classmate-discovery, and classmate-profile migrations are installed. This implementation does not execute SQL or contact a Supabase database.

The client calls the new RPC after the migration is available. Until then, recommendation loading reports a retryable error while the classmates roster continues to work independently.

## Local verification

`supabase/tests/course_classmate_recommendations.sql` is an isolated local Postgres test script. Run it only against the disposable local test database after `supabase/tests/bootstrap.sql` and the prerequisite migrations. It exercises caller authorization and enrollment, self/unrelated/ineligible exclusions, section deduplication, privacy-flag omission, nullable and empty public values, and function grants. It must not be pointed at a hosted Supabase project.

## Rollback

If manually applied and rollback is needed, remove only the new function with:

```sql
drop function if exists public.course_recommendation_profiles(text);
```

This leaves the existing classmate-discovery functions and policies untouched. Remove or roll back the client release separately if the function is removed.
