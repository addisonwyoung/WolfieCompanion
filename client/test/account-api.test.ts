import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { accountApi, duplicateCourseCode } from '../src/account'
import type { StudentProfile } from '../src/account'
const profile:StudentProfile={id:'a',name:'Ada',major:null,year:null,interests:[],residence_status:null,is_private:false,avatar_path:'a/old.png'}
test('course-code duplicate check ignores section and professor and normalizes spacing/case',()=>{
 expect(duplicateCourseCode([{code:'cse416'}],['CSE 416'])).toBe('CSE 416')
 expect(duplicateCourseCode([{code:'BIO201'},{code:'bio 201'}])).toBe('BIO 201')
 expect(duplicateCourseCode([{code:'CSE 416'}],['BIO 201'])).toBeNull()
})
function fake(){
 const remove=vi.fn().mockResolvedValue({error:null});const single=vi.fn().mockResolvedValue({data:{...profile,avatar_path:null},error:null});const update=vi.fn(()=>({eq:()=>({select:()=>({single,setHeader:()=>({single})})})}));const rpc=vi.fn().mockResolvedValue({data:[],error:null})
 const getSession=vi.fn(async()=>({data:{session:{user:{id:profile.id},access_token:'token'}}}))
 const client={storage:{from:()=>({remove,createSignedUrl:vi.fn().mockResolvedValue({data:{signedUrl:'private-url'},error:null})})},auth:{getSession},from:()=>({update,select:()=>({order:async()=>({data:[],error:null})})}),rpc} as unknown as SupabaseClient
 return {api:accountApi(client),remove,single,update,rpc,getSession}
}
test('commit reference before deleting old picture; cleanup failure is retryable',async()=>{
 const f=fake();f.remove.mockResolvedValueOnce({error:new Error('offline')});const r=await f.api.saveProfile(profile,{remove:true});expect(r.profile.avatar_path).toBeNull();expect(r.cleanupPath).toBe('a/old.png');expect(f.single.mock.invocationCallOrder[0]).toBeLessThan(f.remove.mock.invocationCallOrder[0]);await f.api.removeObject(r.cleanupPath!);expect(f.remove).toHaveBeenCalledTimes(2)
})
test('failed profile save removes new upload, retains old picture, surfaces failed cleanup',async()=>{
 const f=fake();f.single.mockResolvedValue({data:null,error:new Error('offline')} as never);vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({path:'a/new.png'})}));const picture={file:new File(['png'],'pic.png',{type:'image/png'})};await expect(f.api.saveProfile(profile,picture)).rejects.toThrow('Profile could not be saved');expect(f.remove).toHaveBeenCalledWith(['a/new.png']);expect(f.remove).not.toHaveBeenCalledWith(['a/old.png']);f.remove.mockResolvedValueOnce({error:new Error('offline')});await expect(f.api.saveProfile(profile,picture)).rejects.toMatchObject({cleanupPath:'a/new.png'})
})
test('invalid picture or failed upload never changes profile',async()=>{
 const f=fake();await expect(f.api.saveProfile(profile,{file:new File(['gif'],'x.gif',{type:'image/gif'})})).rejects.toThrow('PNG or JPEG');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({error:'Upload unavailable'})}));await expect(f.api.saveProfile(profile,{file:new File(['png'],'pic.png',{type:'image/png'})})).rejects.toThrow('Upload unavailable');expect(f.update).not.toHaveBeenCalled()
})
test('validate rows before RPC and preserve each returned course offering',async()=>{
 const f=fake();await expect(f.api.saveClasses([{code:'bad',section:'01',professor_first_name:'Ada',professor_last_name:'Lovelace'}])).rejects.toThrow('valid course code');expect(f.rpc).not.toHaveBeenCalled();f.rpc.mockResolvedValueOnce({data:[{enrollment_id:'enrollment-id',legacy_course_id:'db-id',code:'CSE 310',section:'01',professor_first_name:'Ada',professor_last_name:'Lovelace',verification_status:'verified'},{enrollment_id:'enrollment-two',legacy_course_id:'db-id',code:'CSE 310',section:'02',professor_first_name:'Ada',professor_last_name:'Lovelace',verification_status:'verified'},{enrollment_id:'enrollment-three',legacy_course_id:'db-bio',code:'BIO 201',section:'03',professor_first_name:'Grace',professor_last_name:'Hopper',verification_status:'pending'}],error:null});const result=await f.api.saveClasses([{code:'cse310',section:'01',professor_first_name:'Ada',professor_last_name:'Lovelace'}]);expect(result.courses).toEqual([{id:'cse-310-section-01-prof-ada-lovelace',databaseId:'db-id',code:'CSE 310',section:'01',sections:['01'],professorFirstName:'Ada',professorLastName:'Lovelace',verificationStatus:'verified'},{id:'cse-310-section-02-prof-ada-lovelace',databaseId:'db-id',code:'CSE 310',section:'02',sections:['02'],professorFirstName:'Ada',professorLastName:'Lovelace',verificationStatus:'verified'},{id:'bio-201-section-03-prof-grace-hopper',databaseId:'db-bio',code:'BIO 201',section:'03',sections:['03'],professorFirstName:'Grace',professorLastName:'Hopper',verificationStatus:'pending'}]);expect(result.plannerCourses).toEqual([])
})
test('load restores profile and separate enrollment offerings',async()=>{
 const p={...profile,avatar_path:null}
 const rpc=vi.fn().mockImplementation(name=>name==='ensure_profile'?{single:async()=>({data:p,error:null})}:Promise.resolve({data:[{enrollment_id:'e1',legacy_course_id:'uuid',code:'CSE 310',section:'01',verification_status:'verified'},{enrollment_id:'e2',legacy_course_id:'uuid',code:'CSE 310',section:'02',verification_status:'verified'}],error:null}))
 const client={storage:{from:()=>({})},rpc,from:()=>({select:()=>({order:async()=>({data:[{id:'uuid',course_code:'CSE 310',user_course_sections:[{section:'02'},{section:'01'}]}],error:null})})})} as unknown as SupabaseClient
 const loaded=await accountApi(client).load();expect(loaded).toEqual({profile:p,courses:[{id:'cse-310-section-01-prof--',databaseId:'uuid',code:'CSE 310',section:'01',sections:['01'],verificationStatus:'verified'},{id:'cse-310-section-02-prof--',databaseId:'uuid',code:'CSE 310',section:'02',sections:['02'],verificationStatus:'verified'}],plannerCourses:[{id:'cse-310',databaseId:'uuid',code:'CSE 310',sections:['01','02']}]});expect(loaded.profile).not.toHaveProperty('courseIds')
})

test('profile sharing flags are explicit and saved atomically without deleting private values',async()=>{
 const f=fake();await f.api.saveProfile({...profile,avatar_path:null,year:'Graduate',interests:['Music'],share_year:true,share_interests:false})
 expect(f.update).toHaveBeenCalledWith(expect.objectContaining({year:'Graduate',interests:['Music'],share_year:true,share_interests:false,share_avatar:false,share_residence_status:false}))
 f.single.mockResolvedValueOnce({data:null,error:new Error('offline')} as never)
 await expect(f.api.saveProfile({...profile,share_year:false})).rejects.toThrow('Profile could not be saved')
})
test('canonical DM and group preferences save independently without writing the deprecated boolean',async()=>{
 const f=fake();f.single.mockResolvedValueOnce({data:{...profile,dm_permission:'friends_only',allow_group_additions:false},error:null})
 const saved=await f.api.saveProfile({...profile,dm_permission:'friends_only',allow_group_additions:false,allow_new_dms:true})
 expect(saved.profile).toMatchObject({dm_permission:'friends_only',allow_group_additions:false})
 expect(f.update).toHaveBeenCalledWith(expect.objectContaining({dm_permission:'friends_only',allow_group_additions:false}))
 expect(f.update.mock.calls[0][0]).not.toHaveProperty('allow_new_dms')
 await f.api.saveProfile({...profile,dm_permission:'no_one',allow_group_additions:true,allow_new_dms:false})
 expect(f.update).toHaveBeenLastCalledWith(expect.objectContaining({dm_permission:'no_one',allow_group_additions:true}))
})

test('invalid canonical settings fail before writing and obsolete-client errors are actionable',async()=>{
 const f=fake()
 await expect(f.api.saveProfile({...profile,dm_permission:'bad' as never})).rejects.toThrow('valid messaging')
 expect(f.update).not.toHaveBeenCalled()
 f.single.mockResolvedValueOnce({data:null,error:{code:'PDM01'}} as never)
 await expect(f.api.saveProfile(profile)).rejects.toThrow('Refresh the application')
})

test('profile privacy is explicit and server-confirmed without overwriting independent choices',async()=>{
 const f=fake();f.single.mockResolvedValue({data:{...profile,is_private:true},error:null})
 const result=await f.api.saveProfile({...profile,is_private:true,dm_permission:'friends_only',allow_group_additions:false,share_year:true})
 expect(f.update).toHaveBeenCalledWith(expect.objectContaining({is_private:true,dm_permission:'friends_only',allow_group_additions:false,share_year:true}))
 expect(result.profile.is_private).toBe(true)
 await expect(f.api.saveProfile({...profile,is_private:undefined} as unknown as StudentProfile)).rejects.toThrow('Privacy settings are unavailable')
})

test('a save response missing authoritative privacy is a compatibility failure',async()=>{
 const f=fake();f.single.mockResolvedValue({data:{...profile,is_private:undefined},error:null} as never)
 await expect(f.api.saveProfile(profile)).rejects.toThrow('Reload your account to confirm')
})

test('owner privacy loading rejects a missing server flag, and old sessions cannot save another profile',async()=>{
 const rpc=vi.fn((name:string)=>name==='ensure_profile'?{single:async()=>({data:{...profile,is_private:undefined},error:null})}:Promise.resolve({data:[],error:null}))
 const client={rpc,storage:{from:()=>({})},from:()=>({select:()=>({order:async()=>({data:[],error:null})})})} as unknown as SupabaseClient
 await expect(accountApi(client).load()).rejects.toThrow('Privacy settings are unavailable')
 const f=fake();f.getSession.mockResolvedValue({data:{session:{user:{id:'another-student'},access_token:'other-token'}}})
 await expect(f.api.saveProfile(profile)).rejects.toThrow('Sign in again')
 expect(f.update).not.toHaveBeenCalled()
})


test.each(['logout','replacement','generation'])('avatar upload completing after %s cannot dispatch UPDATE or cleanup',async(kind)=>{
 const f=fake();let resolve!:(value:unknown)=>void,current=true
 const upload=new Promise(yes=>{resolve=yes}),fetcher=vi.fn(()=>upload);vi.stubGlobal('fetch',fetcher)
 const save=f.api.saveProfile(profile,{file:new File(['png'],'pic.png',{type:'image/png'})},()=>current)
 const rejected=expect(save).rejects.toThrow(/session changed|Sign in again/)
 await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce())
 if(kind==='generation')current=false
 else f.getSession.mockResolvedValue({data:{session:kind==='logout'?null:{user:{id:'other'},access_token:'other'}}} as never)
 resolve({ok:true,json:async()=>({path:'a/new.png'})});await rejected
 expect(f.update).not.toHaveBeenCalled();expect(f.remove).not.toHaveBeenCalled()
})

test('session invalidation during the final session check prevents UPDATE',async()=>{
 const f=fake();let resolve!:(value:unknown)=>void,current=true
 f.getSession.mockImplementationOnce(async()=>({data:{session:{user:{id:'a'},access_token:'token'}}})).mockImplementationOnce(()=>new Promise(yes=>{resolve=yes}) as never)
 const save=f.api.saveProfile(profile,{},()=>current),rejected=expect(save).rejects.toThrow('session changed')
 await vi.waitFor(()=>expect(f.getSession).toHaveBeenCalledTimes(2));current=false
 resolve({data:{session:{user:{id:'a'},access_token:'token'}}});await rejected;expect(f.update).not.toHaveBeenCalled()
})
