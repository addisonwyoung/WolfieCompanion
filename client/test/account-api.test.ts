import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { accountApi } from '../src/account'
import type { StudentProfile } from '../src/account'
const profile:StudentProfile={id:'a',name:'Ada',major:null,year:null,interests:[],residence_status:null,avatar_path:'a/old.png'}
function fake(){
 const remove=vi.fn().mockResolvedValue({error:null});const single=vi.fn().mockResolvedValue({data:{...profile,avatar_path:null},error:null});const update=vi.fn(()=>({eq:()=>({select:()=>({single})})}));const rpc=vi.fn().mockResolvedValue({data:[],error:null})
 const client={storage:{from:()=>({remove,createSignedUrl:vi.fn().mockResolvedValue({data:{signedUrl:'private-url'},error:null})})},auth:{getSession:async()=>({data:{session:{access_token:'token'}}})},from:()=>({update,select:()=>({order:async()=>({data:[],error:null})})}),rpc} as unknown as SupabaseClient
 return {api:accountApi(client),remove,single,update,rpc}
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
test('validate rows before RPC and keep catalog and unverified classes in the current dashboard',async()=>{
 const f=fake();await expect(f.api.saveClasses([{code:'bad',section:'01',professor_first_name:'Ada',professor_last_name:'Lovelace'}])).rejects.toThrow('valid course code');expect(f.rpc).not.toHaveBeenCalled();f.rpc.mockResolvedValueOnce({data:[{enrollment_id:'enrollment-id',legacy_course_id:'db-id',code:'CSE 310',section:'01',verification_status:'verified'},{enrollment_id:'enrollment-two',legacy_course_id:'db-id',code:'CSE 310',section:'02',verification_status:'verified'},{enrollment_id:'enrollment-three',legacy_course_id:'db-bio',code:'BIO 201',section:'03',verification_status:'pending'}],error:null});const result=await f.api.saveClasses([{code:'cse310',section:'01',professor_first_name:'Ada',professor_last_name:'Lovelace'}]);expect(result.courses).toEqual([{id:'cse-310',databaseId:'db-id',code:'CSE 310',sections:['01','02'],verificationStatus:'verified'},{id:'bio-201',databaseId:'db-bio',code:'BIO 201',sections:['03'],verificationStatus:'pending'}]);expect(result.plannerCourses).toEqual([])
})
test('load restores profile and all sections without a duplicate enrollment field',async()=>{
 const p={...profile,avatar_path:null}
 const rpc=vi.fn().mockImplementation(name=>name==='ensure_profile'?{single:async()=>({data:p,error:null})}:Promise.resolve({data:[{enrollment_id:'e1',legacy_course_id:'uuid',code:'CSE 310',section:'01',verification_status:'verified'},{enrollment_id:'e2',legacy_course_id:'uuid',code:'CSE 310',section:'02',verification_status:'verified'}],error:null}))
 const client={storage:{from:()=>({})},rpc,from:()=>({select:()=>({order:async()=>({data:[{id:'uuid',course_code:'CSE 310',user_course_sections:[{section:'02'},{section:'01'}]}],error:null})})})} as unknown as SupabaseClient
 const loaded=await accountApi(client).load();expect(loaded).toEqual({profile:p,courses:[{id:'cse-310',databaseId:'uuid',code:'CSE 310',sections:['01','02'],verificationStatus:'verified'}],plannerCourses:[{id:'cse-310',databaseId:'uuid',code:'CSE 310',sections:['01','02']}]});expect(loaded.profile).not.toHaveProperty('courseIds')
})

test('profile sharing flags are explicit and saved atomically without deleting private values',async()=>{
 const f=fake();await f.api.saveProfile({...profile,avatar_path:null,year:'Graduate',interests:['Music'],share_year:true,share_interests:false})
 expect(f.update).toHaveBeenCalledWith(expect.objectContaining({year:'Graduate',interests:['Music'],share_year:true,share_interests:false,share_avatar:false,share_residence_status:false}))
 f.single.mockResolvedValueOnce({data:null,error:new Error('offline')} as never)
 await expect(f.api.saveProfile({...profile,share_year:false})).rejects.toThrow('Profile could not be saved')
})
test('DM preference is allowlisted in owner update and confirmed response restores the saved choice',async()=>{
 const f=fake();f.single.mockResolvedValueOnce({data:{...profile,allow_new_dms:false},error:null})
 const saved=await f.api.saveProfile({...profile,allow_new_dms:false});expect(saved.profile.allow_new_dms).toBe(false)
 expect(f.update).toHaveBeenCalledWith(expect.objectContaining({allow_new_dms:false}))
 await f.api.saveProfile(profile);expect(f.update).toHaveBeenLastCalledWith(expect.objectContaining({allow_new_dms:true}))
})
