import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import { avatarRouter } from '../src/avatar.js';

test('avatar endpoint authenticates before parsing, decodes images and derives owner path', async () => {
  const uploads: { path: string; bytes: Buffer }[] = [];
  const app = express();
  app.use('/api/avatar', avatarRouter(async token => token === 'owner' ? { id: '00000000-0000-0000-0000-000000000001', upload: async (path,bytes) => { uploads.push({ path,bytes }); } } : null));
  const server = app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve => server.once('listening',resolve));
  const url = `http://127.0.0.1:${(server.address() as {port:number}).port}/api/avatar`;
  try {
    const png = await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer();
    const send = (body: Uint8Array, token?: string, type='image/png') => fetch(url,{method:'POST',headers:{'Content-Type':type,...(token?{Authorization:`Bearer ${token}`}:{})},body:new Uint8Array(body)});
    assert.equal((await send(png)).status,401);
    assert.equal((await send(png,'other')).status,403);
    assert.equal((await send(Buffer.from('bad'),'owner')).status,400);
    assert.equal((await send(png,'owner','image/gif')).status,400);
    assert.equal((await send(new Uint8Array(5*1024*1024+1),'owner')).status,413);
    assert.equal(uploads.length,0);
    const good = await send(png,'owner'); assert.equal(good.status,201);
    const {path} = await good.json() as {path:string};
    assert.match(path,/^00000000-0000-0000-0000-000000000001\/[a-f0-9-]+\.png$/);
    assert.equal(uploads[0].path,path); assert.equal((await sharp(uploads[0].bytes).metadata()).format,'png');
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});

test('avatar upload failure is actionable and does not claim success',async()=>{
  const app=express();app.use(avatarRouter(async()=>({id:'owner',upload:async()=>{throw new Error('private provider data')}})));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try {
    const image=await sharp({create:{width:1,height:1,channels:3,background:'white'}}).png().toBuffer();
    const result=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'image/png'},body:new Uint8Array(image)});
    assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/private provider/);
  } finally {await new Promise<void>(r=>server.close(()=>r()))}
});
