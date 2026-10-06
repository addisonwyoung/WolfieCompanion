import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCommand, MAX_IMAGE_BYTES } from '../src/ocr/command.js';
import { OcrError } from '../src/ocr/vision.js';
import { classList, calendar } from './fixtures/schedule-ocr/documents.js';
import { rm } from 'node:fs/promises';
const png=Buffer.from([137,80,78,71,13,10,26,10]);
test('invalid input rejected before provider; one JSON stdout and unchanged files on success',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'wolfie-ocr-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const image=join(dir,'sample.png');await writeFile(image,png);
  const empty=join(dir,'empty');await writeFile(empty,'');const bad=join(dir,'bad.png');await writeFile(bad,'not an image');
  const large=join(dir,'large');await writeFile(large,png);await truncate(large,MAX_IMAGE_BYTES+1);
  let calls=0,out='',err=''; const output={stdout:(s:string)=>{out+=s},stderr:(s:string)=>{err+=s}};
  const provider=async()=>{calls++;return classList};
  const invoke=async(args:string[])=>{out='';err='';return runCommand(args,output,provider)};
  for(const args of [[],['--image',image],['--image',image,'--layout','bad'],['--bad','x'],['--image','https://example.com/x','--layout','class-list'],...['missing',empty,bad,large,dir].map(p=>['--image',p,'--layout','class-list'])]) {
    assert.equal(await invoke(args),1);assert.equal(out,'');assert.ok(err);assert.equal(calls,0);
  }
  const before=await readdir(dir);
  assert.equal(await invoke(['--image',image,'--layout','class-list']),0);assert.equal(calls,1);assert.equal(err,'');assert.equal(JSON.parse(out).classes.length,2);
  assert.deepEqual(await readdir(dir),before);
  assert.equal(await runCommand(['--image',image,'--layout','weekly-calendar'],output,async()=>calendar),0);
});
test('empty extraction succeeds but provider failure produces no success output',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'wolfie-ocr-'));t.after(()=>rm(dir,{recursive:true,force:true}));const image=join(dir,'sample.jpg');await writeFile(image,Buffer.from([255,216,255]));
  for(const text of ['','Welcome']) {
    let out='',err='';assert.equal(await runCommand(['--image',image,'--layout','class-list'],{stdout:s=>{out+=s},stderr:s=>{err+=s}},async()=>({text,pages:[]})),0);
    assert.equal(err,'');assert.equal(JSON.parse(out).classes.length,0);assert.ok(JSON.parse(out).warnings.some(w=>w.code===(text?'NO_CLASSES':'NO_TEXT')));
  }
  let out='',err=''; assert.equal(await runCommand(['--image',image,'--layout','class-list'],{stdout:s=>{out+=s},stderr:s=>{err+=s}},async()=>{throw new OcrError('Authentication failed')}),1);
  assert.equal(out,'');assert.match(err,/Authentication/);
});
