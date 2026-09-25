import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReportStore, levels } from '../src/crowd.js';
import { createApp } from '../src/app.js';
async function fixture(t) { const dir = await mkdtemp(join(tmpdir(), 'wolfie-')); t.after(() => rm(dir, { recursive: true, force: true })); return join(dir, 'reports.json'); }
test('store serializes writes, preserves ties/history across restart, rejects corruption', async t => {
  const file = await fixture(t); const store = new ReportStore(file, () => '2026-09-25T12:00:00.000Z'); await store.load();
  assert.equal(store.list().length, 6); assert.equal(store.detail('galleria')?.latestReport, null);
  await Promise.all(Array.from({ length: 12 }, (_, i) => store.add('galleria', 'Low', String(i))));
  const reopened = new ReportStore(file); await reopened.load();
  assert.deepEqual(reopened.detail('galleria'), store.detail('galleria'));
  assert.equal(reopened.detail('galleria')?.reports.length, 10); assert.equal(reopened.detail('galleria')?.latestReport?.note, '11');
  await writeFile(file, 'broken'); await assert.rejects(new ReportStore(file).load());
  await writeFile(file, '[{}]'); await assert.rejects(new ReportStore(file).load());
});
test('failed write does not commit and queue recovers', async t => {
  const file = await fixture(t); const store = new ReportStore(file); await store.load();
  await mkdir(file + '.tmp'); await assert.rejects(store.add('galleria', 'Full', ''));
  assert.equal(store.detail('galleria')?.latestReport, null);
  await rm(file + '.tmp', { recursive: true }); await store.add('galleria', 'Empty', ''); assert.equal(store.detail('galleria')?.latestReport?.level, 'Empty');
});
test('API validation, history, timestamps, health, and storage errors', async t => {
  const file = await fixture(t); const store = new ReportStore(file); await store.load();
  const server = createApp(store).listen(0); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  const post = (body: unknown, id = 'galleria') => fetch(`${base}/api/locations/${id}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok' });
  assert.equal((await (await fetch(base + '/api/locations')).json()).locations.length, 6);
  for (const level of levels) { const r = await post({ level, submittedAt: 'fake', id: 'fake' }); assert.equal(r.status, 201); const report = await r.json(); assert.notEqual(report.id, 'fake'); assert.ok(Number.isFinite(Date.parse(report.submittedAt))); }
  for (const note of ['', '  ', 'x'.repeat(200), '  seats  ']) assert.equal((await post({ level: 'Low', note })).status, 201);
  for (const body of [{ level: 'Wrong' }, { level: 'Low', note: 3 }, { level: 'Low', note: null }, { level: 'Low', note: 'x'.repeat(201) }, null]) assert.equal((await post(body)).status, 400);
  assert.equal((await post({ level: 'Low' }, 'missing')).status, 404); assert.equal((await fetch(base + '/api/locations/missing')).status, 404);
  for (let i = 0; i < 3; i++) await post({ level: 'Full', note: String(i) });
  const detail = await (await fetch(base + '/api/locations/galleria')).json(); assert.equal(detail.reports.length, 10); assert.equal(detail.latestReport.note, '2');
  await mkdir(file + '.tmp'); assert.equal((await post({ level: 'Empty' })).status, 500); assert.equal(store.detail('galleria')?.latestReport?.level, 'Full');
});
