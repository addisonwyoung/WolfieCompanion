import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LibraryOccupancy, libraryCatalog } from '../src/libraryOccupancy.js';
import { createApp } from '../src/app.js';

const start = Date.parse('2026-11-24T12:00:00Z');
const minute = 60_000;
const json = (body: unknown) => new Response(JSON.stringify(body));
const idOf = (url: string | URL | Request) => Number(new URL(String(url)).searchParams.get('id'));

test('catalog, valid zero, rounding thresholds, over-capacity and absolute expiry fields', async () => {
  const populations = [0, 150, 177, 89, 450];
  const service = new LibraryOccupancy({ now: () => start,
    fetch: async url => json({ population: populations[idOf(url) - 1] }) });
  const rows = await service.list();
  assert.deepEqual(rows.map(({ id, name, capacity }) => ({ id, name, capacity })), libraryCatalog);
  assert.deepEqual(rows.map(r => [r.percentage, r.crowdLevel]),
    [[0, 'Low'], [50, 'Low'], [51, 'Moderate'], [81, 'Busy'], [100, 'Busy']]);
  assert.equal(rows[4].population, 450); // exactly 1.5x remains valid
  assert.equal(rows[4].estimatedRemainingCapacity, 0);
  for (const row of rows) {
    assert.equal(row.status, 'fresh');
    assert.equal(row.retrievedAt, new Date(start).toISOString());
    assert.equal(row.freshUntil, new Date(start + 5 * minute).toISOString());
    assert.equal(row.usableUntil, new Date(start + 30 * minute).toISOString());
  }
  for (const [population, percentage, crowdLevel] of [[720, 80, 'Moderate'], [725, 81, 'Busy'], [454, 50, 'Low'], [455, 51, 'Moderate']] as const) {
    const service = new LibraryOccupancy({ fetch: async () => json({ population }) });
    assert.deepEqual((await service.list()).slice(0, 1).map(r => [r.percentage, r.crowdLevel]), [[percentage, crowdLevel]]);
  }
});

test('invalid provider values are unavailable, including strictly above SBU anomaly boundary', async () => {
  for (const body of [null, [], {}, { population: null }, { population: '0' }, { population: false },
    { population: -1 }, { population: 1351 }]) {
    const service = new LibraryOccupancy({ fetch: async () => json(body) });
    const row = (await service.list())[0];
    assert.equal(row.status, 'unavailable');
    for (const key of ['population', 'percentage', 'crowdLevel', 'estimatedRemainingCapacity', 'retrievedAt', 'freshUntil', 'usableUntil']) {
      assert.equal(row[key], null);
    }
  }
  for (const population of [NaN, Infinity, -Infinity]) {
    const service = new LibraryOccupancy({ fetch: async () => ({ ok: true, json: async () => ({ population }) }) as Response });
    assert.equal((await service.list())[0].status, 'unavailable');
  }
});

test('concurrent misses deduplicate all five requests and freshness expires on demand', async () => {
  let now = start, calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const service = new LibraryOccupancy({ now: () => now, fetch: async () => { calls++; await gate; return json({ population: 10 }); } });
  const first = service.list(), second = service.list();
  assert.equal(calls, 5);
  release();
  assert.deepEqual(await first, await second);
  now += 5 * minute - 1;
  await service.list(); assert.equal(calls, 5);
  now++;
  assert.equal(calls, 5); // expiration alone does nothing
  await service.list(); assert.equal(calls, 10);
});

test('failure preserves retrieval age, cooldown deduplicates failures, stale limit is bounded and recovery works', async () => {
  let now = start, failing = false, calls = 0;
  const service = new LibraryOccupancy({ now: () => now, fetch: async () => {
    calls++; if (failing) throw new Error('offline'); return json({ population: 12 });
  } });
  await service.list(); failing = true; now += 5 * minute;
  const stale = (await service.list())[0];
  assert.equal(stale.status, 'stale'); assert.equal(stale.retrievedAt, new Date(start).toISOString());
  await service.list(); assert.equal(calls, 10);
  now += 30_000; await service.list(); assert.equal(calls, 15);
  now = start + 30 * minute;
  assert.equal((await service.list())[0].status, 'stale');
  now++; // cooldown still active, but expired values must disappear
  const unavailable = (await service.list())[0];
  assert.equal(unavailable.status, 'unavailable'); assert.equal(unavailable.population, null);
  assert.equal(unavailable.percentage, null); assert.equal(unavailable.estimatedRemainingCapacity, null);
  assert.equal(calls, 20);
  failing = false; now += 30_000;
  const recovered = (await service.list())[0];
  assert.equal(recovered.status, 'fresh'); assert.equal(recovered.retrievedAt, new Date(now).toISOString());
});

test('HTTP, malformed JSON and anomaly failures remain isolated and retry after cooldown', async () => {
  let now = start, bad = true;
  const service = new LibraryOccupancy({ now: () => now, fetch: async url => {
    if (bad && idOf(url) === 1) return new Response('upstream error', { status: 503 });
    if (bad && idOf(url) === 2) return new Response('<html>not JSON');
    if (bad && idOf(url) === 3) return json({ population: 526 });
    return json({ population: 0 });
  } });
  assert.deepEqual((await service.list()).map(r => r.status), ['unavailable', 'unavailable', 'unavailable', 'fresh', 'fresh']);
  bad = false; now += 30_000;
  assert.ok((await service.list()).every(r => r.status === 'fresh'));
});

test('timeout aborts pending fetch and clears in-flight entries for recovery without real waits', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = start, stalled = true, calls = 0;
  const service = new LibraryOccupancy({ now: () => now, fetch: async (_url, init) => {
    calls++;
    if (!stalled) return json({ population: 1 });
    return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  const pending = service.list();
  t.mock.timers.tick(5000);
  assert.ok((await pending).every(r => r.status === 'unavailable'));
  stalled = false; now += 30_000;
  assert.ok((await service.list()).every(r => r.status === 'fresh'));
  assert.equal(calls, 10);
});

test('timeout includes reading the response body and late success cannot commit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const service = new LibraryOccupancy({ fetch: async (_url, init) => ({ ok: true, json: async () => {
    await gate;
    assert.equal(init!.signal!.aborted, true);
    return { population: 20 };
  } }) as Response });
  const pending = service.list();
  await Promise.resolve();
  t.mock.timers.tick(5000); finish();
  assert.ok((await pending).every(r => r.status === 'unavailable'));
});

test('snapshots use response-time age when another room holds the batch open', async () => {
  let now = start, count = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const service = new LibraryOccupancy({ now: () => now, fetch: async url => {
    count++;
    if (idOf(url) === 5) await gate;
    return json({ population: 1 });
  } });
  const pending = service.list();
  // Let the first four successful bodies commit before changing the injected clock.
  while (count < 5) await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  now += 31 * minute; release();
  assert.deepEqual((await pending).map(r => r.status), ['unavailable', 'unavailable', 'unavailable', 'unavailable', 'fresh']);
});

test('GET route uses shared service, no-store and fixed upstream requests without caller credentials', async t => {
  const requests: { url: URL; init: RequestInit }[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const service = new LibraryOccupancy({ now: () => start, fetch: async (url, init) => {
    requests.push({ url: new URL(String(url)), init: init! }); await gate;
    return json({ population: idOf(url) === 3 ? null : 0 });
  } });
  const server = createApp({}, service).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const query = '/api/libraries?url=https://attacker.invalid&endpoint=histogram&id=999';
  const pending = fetch(base + query, { headers: { Authorization: 'Bearer private', Cookie: 'secret=private' } });
  while (requests.length < 5) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok' });
  for (const { url, init } of requests) {
    assert.equal(url.origin, 'https://library.stonybrook.edu');
    assert.equal(url.pathname, '/api/proxy.php'); assert.equal(url.searchParams.get('endpoint'), 'population');
    assert.ok([1, 2, 3, 4, 5].includes(Number(url.searchParams.get('id'))));
    assert.deepEqual(init.headers, { Accept: 'application/json' });
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
  }
  release();
  const response = await pending;
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.libraries.length, 5);
  assert.equal(body.libraries[2].status, 'unavailable');
  assert.equal(body.libraries[0].population, 0);
  await fetch(base + '/api/libraries'); assert.equal(requests.length, 5);
  assert.equal((await fetch(base + '/api/libraries/999')).status, 404);
  assert.equal(requests.length, 5);
});
