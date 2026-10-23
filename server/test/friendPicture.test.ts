import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import { friendPictureRouter, friendPictureAccess } from '../src/friendPicture.js';

const peer='10000000-0000-0000-0000-000000000002';
test('friend picture route validates requests, respects shared-picture authorization, and is private',async()=>{
 const image=await sharp({create:{width:2,height:2,channels:3,background:'blue'}}).png().toBuffer();
 const calls:string[][]=[];let visible=true;
 const app=express();app.use(friendPictureRouter({
  caller:async(token,student)=>{calls.push([token,student]);return token==='eligible'&&visible?'caller':null},
  picture:async(caller,student)=>{assert.deepEqual([caller,student],['caller',peer]);return visible?image:null},
 }));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/?student=${peer}`;
 try{
  assert.equal((await fetch(url)).status,401);assert.equal(calls.length,0);
  const headers={Authorization:'Bearer eligible'};
  assert.equal((await fetch(`${url}&other=value`,{headers})).status,400);
  assert.equal((await fetch(url.replace(peer,'not-a-student'),{headers})).status,400);
  const response=await fetch(url,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
  visible=false;assert.equal((await fetch(url,{headers})).status,404);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('missing service-role configuration fails closed',async()=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 const app=express();app.use(friendPictureRouter({caller:async()=> 'caller',picture:friendPictureAccess.picture}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/?student=${peer}`,{headers:{Authorization:'Bearer eligible'}});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Picture unavailable. Please retry.'});}
 finally{if(previous!==undefined)process.env.SUPABASE_SERVICE_ROLE_KEY=previous;await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
