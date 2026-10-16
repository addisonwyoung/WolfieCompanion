import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchedule } from '../src/ocr/parser.js';
import { box, document, classList, calendar } from './fixtures/schedule-ocr/documents.js';
test('class-list merges lecture/lab and retains normalized codes, term and evidence', () => {
  const r = parseSchedule(classList, 'class-list');
  assert.deepEqual(r.classes.map(c => c.code), ['CSE 416', 'AMS 210']);
  assert.deepEqual(r.classes[0].term, { semester:'Fall',year:2026 });
  assert.deepEqual(r.classes[0].sections, [{label:'01',component:'lecture'}, {label:'L02',component:'lab'}]);
  assert.equal(r.classes[0].evidence.length, 2); assert.equal(r.rawText, classList.text);
  assert.ok(r.classes.every(c=>c.verification==='unverified')); assert.equal(r.requiresReview,true);
});
test('calendar groups multiline block labels and deduplicates meetings', () => {
  const r = parseSchedule(calendar, 'weekly-calendar');
  assert.equal(r.classes.length,2); assert.equal(r.classes[0].evidence.length,2);
  assert.deepEqual(r.classes[0].sections,[{label:'01',component:'lecture'}]);
});
test('grammar, unsupported suffixes, ambiguous code and conservative fallback', () => {
  const text = 'cse416\nCSE-416\nCSE 416\nXCSE4169\nCSE 4I6\nBIO 201A\nCSE 416 LEC 03 Fall 2026';
  const r = parseSchedule({text,pages:[]},'class-list');
  assert.deepEqual(r.classes.map(c=>c.code),['CSE 416']); assert.equal(r.classes[0].evidence.length,4);
  assert.equal(r.classes[0].term,null); assert.deepEqual(r.classes[0].sections,[]);
  for (const code of ['LAYOUT_UNAVAILABLE','AMBIGUOUS_CODE','UNSUPPORTED_CODE']) assert.ok(r.warnings.some(w=>w.code===code));
});
test('separate terms, unknown term, conflicting headings and titles remain reviewable', () => {
  const r = parseSchedule(document([['Fall 2026'], ['Spring 2027'], ['CSE 416 Fall 2026'], ['CSE 416 Spring 2027'], ['CSE 416']]),'class-list');
  assert.equal(r.classes.length,3); assert.equal(r.classes[2].term,null); assert.ok(r.warnings.some(w=>w.code==='AMBIGUOUS_TERM'));
  const titles = parseSchedule(document([['CSE 416 Title: Software Engineering'], ['CSE 416 Title: Different Title'], ['CSE 416 Title: Third Title']]),'class-list');
  assert.equal(titles.classes[0].title,null); assert.ok(titles.classes[0].warnings.some(w=>w.code==='CONFLICTING_TITLE'));
});
test('widely separated neighboring calendar cells never share section labels', () => {
  const doc = document([['CSE416 LEC 01 AMS210 LAB L02']]);
  doc.pages[0].blocks[0].paragraphs[0].words.forEach((w,i)=>{ w.box=box(i<3 ? 20+i*95 : 600+(i-3)*95,0,90); });
  const r = parseSchedule(doc,'weekly-calendar');
  assert.deepEqual(r.classes.map(c=>[c.code,c.sections]),[['CSE 416',[{label:'01',component:'lecture'}]],['AMS 210',[{label:'L02',component:'lab'}]]]);
});
test('multiple codes in one region omit uncertain associations; empty results differ', () => {
  const r = parseSchedule(document([['CSE416 AMS210 LEC 01']]),'weekly-calendar');
  assert.ok(r.classes.every(c=>!c.sections.length && c.warnings.some(w=>w.code==='AMBIGUOUS_METADATA')));
  assert.ok(parseSchedule({text:'',pages:[]},'class-list').warnings.some(w=>w.code==='NO_TEXT'));
  assert.ok(parseSchedule({text:'Welcome',pages:[]},'class-list').warnings.some(w=>w.code==='NO_CLASSES'));
});
test('live evaluation inventory contains three synthetic PNGs per layout with expectations', async () => {
  const { readFile } = await import('node:fs/promises');
  const base = new URL('./fixtures/schedule-ocr/', import.meta.url);
  const samples = JSON.parse(await readFile(new URL('samples.json',base),'utf8'));
  for (const layout of ['class-list','weekly-calendar']) assert.equal(samples.filter(s=>s.layout===layout).length,3);
  for (const sample of samples) {
    const bytes=await readFile(new URL(sample.image,base));
    assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    assert.equal(sample.kind,'synthetic'); assert.ok(sample.expectedCodes.length); assert.ok(sample.expectedTerm); assert.ok(sample.expectedSections);
  }
});
test('attached sections retain zeros; times and buildings are not classes/sections', async () => {
  const { calendarRegression } = await import('./fixtures/schedule-ocr/documents.js');
  const result = parseSchedule(calendarRegression, 'weekly-calendar');
  assert.deepEqual(result.classes.map(c => [c.code,c.sections.map(s=>s.label)]), [
    ['CSE 310',['01']],['COM 120',['30']],['CSE 351',['01']],['CSE 416',['03']],['AMS 315',['01']]
  ]);
  assert.equal(result.classes[0].evidence.length,2);
  assert.equal(parseSchedule(document([['CSE 310', 'Lecture', '8:00 AM']]),'weekly-calendar').classes[0].sections.length,0);
  const conflict = parseSchedule(document([['CSE 310-01 LEC 02']]),'class-list').classes[0];
  assert.equal(conflict.sections.length,0); assert.ok(conflict.warnings.some(w=>w.code==='CONFLICTING_SECTION'));
});
test('calendar labels in separate OCR blocks associate only with nearby column',()=>{
  const doc=document([['CSE416'],['LEC 01'],['AMS210'],['LAB L02']]);
  for(let i=0;i<4;i++) doc.pages[0].blocks[i].paragraphs[0].words.forEach((w,k)=>{w.box=box((i<2?20:500)+k*95,i%2===0?100:140,90,20)});
  const r=parseSchedule(doc,'weekly-calendar');
  assert.deepEqual(r.classes.map(c=>[c.code,c.sections.map(s=>s.label)]),[['CSE 416',['01']],['AMS 210',['L02']]]);
});
