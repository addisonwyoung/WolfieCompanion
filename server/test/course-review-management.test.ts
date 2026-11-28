import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { courseReviewRouter } from '../src/courseReviewModeration.js';

const ownerReviewId = '10000000-0000-0000-0000-000000000001';
const otherReviewId = '10000000-0000-0000-0000-000000000002';
const originalRows = [
  { id: ownerReviewId, offering_id: 'cse-416-fall-2024', user_id: 'student-a', weekly_hours: 8, difficulty: 3, class_rating: 5, would_recommend: true, review: 'Past review', moderation_status: 'appropriate', created_at: '2024-12-01T00:00:00Z' },
  { id: otherReviewId, offering_id: 'bio-201-spring-2025', user_id: 'student-b', weekly_hours: 12, difficulty: 4, class_rating: 3, would_recommend: false, review: 'Another student review', moderation_status: 'appropriate', created_at: '2025-05-01T00:00:00Z' },
];

async function fixture(t: TestContext, classify = async () => ({ classification: 'appropriate' as const, confidence: 'high' as const, reason: 'none' })) {
  const rows = originalRows.map(row => ({ ...row }));
  const serviceQueries: { table: string; columns: string; filters: [string, unknown][]; operation: string }[] = [];
  let insertId = 3;
  const fakeCreateClient = ((_: string, key: string) => key === 'publishable-key' ? {
    auth: { getUser: async (token: string) => ({ data: { user: token === 'token-a' ? { id: 'student-a' } : token === 'token-b' ? { id: 'student-b' } : null }, error: token === 'invalid-token' ? new Error('invalid') : null }) },
    rpc: async () => ({ data: true, error: null }),
  } : {
    from(table: string) {
      const call = { table, columns: '', filters: [] as [string, unknown][], operation: 'select' };
      serviceQueries.push(call);
      let update: Record<string, unknown> = {};
      let insert: Record<string, unknown> = {};
      const matches = () => rows.filter(row => call.filters.every(([column, value]) => row[column as keyof typeof row] === value));
      const execute = (single = false) => {
        if (table === 'course_enrollments') return { data: { id: 'verified-enrollment' }, error: null };
        const matched = matches();
        if (call.operation === 'update') {
          if (!matched[0]) return { data: null, error: null };
          Object.assign(matched[0], update);
          return { data: matched[0], error: null };
        }
        if (call.operation === 'delete') {
          if (!matched[0]) return { data: null, error: null };
          rows.splice(rows.indexOf(matched[0]), 1);
          return { data: matched[0], error: null };
        }
        if (call.operation === 'insert') {
          rows.push({ id: `10000000-0000-0000-0000-00000000000${insertId++}`, created_at: '2026-11-25T00:00:00Z', ...insert });
          return { data: null, error: null };
        }
        const projected = matched.map(row => Object.fromEntries(call.columns.split(',').filter(Boolean).map(column => [column, row[column as keyof typeof row]])));
        return { data: single ? projected[0] ?? null : projected, error: null };
      };
      const builder: Record<string, unknown> = {
        select(columns: string) { call.columns = columns; return builder; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return builder; },
        is(column: string, value: unknown) { call.filters.push([column, value]); return builder; },
        order() { return builder; },
        update(value: Record<string, unknown>) { call.operation = 'update'; update = value; return builder; },
        delete() { call.operation = 'delete'; return builder; },
        insert(value: Record<string, unknown>) { call.operation = 'insert'; insert = value; return builder; },
        maybeSingle() { return Promise.resolve(execute(true)); },
        then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) { return Promise.resolve(execute()).then(resolve, reject); },
      };
      return builder;
    },
  }) as unknown as typeof createClient;
  const app = express();
  app.use(express.json());
  app.use('/api/course-reviews', courseReviewRouter({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'publishable-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }, { createClient: fakeCreateClient, classify }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { baseUrl: `http://127.0.0.1:${address.port}/api/course-reviews`, rows, serviceQueries };
}

const auth = (token = 'token-a') => ({ Authorization: `Bearer ${token}` });
const reviewInput = { weeklyHours: 10, difficulty: 4, classRating: 4, wouldRecommend: false, review: 'Updated review' };

test('owner review history is authenticated, scoped to the caller, and omits reviewer IDs', async t => {
  const { baseUrl, serviceQueries } = await fixture(t);
  const response = await fetch(`${baseUrl}/mine`, { headers: auth() });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json() as { reviews: Record<string, unknown>[] };
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].id, ownerReviewId);
  assert.equal(result.reviews[0].offering_id, 'cse-416-fall-2024');
  assert.equal(result.reviews[0].review, 'Past review');
  assert.equal('user_id' in result.reviews[0], false);
  assert.equal(serviceQueries[0].table, 'course_reviews');
  assert.match(serviceQueries[0].columns, /id,offering_id,weekly_hours,difficulty,class_rating,would_recommend,review,moderation_status,created_at/);
  assert.deepEqual(serviceQueries[0].filters, [['user_id', 'student-a']]);
});

test('owner review history rejects unauthenticated requests without querying private rows', async t => {
  const { baseUrl, serviceQueries } = await fixture(t);
  const response = await fetch(`${baseUrl}/mine`);
  assert.equal(response.status, 401);
  assert.deepEqual(serviceQueries, []);
});

test('updates only the authenticated owner review and keeps offering and owner immutable', async t => {
  const { baseUrl, rows, serviceQueries } = await fixture(t);
  const response = await fetch(`${baseUrl}/${ownerReviewId}`, {
    method: 'PATCH', headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...reviewInput, offeringId: 'other-offering', user_id: 'student-b' }),
  });
  assert.equal(response.status, 200);
  const result = await response.json() as { review: Record<string, unknown> };
  assert.equal(result.review.offering_id, 'cse-416-fall-2024');
  assert.equal(result.review.weekly_hours, 10);
  assert.equal(result.review.review, 'Updated review');
  assert.equal(rows[0].user_id, 'student-a');
  assert.deepEqual(serviceQueries.at(-1)?.filters, [['id', ownerReviewId], ['user_id', 'student-a']]);
  assert.equal(serviceQueries.at(-1)?.operation, 'update');
});

test('rejects invalid edits and cannot edit another owner review', async t => {
  const { baseUrl, rows, serviceQueries } = await fixture(t);
  const invalid = await fetch(`${baseUrl}/${ownerReviewId}`, {
    method: 'PATCH', headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...reviewInput, difficulty: 6 }),
  });
  assert.equal(invalid.status, 400);
  const other = await fetch(`${baseUrl}/${otherReviewId}`, {
    method: 'PATCH', headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(reviewInput),
  });
  assert.equal(other.status, 404);
  assert.deepEqual(rows[0].review, 'Past review');
  assert.equal(serviceQueries.at(-1)?.filters.at(-1)?.[1], 'student-a');
});

test('keeps an existing review unchanged when moderation fails', async t => {
  const { baseUrl, rows } = await fixture(t, async () => { throw new Error('moderation unavailable'); });
  const response = await fetch(`${baseUrl}/${ownerReviewId}`, {
    method: 'PATCH', headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(reviewInput),
  });
  assert.equal(response.status, 503);
  assert.equal(rows[0].review, 'Past review');
  assert.equal(rows[0].weekly_hours, 8);
});

test('deletes only the owner review and allows the owner to submit again', async t => {
  const { baseUrl, rows, serviceQueries } = await fixture(t);
  const forbidden = await fetch(`${baseUrl}/${ownerReviewId}`, { method: 'DELETE', headers: auth('token-b') });
  assert.equal(forbidden.status, 404);
  const deleted = await fetch(`${baseUrl}/${ownerReviewId}`, { method: 'DELETE', headers: auth() });
  assert.equal(deleted.status, 204);
  assert.equal(rows.some(row => row.id === ownerReviewId), false);
  assert.deepEqual(serviceQueries.at(-1)?.filters, [['id', ownerReviewId], ['user_id', 'student-a']]);
  const resubmitted = await fetch(baseUrl, {
    method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ offeringId: 'cse-416-fall-2024', ...reviewInput }),
  });
  assert.equal(resubmitted.status, 201);
  assert.equal(rows.filter(row => row.user_id === 'student-a' && row.offering_id === 'cse-416-fall-2024').length, 1);
});
