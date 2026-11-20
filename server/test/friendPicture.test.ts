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
  assert.equal((await fetch(`${url}&p_caller_id=someone-else`,{headers})).status,400);
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


test('friend picture access derives caller from verified token and rechecks with a separate service client',async()=>{
 const {createFriendPictureAccess}=await import('../src/friendPicture.js');
 const calls:unknown[][]=[];let signedIn=true,visible=true;
 let path:string|null=`${peer}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png`;
 const factory=((url:string,key:string,options:unknown)=>{
  calls.push(['client',key,options]);
  return {auth:{getUser:async(token:string)=>{calls.push(['auth',token]);return {data:{user:signedIn?{id:'verified-student'}:null},error:null}}},
   rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return {data:name==='get_discoverable_profile'?(visible?{has_shared_avatar:true}:null):path,error:null}},
   storage:{from:(bucket:string)=>({download:async(current:string)=>{calls.push(['download',bucket,current]);return {data:new Blob(['pixels']),error:null}}})}};
 }) as unknown as typeof import('@supabase/supabase-js').createClient;
 const access=createFriendPictureAccess(factory,{SUPABASE_URL:'https://test.invalid',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only'});
 assert.equal(await access.caller('user-token',peer),'verified-student');
 assert.deepEqual(calls.find(row=>row[0]==='get_discoverable_profile')?.[1],{p_student_id:peer});
 await access.picture('verified-student',peer);
 assert.deepEqual(calls.find(row=>row[0]==='resolve_friend_avatar')?.[1],{p_caller_id:'verified-student',p_student_id:peer});
 assert.deepEqual(calls.find(row=>row[0]==='client'&&row[1]==='server-only')?.[2],{auth:{persistSession:false,autoRefreshToken:false}});
 // Revocation between caller lookup and privileged resolution must not reuse a path.
 path=null;assert.equal(await access.picture('verified-student',peer),null);
 path='different-student/private.png';assert.equal(await access.picture('verified-student',peer),null);
 visible=false;assert.equal(await access.caller('user-token',peer),null);
 signedIn=false;assert.equal(await access.caller('forged-token',peer),null);
 assert.equal(calls.filter(row=>row[0]==='download').length,1);
});
