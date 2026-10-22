import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import { classmatePictureRouter, pictureAccess } from '../src/classmatePicture.js';

const peer='10000000-0000-0000-0000-000000000002';
test('picture endpoint authenticates, validates targets and returns private bytes without paths or URLs', async () => {
 const image=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer();
 const calls:string[][]=[];
 let available=true;
 const app=express();app.use(classmatePictureRouter({
  caller:async(token,course,student)=>{calls.push([token,course,student]);return token==='eligible' ? 'verified-caller' : null},
  picture:async(caller,course,student)=>{assert.deepEqual([caller,course,student],['verified-caller','CSE310',peer]);return available?image:null},
 }));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/?course=CSE310&student=${peer}`;
 try {
  assert.equal((await fetch(url)).status,401);assert.equal(calls.length,0);
  for(const token of ['invalid','ineligible','unrelated']) assert.equal((await fetch(url,{headers:{Authorization:`Bearer ${token}`}})).status,404);
  const headers={Authorization:'Bearer eligible'};
  assert.equal((await fetch(`${url}&path=arbitrary`,{headers})).status,400);
  assert.equal((await fetch(url.replace(peer,'forged/path'),{headers})).status,400);
  const response=await fetch(url,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
  available=false;const revoked=await fetch(url,{headers});assert.equal(revoked.status,404);assert.deepEqual(await revoked.json(),{error:'Picture unavailable.'});
 } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
test('missing picture configuration fails closed with safe response',async()=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 const app=express();app.use(classmatePictureRouter({caller:async()=> 'verified',picture:pictureAccess.picture}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try {const result=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/?course=CSE310&student=${peer}`,{headers:{Authorization:'Bearer eligible'}});assert.equal(result.status,503);assert.deepEqual(await result.json(),{error:'Picture unavailable. Please retry.'});}
 finally {if(previous!==undefined)process.env.SUPABASE_SERVICE_ROLE_KEY=previous;await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('production access uses verified caller and re-resolves current shared path without trusting client identity',async()=>{
 const {createPictureAccess}=await import('../src/classmatePicture.js');
 const calls:unknown[][]=[];
 let signedIn=true, shared=true, current:string|null=`${peer}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png`;
 const factory=((url:string,key:string,options:unknown)=>{
  calls.push(['client',url,key,options]);
  return {auth:{getUser:async(token:string)=>{calls.push(['auth',token]);return {data:{user:signedIn?{id:'verified'}:null},error:null}}},rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return {data:name==='get_classmate_profile'?{has_shared_avatar:shared}:current,error:null}},storage:{from:(bucket:string)=>({download:async(path:string)=>{calls.push(['download',bucket,path]);return {data:new Blob(['pixels']),error:null}}})}};
 }) as unknown as typeof import('@supabase/supabase-js').createClient;
 const access=createPictureAccess(factory,{SUPABASE_URL:'https://test.invalid',SUPABASE_PUBLISHABLE_KEY:'publishable',SUPABASE_SERVICE_ROLE_KEY:'server-only'});
 assert.equal(await access.caller('bearer','CSE310',peer),'verified');assert.ok(calls.some(row=>row[0]==='auth'&&row[1]==='bearer'));
 const authArgs=calls.find(row=>row[0]==='get_classmate_profile')?.[1];assert.deepEqual(authArgs,{p_course_code:'CSE310',p_student_id:peer});
 await access.picture('verified','CSE310',peer);assert.deepEqual(calls.find(row=>row[0]==='resolve_classmate_avatar')?.[1],{p_caller_id:'verified',p_student_id:peer,p_course_code:'CSE310'});
 current=`${peer}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png`;await access.picture('verified','CSE310',peer);assert.deepEqual(calls.filter(row=>row[0]==='download').at(-1),['download','avatars',current]);
 current=null;assert.equal(await access.picture('verified','CSE310',peer),null);
 current='someone-else/private.png';assert.equal(await access.picture('verified','CSE310',peer),null);
 shared=false;assert.equal(await access.caller('bearer','CSE310',peer),null);
 signedIn=false;assert.equal(await access.caller('invalid','CSE310',peer),null);
 assert.equal(calls.filter(row=>row[0]==='download').length,2);
});
