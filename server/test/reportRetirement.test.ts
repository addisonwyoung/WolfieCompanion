import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

async function fixture(t: TestContext, fail = false) {
  let calls = 0;
  const server = createApp({}, { list: async () => { calls++; if (fail) throw new Error('private provider failure'); return []; } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { base: `http://127.0.0.1:${address.port}`, calls: () => calls };
}

test('retired report reads and writes return 404 without touching occupancy or accepting reports', async t => {
  const { base, calls } = await fixture(t);
  for (const path of ['/api/locations', '/api/locations/galleria', '/api/locations/1', '/api/locations/missing']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /latestReport|submittedAt|locationId/);
  }
  for (const id of ['galleria', 'north-reading-room', '1', 'missing']) {
    const response = await fetch(`${base}/api/locations/${id}/reports`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level: 'Low', note: 'legacy report' }),
    });
    assert.equal(response.status, 404);
  }
  assert.equal(calls(), 0);
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok' });
  assert.deepEqual(await (await fetch(base + '/api/libraries')).json(), { libraries: [] });
  assert.equal(calls(), 1);
});

test('shared errors keep invalid-body status and use generic wording for unexpected failures', async t => {
  const { base } = await fixture(t, true);
  for (const body of ['{', JSON.stringify({ note: 'x'.repeat(9000) })]) {
    const response = await fetch(base + '/api/unknown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid request body.' });
  }
  const response = await fetch(base + '/api/libraries');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Unable to complete request. Please try again.' });
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok' });
});

test('real server entry starts with corrupt or inaccessible legacy storage and preserves existing files', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'wolfie-report-retirement-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'reports.json');
  const original = 'corrupt legacy data retained verbatim';
  await writeFile(file, original);
  // A directory cannot be read as a JSON report file; the retired setting is ignored.
  for (const path of [file, dir, join(dir, 'absent', 'reports.json')]) {
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../src/index.ts', import.meta.url))], {
      env: { ...process.env, PORT: '0', NODE_ENV: 'test', ENABLE_SCHEDULE_PREVIEW: '0', CROWD_REPORTS_PATH: path },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = once(child, 'exit');
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
        let output = '';
        child.stdout.on('data', data => { output += data; if (output.includes('Wolfie API ready')) { clearTimeout(timer); resolve(); } });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited before ready: ${code}`)); });
      });
    } finally { child.kill(); await exited; }
  }
  assert.equal(await readFile(file, 'utf8'), original);
  assert.deepEqual(await readdir(dir), ['reports.json']);
});
