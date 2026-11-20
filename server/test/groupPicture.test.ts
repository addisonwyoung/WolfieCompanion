import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import { groupPictureRouter, groupPictureAccess } from '../src/groupPicture.js';

const group='10000000-0000-0000-0000-000000000001';
const peer='10000000-0000-0000-0000-000000000002';
test('group picture route validates requests, respects group-context authorization, and is private',async()=>{
 const image=await sharp({create:{width:2,height:2,channels:3,background:'blue'}}).png().toBuffer();
 const calls:string[][]=[];let visible=true;
 const app=express();app.use(groupPictureRouter({
  caller:async(token,requestedGroup,student)=>{calls.push([token,requestedGroup,student]);return token==='eligible'&&visible?'caller':null},
  picture:async(caller,requestedGroup,student)=>{assert.deepEqual([caller,requestedGroup,student],['caller',group,peer]);return visible?image:null},
 }));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/?group=${group}&student=${peer}`;
 try{
  assert.equal((await fetch(url)).status,401);assert.equal(calls.length,0);
  const headers={Authorization:'Bearer eligible'};
  assert.equal((await fetch(`${url}&other=value`,{headers})).status,400);
  assert.equal((await fetch(url.replace(group,'bad-group'),{headers})).status,400);
  assert.equal((await fetch(`${url}&group=${group}`,{headers})).status,400);
  assert.equal((await fetch(url.replace(peer,'not-a-student'),{headers})).status,400);
  const response=await fetch(url,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
  visible=false;assert.equal((await fetch(url,{headers})).status,404);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('missing service-role configuration fails closed',async()=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 const app=express();app.use(groupPictureRouter({caller:async()=> 'caller',picture:groupPictureAccess.picture}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/?group=${group}&student=${peer}`,{headers:{Authorization:'Bearer eligible'}});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Picture unavailable. Please retry.'});}
 finally{if(previous!==undefined)process.env.SUPABASE_SERVICE_ROLE_KEY=previous;await new Promise<void>(resolve=>server.close(()=>resolve()));}
});


test('group picture access verifies session and resolves only current co-member path with service role',async()=>{
 const {createGroupPictureAccess}=await import('../src/groupPicture.js');
 const calls:unknown[][]=[];let signedIn=true,active=true;
 let path:string|null=`${peer}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png`;
 const factory=((url:string,key:string,options:unknown)=>{
  calls.push(['client',url,key,options]);
  return {auth:{getUser:async(token:string)=>{calls.push(['auth',token]);return {data:{user:signedIn?{id:'verified'}:null},error:null}}},
   rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return {data:name==='group_member_identity'?(active?{has_picture:true}:null):path,error:null}},
   storage:{from:(bucket:string)=>({download:async(current:string)=>{calls.push(['download',bucket,current]);return {data:new Blob(['pixels']),error:null}}})}};
 }) as unknown as typeof import('@supabase/supabase-js').createClient;
 const access=createGroupPictureAccess(factory,{SUPABASE_URL:'https://test.invalid',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server'});
 assert.equal(await access.caller('token',group,peer),'verified');
 assert.deepEqual(calls.find(row=>row[0]==='group_member_identity')?.[1],{p_group_id:group,p_student_id:peer});
 await access.picture('verified',group,peer);
 assert.deepEqual(calls.find(row=>row[0]==='resolve_group_avatar')?.[1],{p_caller_id:'verified',p_group_id:group,p_student_id:peer});
 path=`${peer}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png`;await access.picture('verified',group,peer);
 assert.deepEqual(calls.filter(row=>row[0]==='download').at(-1),['download','avatars',path]);
 path=null;assert.equal(await access.picture('verified',group,peer),null);
 path='foreign/private.png';assert.equal(await access.picture('verified',group,peer),null);
 active=false;assert.equal(await access.caller('token',group,peer),null);
 signedIn=false;assert.equal(await access.caller('token',group,peer),null);
 assert.equal(calls.filter(row=>row[0]==='download').length,2);
});
