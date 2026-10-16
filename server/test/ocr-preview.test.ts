import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { ReportStore } from '../src/crowd.js';
import type { PreviewOptions } from '../src/ocr/preview.js';
import { calendarRegression } from './fixtures/schedule-ocr/documents.js';
import { OcrError } from '../src/ocr/vision.js';
const png=Buffer.from([137,80,78,71,13,10,26,10]);
async function fixture(t, options: PreviewOptions) {
  const server=createApp(new ReportStore('/unused'),options).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const address=server.address();assert.ok(address && typeof address!=='string');
  return (body=png, headers: Record<string,string>={}, layout='weekly-calendar')=>fetch(`http://127.0.0.1:${address.port}/api/schedule-preview?layout=${layout}`,{method:'POST',headers:{Origin:'http://localhost:5173','X-Schedule-Preview':'1','Content-Type':'image/png',...headers},body});
}
test('validation and development gates precede provider; no raw OCR in projection',async t=>{
  let calls=0;const provider=async()=>{calls++;return calendarRegression};
  for(const options of [{enabled:false},{enabled:true,environment:'production'}]) {
    const post=await fixture(t,{...options,provider});assert.equal((await post()).status,404);
  }
  const post=await fixture(t,{enabled:true,provider});
  for(const [body,headers,layout,status] of [
    [png,{Origin:'https://unrelated.example'},'weekly-calendar',403],
    [png,{'X-Schedule-Preview':''},'weekly-calendar',403],
    [png,{'Content-Type':'text/plain'},'weekly-calendar',415],
    [png,{},'bad',400], [Buffer.alloc(0),{},'weekly-calendar',400],
    [Buffer.from('bad'),{},'weekly-calendar',400], [Buffer.alloc(10*1024*1024+1),{},'weekly-calendar',413]
  ] as const) assert.equal((await post(body,{...headers},layout)).status,status);
  assert.equal(calls,0);
  const response=await post();assert.equal(response.status,200);const result=await response.json();
  assert.deepEqual(result.rows.map(r=>[r.code,r.section]),[['CSE 310','01'],['COM 120','30'],['CSE 351','01'],['CSE 416','03'],['AMS 315','01']]);
  assert.equal(result.rawText,undefined);assert.ok(!JSON.stringify(result).includes('8:00'));assert.equal(calls,1);
});
test('busy guard recovers from failures and projects empty/missing-section responses',async t=>{
  let release!:()=>void;let fail=true;
  const post=await fixture(t,{enabled:true,provider:async()=>{if(fail){await new Promise<void>(r=>release=r);throw new OcrError('Google Vision timed out after 30 seconds.')}return {text:'CSE 310',pages:[]};}});
  const first=post();while(!release)await new Promise(r=>setTimeout(r,1));
  assert.equal((await post()).status,429);release();assert.equal((await first).status,504);fail=false;
  const result=await (await post()).json();assert.equal(result.rows[0].section,'');assert.ok(result.rows[0].warnings.some(w=>w.code==='MISSING_SECTION'));
  for(const text of ['', 'Welcome']){
    const empty=await fixture(t,{enabled:true,provider:async()=>({text,pages:[]})});const r=await(await empty()).json();assert.deepEqual(r.rows,[]);assert.ok(r.warnings.some(w=>w.code===(text?'NO_CLASSES':'NO_TEXT')));
  }
});
