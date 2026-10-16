import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDocument, diagnostic } from '../src/ocr/vision.js';
test('one document call, bounded deadline, no retries, positioned text conversion', async () => {
  let calls = 0;
  const result = await extractDocument(Buffer.from('image'), { async documentTextDetection(request, options) {
    calls++; assert.equal(request.image.content.toString(), 'image'); assert.deepEqual(options, { timeout: 30000, retry: null });
    return [{ fullTextAnnotation: { text: 'CSE 416', pages: [{ width: 100, height: 100, blocks: [{ paragraphs: [{ words: [{ symbols: [{ text: 'CSE' }], confidence: 0.9, boundingBox: { vertices: [{}, { x: 10, y: 20 }] } }] }] }] }] } }];
  } });
  assert.equal(calls, 1); assert.equal(result.text, 'CSE 416');
  assert.deepEqual(result.pages[0].blocks[0].paragraphs[0].words[0].box, [{ x: 0, y: 0 }, { x: 10, y: 20 }]);
  assert.equal(result.pages[0].blocks[0].paragraphs[0].words[0].confidence, .9);
});
test('safe actionable diagnostics and annotation errors never become empty success', async () => {
  for (const [code, phrase] of [[16, 'Authentication'], [7, 'Access denied'], [8, 'quota'], [4, 'timed out'], [3, 'PNG'], [13, 'request failed']] as const) {
    for (const annotation of [true, false]) {
      await assert.rejects(extractDocument(Buffer.alloc(1), { async documentTextDetection() {
        if (!annotation) throw { code, message: 'SECRET_TOKEN' };
        return [{ error: { code, message: 'SECRET_TOKEN' } }];
      } }), error => { assert.ok(error instanceof Error); assert.ok(error.message.includes(phrase)); assert.ok(!error.message.includes('SECRET')); return true; });
    }
  }
  assert.match(diagnostic(new Error('Could not load the default credentials')).message, /application-default login/);
});
