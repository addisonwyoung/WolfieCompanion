import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LibraryOccupancy } from '../src/libraryOccupancy.js';
import { createApp } from '../src/app.js';

const start = Date.parse('2026-11-24T12:00:00Z');
const json = (body: unknown) => new Response(JSON.stringify(body));
function histogram(id = 1) {
  return { room_id: id, day_offset: 0, weeks: id <= 3 ? '52' : id === 4 ? '48,49,50' : '49,50,51', bucket_minutes: 60, bucket_count: 24,
    data: Array.from({ length: 24 }, (_, index) => {
      const hour = (16 + index) % 24;
      return { hour_num: hour, hour: 'unused display label', datetime: `2026-11-${index < 8 ? '17' : '18'} ${String(hour).padStart(2, '0')}:00:00`, count: index * 20 };
    }) };
}

test('history keeps ordered reference hours, zero, missing and above-capacity values without averaging', async () => {
  const body = histogram(); body.data[1]!.count = null as unknown as number; body.data[2]!.count = 1000;
  const service = new LibraryOccupancy({ now: () => start, fetch: async () => json(body) });
  const result = await service.history(1); assert.ok(result);
  assert.equal(result.status, 'available');
  assert.deepEqual(result.buckets.map(bucket => bucket.hour), body.data.map(bucket => bucket.hour_num));
  assert.equal(result.buckets[0]!.percentage, 0);
  assert.equal(result.buckets[1]!.percentage, null);
  assert.equal(result.buckets[2]!.percentage, 1000 / 900 * 100);
  assert.equal(result.buckets[2]!.count, 1000);
  assert.equal(result.buckets[8]!.referenceDateTime, '2026-11-18 00:00:00');
  assert.equal(Date.parse(result.expiresAt!) - Date.parse(result.retrievedAt!), 3_600_000);
});

test('history deduplicates and caches per room for one hour independently of live freshness', async () => {
  let now = start, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  const service = new LibraryOccupancy({ now: () => now, fetch: async url => {
    const parsed = new URL(String(url)); const endpoint = parsed.searchParams.get('endpoint')!; calls.push(endpoint);
    if (endpoint === 'population') return json({ population: 1 });
    await gate; return json(histogram(Number(parsed.searchParams.get('id'))));
  } });
  const first = service.history(1), second = service.history(1);
  assert.equal(calls.length, 1);
  assert.ok((await service.list()).every(row => row.status === 'fresh')); // history still pending
  release(); assert.deepEqual(await first, await second);
  await service.history(2); assert.equal(calls.filter(value => value === 'histogram').length, 2);
  now += 300_000; await service.list();
  await service.history(1); assert.equal(calls.filter(value => value === 'histogram').length, 2);
  now = start + 3_600_000 - 1; await service.history(1);
  assert.equal(calls.filter(value => value === 'histogram').length, 2);
  now++; assert.equal(calls.filter(value => value === 'histogram').length, 2); // no background work
  const refreshed = await service.history(1);
  assert.equal(calls.filter(value => value === 'histogram').length, 3);
  assert.equal(refreshed?.retrievedAt, new Date(now).toISOString());
});

test('invalid metadata/order or all missing data returns unavailable; invalid counts become gaps', async () => {
  const invalid = [null, {}, { ...histogram(), room_id: 2 }, { ...histogram(), weeks: '1,2,3,4' }, { ...histogram(), weeks: '48,49,50' },
    { ...histogram(), day_offset: 1 }, { ...histogram(), bucket_minutes: 30 }, { ...histogram(), data: [] }];
  const reversed = histogram(); reversed.data.reverse(); invalid.push(reversed);
  const duplicate = histogram(); duplicate.data[1] = duplicate.data[0]!; invalid.push(duplicate);
  const missing = histogram(); missing.data.forEach(row => { row.count = null as unknown as number; }); invalid.push(missing);
  for (const value of invalid) {
    const service = new LibraryOccupancy({ fetch: async () => json(value) });
    const result = await service.history(1);
    assert.equal(result?.status, 'unavailable'); assert.deepEqual(result?.buckets, []); assert.equal(result?.retrievedAt, null);
  }
  const mixed = histogram();
  for (const [index, value] of [null, -1, '0', Infinity].entries()) mixed.data[index]!.count = value as number;
  const result = await new LibraryOccupancy({ fetch: async () => json(mixed) }).history(1);
  assert.equal(result?.status, 'available'); assert.ok(result?.buckets.slice(0, 4).every(bucket => bucket.percentage === null));
});

test('history errors/cooldown never change live cache, expired history is not silently returned, recovery works', async () => {
  let now = start, failure = false, histories = 0, live = 0;
  const service = new LibraryOccupancy({ now: () => now, fetch: async url => {
    if (new URL(String(url)).searchParams.get('endpoint') === 'population') { live++; return json({ population: 1 }); }
    histories++; return failure ? new Response('<html>failure</html>') : json(histogram());
  } });
  await service.history(1); now += 3_600_000; const readings = await service.list(); failure = true;
  assert.equal((await service.history(1))?.status, 'unavailable');
  await service.history(1); assert.equal(histories, 2);
  assert.deepEqual(await service.list(), readings); assert.equal(live, 5);
  now += 30_000; failure = false;
  assert.equal((await service.history(1))?.status, 'available'); assert.equal(histories, 3);
});

test('history times out including response body and pending requests recover after cooldown', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = start, stalled = true;
  const service = new LibraryOccupancy({ now: () => now, fetch: async (_url, init) => {
    if (!stalled) return json(histogram());
    return { ok: true, json: () => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('timeout')))) } as Response;
  } });
  const pending = service.history(1); await Promise.resolve(); t.mock.timers.tick(5000);
  assert.equal((await pending)?.status, 'unavailable');
  now += 30_000; stalled = false; assert.equal((await service.history(1))?.status, 'available');
});

test('route validates ID before requests, fixes upstream parameters, ignores client URLs and sends no credentials', async t => {
  const calls: { url: URL; init: RequestInit }[] = [];
  const service = new LibraryOccupancy({ fetch: async (url, init) => {
    calls.push({ url: new URL(String(url)), init: init! }); return json(histogram());
  } });
  const server = createApp({}, service, service).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  for (const id of ['0', '6', '01', 'NaN']) assert.equal((await fetch(`${base}/api/libraries/${id}/history`)).status, 404);
  assert.equal(await service.history(999), undefined); assert.equal(calls.length, 0);
  const response = await fetch(`${base}/api/libraries/1/history?weeks=1,2,3,4&url=https://example.com`, { headers: { Authorization: 'Bearer private', Cookie: 'private=secret' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).status, 'available');
  const { url, init } = calls[0]!;
  assert.equal(url.origin, 'https://library.stonybrook.edu'); assert.equal(url.pathname, '/api/proxy.php');
  assert.deepEqual(Object.fromEntries(url.searchParams), { endpoint: 'histogram', id: '1', dayOffset: '0', bucketMinutes: '60', bucketCount: '24', weeks: '52' });
  assert.deepEqual(init.headers, { Accept: 'application/json' }); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
  await fetch(`${base}/api/libraries/1/history`); assert.equal(calls.length, 1);
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok' }); assert.equal(calls.length, 1);
});

test('each room uses its official reference weeks with independent cached metadata and deduplication', async () => {
  const selections = ['52', '52', '52', '48,49,50', '49,50,51'];
  const calls: { id: number; weeks: string | null }[] = [];
  const service = new LibraryOccupancy({ fetch: async url => {
    const params = new URL(String(url)).searchParams;
    const id = Number(params.get('id'));
    calls.push({ id, weeks: params.get('weeks') });
    return json(histogram(id));
  } });
  const first = await Promise.all([1, 2, 3, 4, 5].flatMap(id => [service.history(id), service.history(id)]));
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map(call => call.weeks), selections);
  for (let index = 0; index < first.length; index++) {
    const row = first[index]!;
    assert.equal(row.id, Math.floor(index / 2) + 1);
    assert.equal(row.status, 'available');
    assert.equal(row.weeks, selections[row.id - 1]);
    const cached = await service.history(row.id);
    assert.deepEqual(cached, row);
  }
  assert.equal(calls.length, 5);
});

test('a wrong room-specific provider selection is unavailable with authoritative metadata', async () => {
  for (const id of [1, 2, 3, 4, 5]) {
    const body = histogram(id);
    body.weeks = id <= 3 ? '48,49,50' : '52';
    const service = new LibraryOccupancy({ fetch: async () => json(body) });
    const result = await service.history(id);
    assert.equal(result?.status, 'unavailable');
    assert.equal(result?.weeks, histogram(id).weeks);
  }
});
