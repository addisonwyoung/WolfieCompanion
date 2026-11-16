import './academicDialogSupport'
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import App from '../src/App'
import type { AccountApi, StudentProfile } from '../src/account'
import type { MessagingApi, Message } from '../src/messaging'
import type { AcademicApi } from '../src/academicItems'
const mock=vi.hoisted(()=>({api:{} as AccountApi,items:{} as AcademicApi,dm:{} as MessagingApi}))
vi.mock('../src/account',async original=>({...await original<typeof import('../src/account')>(),accountApi:()=>mock.api}))
vi.mock('../src/academicItems',async original=>({...await original<typeof import('../src/academicItems')>(),academicItemsApi:()=>mock.items}))
vi.mock('../src/messaging',async original=>({...await original<typeof import('../src/messaging')>(),messagingApi:()=>mock.dm}))
const profile=(id='a'):StudentProfile=>({id,name:`Student ${id}`,major:null,year:null,interests:[],residence_status:null,avatar_path:null})
const session=(id:string)=>({user:{id},access_token:`token-${id}`}) as Session
function fake(initial:Session|null=null){
 let current=initial;let listener:(event:string,s:Session|null)=>void=()=>{}
 const unsubscribe=vi.fn()
 const auth={getSession:vi.fn(async()=>({data:{session:current},error:null})),onAuthStateChange:vi.fn((fn:typeof listener)=>{listener=fn;return {data:{subscription:{unsubscribe}}}}),signInWithOAuth:vi.fn(async()=>({error:null})),signOut:vi.fn(async()=>{current=null;listener('SIGNED_OUT',null);return {error:null}})}
 return {client:{auth} as unknown as SupabaseClient,auth,unsubscribe,emit:(id:string|null,event='SIGNED_IN')=>{current=id?session(id):null;listener(event,current)}}
}
function navigateHeader(name: string) {
 const group = name === 'Assignments & Exams' || name === 'Course evaluations' ? 'Academics' : name === 'Campus Explorer' || name === 'Study spaces' ? 'Explore' : name === 'Sign out' ? 'Account' : null
 if(group && !screen.queryByRole('button',{name,exact:true}))fireEvent.click(screen.getByRole('button',{name:group,exact:true}))
 fireEvent.click(screen.getByRole('button',{name,exact:true}))
}
beforeEach(()=>{mock.dm={contact:vi.fn().mockResolvedValue({student_id:'peer',name:'Message Peer',conversation_id:'thread',can_send:true,reason:null}),inbox:vi.fn().mockResolvedValue([{conversation_id:'thread',student_id:'peer',name:'Message Peer',last_message_at:'2026-10-23T20:00:00Z',preview:'Saved private row'}]),history:vi.fn().mockResolvedValue([{id:'saved',conversation_id:'thread',sequence:1,sender_id:'peer',client_message_id:'request',body:'Saved private row',created_at:'2026-10-23T20:00:00Z'}]),send:vi.fn()};mock.api={eligible:vi.fn().mockResolvedValue(true),load:vi.fn().mockResolvedValue({profile:profile(),courses:[],plannerCourses:[]}),saveClasses:vi.fn().mockResolvedValue({courses:[{id:'cse-310',code:'CSE 310',sections:['01']}],plannerCourses:[{id:'cse-310',databaseId:'legacy',code:'CSE 310',sections:['01']}]}),saveProfile:vi.fn(async p=>({profile:p,cleanupPath:null})),pictureUrl:vi.fn(),removeObject:vi.fn()}})
test('Campus Explorer opens lazily, preserves filters across navigation and clears on account teardown', async () => {
  const f = fake(session('a'))
  const order = vi.fn()
  order.mockReturnValueOnce({ order }).mockResolvedValue({ data: [], error: null })

  Object.assign(f.client, {
    from: vi.fn(() => ({ select: () => ({ order }) })),
    rpc: vi.fn(async () => ({ data: false, error: null }))
  })

  render(<App client={f.client} />)
  await screen.findByText('Student a')

  expect(screen.queryByRole('heading', { name: 'Campus Explorer' })).not.toBeInTheDocument()

  navigateHeader('Campus Explorer')
  await screen.findByRole('heading', { name: 'Campus Explorer' })

  expect(screen.getByRole('button', { name: 'Campus Explorer', hidden: true })).toHaveAttribute('aria-pressed', 'true')

  const printers = screen.getByRole('checkbox', { name: 'Printers' })
  fireEvent.click(printers)

  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
  expect(screen.queryByRole('heading', { name: 'Campus Explorer' })).not.toBeInTheDocument()

  navigateHeader('Campus Explorer')
  expect(screen.getByRole('checkbox', { name: 'Printers' })).not.toBeChecked()

  act(() => f.emit(null))
  await screen.findByRole('button', { name: 'Continue with Google' })

  expect(screen.queryByRole('heading', { name: 'Campus Explorer' })).not.toBeInTheDocument()
})
test('Google start failure, cancellation and unsubscribe',async()=>{
 const f=fake();const v=render(<App client={f.client}/>);await screen.findByRole('button',{name:'Continue with Google'})
 f.auth.signInWithOAuth.mockResolvedValueOnce({error:{message:'failed'}} as never);fireEvent.click(screen.getByRole('button',{name:'Continue with Google'}));expect(await screen.findByRole('alert')).toHaveTextContent('could not start')
 fireEvent.click(screen.getByRole('button',{name:'Continue with Google'}));await waitFor(()=>expect(f.auth.signInWithOAuth).toHaveBeenCalledTimes(2));expect(f.auth.signInWithOAuth).toHaveBeenLastCalledWith(expect.objectContaining({provider:'google',options:expect.objectContaining({redirectTo:expect.stringContaining('/auth/callback')})}))
 v.unmount();expect(f.unsubscribe).toHaveBeenCalled();window.history.replaceState({},'','/auth/callback?error=access_denied');render(<App client={fake().client}/>);expect(await screen.findByRole('alert')).toHaveTextContent('canceled');window.history.replaceState({},'','/')
})
test('restores empty account, manual classes call persistence, signout clears state',async()=>{
 const f=fake(session('a'))
 const catalogQuery = {} as { select: () => typeof catalogQuery; eq: () => typeof catalogQuery; order: () => typeof catalogQuery; abortSignal: () => Promise<{ data: { course_code: string; course_number: string; professor_first_name: string; professor_last_name: string }[]; error: null }> }
 catalogQuery.select = () => catalogQuery; catalogQuery.eq = () => catalogQuery; catalogQuery.order = () => catalogQuery
 catalogQuery.abortSignal = async () => ({ data: [{ course_code: 'CSE', course_number: '310', professor_first_name: 'Ada', professor_last_name: 'Lovelace' }], error: null })
 Object.assign(f.client,{from:vi.fn(()=>catalogQuery)})
 vi.mocked(mock.api.saveClasses).mockResolvedValueOnce({courses:[{id:'cse-310-section-01-prof-ada-lovelace',databaseId:'enrollment',code:'CSE 310',section:'01',sections:['01'],professorFirstName:'Ada',professorLastName:'Lovelace',verificationStatus:'verified'}],plannerCourses:[]})
 render(<App client={f.client}/>);await screen.findByText('Student a');expect(screen.getByText(/No saved classes yet/)).toBeInTheDocument();expect(screen.queryByText('Alex Morgan')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Enter classes manually'}));fireEvent.change(screen.getByLabelText('Course code'),{target:{value:'cse310'}});fireEvent.change(screen.getByLabelText('Section'),{target:{value:'01'}})
 const professor=await screen.findByRole('combobox',{name:'Professor'});await waitFor(()=>expect(professor).toBeEnabled());fireEvent.change(professor,{target:{value:'Ada'}});fireEvent.click(screen.getByRole('button',{name:'Ada Lovelace'}))
 fireEvent.click(screen.getByRole('button',{name:/^Save classes$/}));expect(await screen.findByRole('heading',{name:/Classmates in CSE 310 · Section 01 · Ada Lovelace/})).toBeInTheDocument();expect(mock.api.saveClasses).toHaveBeenCalledWith([{code:'cse310',section:'01',professor_first_name:'Ada',professor_last_name:'Lovelace'}])
 navigateHeader('Sign out');await screen.findByRole('button',{name:'Continue with Google'});expect(screen.queryByText('Student a')).not.toBeInTheDocument()
})
test('ineligible signs out, failed load retries',async()=>{
 const f=fake(session('a'));vi.mocked(mock.api.eligible).mockResolvedValueOnce(false);const v=render(<App client={f.client}/>);expect(await screen.findByText(/Use a verified @stonybrook.edu/)).toBeInTheDocument();expect(mock.api.load).not.toHaveBeenCalled();v.unmount()
 vi.mocked(mock.api.load).mockRejectedValueOnce(new Error('Unable to load.'));render(<App client={fake(session('a')).client}/>);fireEvent.click(await screen.findByRole('button',{name:'Retry loading account'}));expect(await screen.findByText('Student a')).toBeInTheDocument()
})
test('late A cannot populate B and refresh does not discard workspace',async()=>{
 let resolveA!:(data:Awaited<ReturnType<AccountApi['load']>>)=>void
 vi.mocked(mock.api.load).mockImplementationOnce(()=>new Promise(r=>{resolveA=r})).mockResolvedValueOnce({profile:profile('b'),courses:[], plannerCourses:[]});const f=fake(session('a'));render(<App client={f.client}/>);await waitFor(()=>expect(mock.api.load).toHaveBeenCalledTimes(1));act(()=>{f.emit(null);f.emit('b')});await screen.findByText('Student b')
 await act(async()=>resolveA({profile:profile('a'),courses:[{id:'bad',databaseId:'old-course',code:'AAA 100'}], plannerCourses:[]}));expect(screen.queryByText('Student a')).not.toBeInTheDocument();act(()=>f.emit('b','TOKEN_REFRESHED'));expect(screen.getByText('Student b')).toBeInTheDocument();expect(mock.api.load).toHaveBeenCalledTimes(2);act(()=>f.emit(null));await screen.findByRole('button',{name:'Continue with Google'})
})
test('missing config is actionable',()=>{render(<App client={null}/>);expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL')})

test('header menus preserve dashboard draft state and account menu signs out through existing Auth',async()=>{
 const f=fake(session('a'));render(<App client={f.client}/>);await screen.findByText('Student a')
 expect(screen.getByRole('navigation',{name:'Main navigation'}).closest('header')).not.toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Edit profile'}))
 const name=screen.getByLabelText('Name');fireEvent.change(name,{target:{value:'Unsaved name'}})
 for(const menu of ['Academics','Explore','Account'])fireEvent.click(screen.getByRole('button',{name:menu,exact:true}))
 fireEvent.keyDown(document,{key:'Escape'})
 expect(screen.getByLabelText('Name')).toBe(name);expect(name).toHaveValue('Unsaved name')
 expect(screen.queryByRole('button',{name:'Sign out',exact:true})).not.toBeInTheDocument()
 navigateHeader('Sign out')
 await screen.findByRole('button',{name:'Continue with Google'})
 expect(f.auth.signOut).toHaveBeenCalledWith({scope:'local'})
 expect(screen.queryByDisplayValue('Unsaved name')).not.toBeInTheDocument()
 expect(screen.queryByRole('navigation',{name:'Main navigation'})).not.toBeInTheDocument()
})

test('dashboard cards remain single after repeated navigation and browser Back/Forward',async()=>{
 const errors=vi.spyOn(console,'error').mockImplementation(()=>{})
 mock.items={load:vi.fn().mockResolvedValue([]),save:vi.fn(),complete:vi.fn(),remove:vi.fn()}
 render(<App client={fake(session('a')).client}/>);await screen.findByText('Student a')
 function singleCards(){
  for(const name of ['Friends','Friend requests','Your profile','Your courses']){
   expect(screen.getAllByRole('region',{name,exact:true,hidden:true})).toHaveLength(1)
  }
 }
 singleCards()
 for(let n=0;n<3;n++){
  navigateHeader('Assignments & Exams');singleCards()
  fireEvent.click(screen.getByRole('button',{name:'Dashboard'}));singleCards()
 }
 for(let n=0;n<3;n++){
  act(()=>window.history.back())
  await waitFor(()=>expect(screen.getByRole('button',{name:'Assignments & Exams',hidden:true})).toHaveAttribute('aria-pressed','true'))
  singleCards()
  act(()=>window.history.forward())
  await waitFor(()=>expect(screen.getByRole('button',{name:'Dashboard'})).toHaveAttribute('aria-pressed','true'))
  singleCards()
 }
 expect(errors.mock.calls.some(args=>String(args[0]).includes('same key'))).toBe(false)
})

test('direct planner links survive refresh and history restores the view and unsaved planner draft', async () => {
 const course={id:'cse-310',databaseId:'10000000-0000-0000-0000-000000000021',code:'CSE 310'}
 mock.items={load:vi.fn().mockResolvedValue([]),save:vi.fn(),complete:vi.fn(),remove:vi.fn()}
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile(),courses:[course],plannerCourses:[course]})
 window.history.replaceState(null,'','/?view=academic')
 const f=fake(session('a'))
 let page=render(<App client={f.client}/>)
 await screen.findByRole('button',{name:'Add item'})
 expect(screen.getByRole('button',{name:'Assignments & Exams',hidden:true})).toHaveAttribute('aria-pressed','true')
 page.unmount()
 page=render(<App client={f.client}/>)
 const add=await screen.findByRole('button',{name:'Add item'})
 await waitFor(()=>expect(add).toBeEnabled())
 fireEvent.click(add)
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Retained draft'}})
 // Browser navigation is available even when native modality blocks the page controls.
 act(()=>{window.history.pushState(null,'','/');window.dispatchEvent(new PopStateEvent('popstate'))})
 await waitFor(()=>expect(screen.getByRole('button',{name:'Dashboard'})).toHaveAttribute('aria-pressed','true'))
 expect(document.querySelector('.academic-editor-dialog[open]')).toBeNull()
 expect(document.body.style.overflow).not.toBe('hidden')
 act(()=>window.history.back())
 await waitFor(()=>expect(screen.getByRole('dialog')).toBeVisible())
 expect(screen.getByLabelText('Title')).toHaveValue('Retained draft')
 expect(window.location.search).toBe('?view=academic')
 page.unmount()
})

test('planner failures stay isolated and private drafts survive navigation but clear on signout',async()=>{
 mock.items={load:vi.fn().mockRejectedValueOnce(new Error('Academic storage unavailable')).mockResolvedValue([]),save:vi.fn(),complete:vi.fn(),remove:vi.fn()}
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile(),courses:[{id:'cse-310',databaseId:'10000000-0000-0000-0000-000000000021',code:'CSE 310'}], plannerCourses:[]})
 const f=fake(session('a'));render(<App client={f.client}/>);await screen.findByText('Student a')
 navigateHeader('Assignments & Exams');await screen.findByText('Academic storage unavailable')
 fireEvent.click(screen.getByRole('button',{name:'Dashboard'}));expect(screen.getByText('Student a')).toBeVisible()
 navigateHeader('Assignments & Exams');fireEvent.click(screen.getByRole('button',{name:'Retry academic items'}));await screen.findByText(/Nothing planned/)
 fireEvent.click(screen.getByRole('button',{name:'Add item'}));fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Private draft'}})
 // Native background blocking is verified in Chrome. External auth events must
 // tear down the account even while its modal has an unsaved draft.
 act(()=>f.emit(null));await screen.findByRole('button',{name:'Continue with Google'});expect(screen.queryByDisplayValue('Private draft')).not.toBeInTheDocument();expect(document.querySelector('dialog[open]')).toBeNull();expect(document.body.style.overflow).not.toBe('hidden')
})

test.each(['editor','discard','save','delete','deleting'] as const)('external account replacement tears down %s and ignores old results',async mode=>{
 const course={id:'cse-310',databaseId:'10000000-0000-0000-0000-000000000021',code:'CSE 310'}
 const item={id:'private-item',user_course_id:course.databaseId,title:'Private old item',type:'assignment' as const,due_date:'2026-10-23',due_time:null,notes:null,location:null,completed_at:null}
let resolveWrite!:(value:unknown)=>void
mock.items={load:vi.fn().mockResolvedValue([item]),save: vi.fn(() => new Promise<Awaited<ReturnType<AcademicApi['save']>>>(resolve => {
  resolveWrite = value => resolve(value as Awaited<ReturnType<AcademicApi['save']>>)
})),complete:vi.fn(),remove: vi.fn(() => new Promise<void>(resolve => {
  resolveWrite = () => resolve()
}))}
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile(),courses:[course], plannerCourses:[course]})
 const f=fake(session('a'));render(<App client={f.client}/>);await screen.findByText('Student a')
 navigateHeader('Assignments & Exams');await screen.findByRole('heading',{name:'Private old item'})
 if(mode==='delete'||mode==='deleting'){
   fireEvent.click(screen.getByRole('button',{name:'Actions for Private old item'}));fireEvent.click(screen.getByRole('menuitem',{name:'Delete'}))
   if(mode==='deleting')fireEvent.click(screen.getByRole('button',{name:/^Delete$/}))
 }else{
   fireEvent.click(screen.getByRole('button',{name:'Add item'}));fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Private unsaved draft'}})
   if(mode==='discard')fireEvent.click(screen.getByRole('button',{name:/^Cancel$/}))
   if(mode==='save'){fireEvent.change(screen.getByLabelText('Due date'),{target:{value:'2026-10-23'}});fireEvent.click(screen.getByRole('button',{name:'Save item'}))}
 }
 expect(document.querySelectorAll('dialog[open]')).toHaveLength(1)
 vi.mocked(mock.items.load).mockResolvedValue([]);vi.mocked(mock.api.load).mockResolvedValue({profile:profile('b'),courses:[course], plannerCourses:[course]})
 act(()=>f.emit('b'));await screen.findByText('Student b')
 if(mode==='save'||mode==='deleting')await act(async()=>resolveWrite(mode==='save'?{...item,title:'Private unsaved draft'}:undefined))
 expect(document.querySelector('dialog[open]')).toBeNull();expect(document.body.style.overflow).not.toBe('hidden')
 expect(screen.queryByText('Private old item')).not.toBeInTheDocument();expect(screen.queryByDisplayValue('Private unsaved draft')).not.toBeInTheDocument()
 expect(window.confirm).not.toHaveBeenCalled();expect(window.alert).not.toHaveBeenCalled()
})

test('classmate dialog clears across course, navigation and auth changes and ignores stale detail results',async()=>{
 const courses=[
  {id:'cse-310',databaseId:'course1',code:'CSE 310',section:'01',professorFirstName:'Ada',professorLastName:'Lovelace',verificationStatus:'verified' as const},
  {id:'ams-210',databaseId:'course2',code:'AMS 210',section:'02',professorFirstName:'Grace',professorLastName:'Hopper',verificationStatus:'verified' as const},
 ]
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile(),courses, plannerCourses:[]})
 const f=fake(session('a'))
 const abortSignals:AbortSignal[]=[]
 const profileResolvers:Array<(result:{data:unknown;error:null})=>void>=[]
 const classmateCalls:Array<Record<string,unknown>>=[]
 const rpc=vi.fn((name:string,args?:Record<string,unknown>)=>{
  if(name==='find_classmates_by_professor'){classmateCalls.push(args ?? {});return Promise.resolve({data:[{student_id:'peer',name:'Peer Name',major:'Math'}],error:null})}
  if(name==='get_classmate_profile_by_professor')return {abortSignal:(signal:AbortSignal)=>{abortSignals.push(signal);return new Promise<{data:unknown;error:null}>(resolve=>profileResolvers.push(resolve))}}
  return {abortSignal:async()=>({data:[],error:null})}
 })
 Object.assign(f.client,{rpc})
 render(<App client={f.client}/>);await screen.findByRole('button',{name:'View profile of Peer Name'})
 expect(classmateCalls[0]).toEqual({p_course_code:'CSE 310',p_section:'01',p_professor_first_name:'Ada',p_professor_last_name:'Lovelace'})
 fireEvent.click(screen.getByRole('button',{name:'View profile of Peer Name'}));expect(screen.getByRole('dialog')).toBeInTheDocument();await waitFor(()=>expect(profileResolvers).toHaveLength(1))
 fireEvent.click(screen.getByRole('button',{name:/AMS 210/}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(abortSignals[0].aborted).toBe(true)
 await act(async()=>profileResolvers[0]({data:{student_id:'peer',name:'Student Name',major:null,has_shared_avatar:false},error:null}));expect(screen.queryByText('Student Name')).not.toBeInTheDocument()
 await screen.findByRole('button',{name:'View profile of Peer Name'});expect(classmateCalls[1]).toEqual({p_course_code:'AMS 210',p_section:'02',p_professor_first_name:'Grace',p_professor_last_name:'Hopper'})
 fireEvent.click(screen.getByRole('button',{name:'View profile of Peer Name'}));await waitFor(()=>expect(profileResolvers).toHaveLength(2));navigateHeader('Study spaces');expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Dashboard'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'View profile of Peer Name'}));await waitFor(()=>expect(profileResolvers).toHaveLength(3));act(()=>f.emit(null));await screen.findByRole('button',{name:'Continue with Google'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(abortSignals[2].aborted).toBe(true)
 await act(async()=>profileResolvers[2]({data:{student_id:'peer',name:'Student Name',major:null,has_shared_avatar:false},error:null}));expect(screen.queryByText('Student Name')).not.toBeInTheDocument()
})

test.each(['editor','discard','save'] as const)('calendar %s tears down on external account replacement and ignores stale results',async mode=>{
 const course={id:'cse-310',databaseId:'10000000-0000-0000-0000-000000000021',code:'CSE 310'}
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const item={id:'private-calendar-item',user_course_id:course.databaseId,title:'Private calendar work',type:'assignment' as const,due_date:date,due_time:null,notes:'Private notes',location:null,completed_at:null}
let resolveWrite!:(value:unknown)=>void
mock.items={load:vi.fn().mockResolvedValue([item]),save: vi.fn(() => new Promise<Awaited<ReturnType<AcademicApi['save']>>>(resolve => {
  resolveWrite = value => resolve(value as Awaited<ReturnType<AcademicApi['save']>>)
})),complete:vi.fn(),remove:vi.fn()}
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile(),courses:[course], plannerCourses:[course]})
 const f=fake(session('a'));render(<App client={f.client}/>);await screen.findByText('Student a')
 navigateHeader('Assignments & Exams');await screen.findByRole('heading',{name:item.title});fireEvent.click(screen.getByRole('tab',{name:'Calendar'}))
 fireEvent.click(screen.getByRole('button',{name:/^Edit Private calendar work,/}));fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Private calendar draft'}})
 if(mode==='discard')fireEvent.click(screen.getByRole('button',{name:/^Cancel$/}))
 if(mode==='save')fireEvent.click(screen.getByRole('button',{name:'Save item'}))
 vi.mocked(mock.items.load).mockResolvedValue([]);vi.mocked(mock.api.load).mockResolvedValue({profile:profile('b'),courses:[course], plannerCourses:[course]})
 act(()=>f.emit('b'));await screen.findByText('Student b')
 if(mode==='save')await act(async()=>resolveWrite({...item,title:'Private calendar draft'}))
 expect(document.querySelector('dialog[open]')).toBeNull();expect(screen.queryByDisplayValue('Private calendar draft')).not.toBeInTheDocument();expect(screen.queryByText('Private calendar work')).not.toBeInTheDocument();expect(document.body.style.overflow).not.toBe('hidden')
 navigateHeader('Assignments & Exams');await screen.findByText(/Nothing planned/);expect(screen.getByRole('tab',{name:'Agenda'})).toHaveAttribute('aria-selected','true')
 fireEvent.click(screen.getByRole('tab',{name:'Calendar'}));act(()=>f.emit(null));await screen.findByRole('button',{name:'Continue with Google'});expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test.each(['draft','load','send','retry','reconnect'] as const)('messaging %s clears on account replacement; late work never enters the new account',async mode=>{
 const f=fake(session('a'));render(<App client={f.client}/>);await screen.findByText('Student a')
 fireEvent.click(screen.getByRole('button',{name:/^Messages$/}));await screen.findByRole('button',{name:/Message Peer/})
 let resolve!:(rows:Message[])=>void
 if(mode==='load')vi.mocked(mock.dm.history).mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 fireEvent.click(screen.getByRole('button',{name:/Message Peer/}))
 if(mode!=='load'){
  const input=await screen.findByRole('textbox',{name:'Message'});fireEvent.change(input,{target:{value:'Private old draft'}})
  if(mode==='send')vi.mocked(mock.dm.send).mockImplementationOnce(()=>new Promise(r=>{resolve=row=>r(row[0])}))
  if(mode==='retry')vi.mocked(mock.dm.send).mockRejectedValueOnce(new Error('Private old error'))
  if(mode==='send'||mode==='retry'){fireEvent.click(screen.getByRole('button',{name:/^Send$/}));if(mode==='retry')await screen.findByRole('button',{name:'Retry send'})}
  if(mode==='reconnect'){vi.mocked(mock.dm.history).mockImplementationOnce(()=>new Promise(r=>{resolve=r}));act(()=>window.dispatchEvent(new Event('online')));await waitFor(()=>expect(resolve).toBeTypeOf('function'))}
 }
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile('b'),courses:[], plannerCourses:[]});vi.mocked(mock.dm.inbox).mockResolvedValue([])
 act(()=>f.emit('b'));await screen.findByText('Student b')
 if(resolve)await act(async()=>resolve([{id:'late',conversation_id:'thread',sequence:2,sender_id:'a',client_message_id:'late',body:'Late private result',created_at:'2026-10-23T20:00:00Z'}]))
 expect(screen.queryByDisplayValue('Private old draft')).toBeNull();expect(screen.queryByText('Private old error')).toBeNull();expect(screen.queryByText('Saved private row')).toBeNull();expect(screen.queryByText('Late private result')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:/^Messages$/}));await screen.findByText(/No conversations yet/);expect(screen.queryByRole('textbox')).toBeNull()
 act(()=>f.emit(null));await screen.findByRole('button',{name:'Continue with Google'});expect(screen.queryByRole('heading',{name:'Messages'})).toBeNull()
})
test('classmate profile Message closes native dialog before focusing account chat; navigation drops draft',async()=>{
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile(),courses:[{id:'cse-310',databaseId:'course1',code:'CSE 310'}], plannerCourses:[]})
 const f=fake(session('a'));Object.assign(f.client,{rpc:(name:string)=>name==='find_classmates'?Promise.resolve({data:[{student_id:'peer',name:'Peer Name',major:'Math'}],error:null}):{abortSignal:async()=>({data:{student_id:'peer',name:'Peer Name',major:'Math',has_shared_avatar:false},error:null})}})
 render(<App client={f.client}/>);fireEvent.click(await screen.findByRole('button',{name:'View profile of Peer Name'}));await waitFor(()=>expect(screen.getByRole('button',{name:/^Message$/})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:/^Message$/}))
 await waitFor(()=>expect(screen.getByRole('heading',{name:'Message Peer'})).toHaveFocus());expect(document.querySelector('dialog[open]')).toBeNull()
 expect(mock.dm.contact).toHaveBeenCalledWith({student:'peer',course:'CSE 310'},expect.anything())
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Navigation draft'}});fireEvent.click(screen.getByRole('button',{name:'Dashboard'}));fireEvent.click(screen.getByRole('button',{name:/^Message$/}));expect(screen.queryByDisplayValue('Navigation draft')).toBeNull()
})

test.each(['create','add','send','retry','reconnect'] as const)('group %s tears down private state on App account replacement',async mode=>{
 let release!:(value:unknown)=>void
 const detail={group_id:'group',name:'Private group title',creator_id:'a',joined_after_sequence:0,last_read_sequence:0,members:[{student_id:'a',name:'Owner'},{student_id:'peer',name:'Ada'},{student_id:'other',name:'Grace'}]}
 const candidates=[{student_id:'peer',name:'Ada',major:null,can_add:true,reason:null},{student_id:'other',name:'Grace',major:null,can_add:true,reason:null},{student_id:'later',name:'Later friend',major:null,can_add:true,reason:null}]
 const saved={id:'group-row',conversation_id:'group',sender_id:'peer',sender_name:'Ada',client_message_id:'request',sequence:1,body:'Private group text',created_at:'2026-10-25T15:00:00Z'}
mock.dm.groups = {
  candidates: vi.fn().mockResolvedValue(candidates),
  detail: vi.fn().mockResolvedValue(detail),

  create: vi.fn(() => new Promise<Awaited<ReturnType<NonNullable<MessagingApi['groups']>['create']>>>(resolve => {
    release = value => resolve(value as Awaited<ReturnType<NonNullable<MessagingApi['groups']>['create']>>)
  })),

  add: vi.fn(() => new Promise<Awaited<ReturnType<NonNullable<MessagingApi['groups']>['add']>>>(resolve => {
    release = value => resolve(value as Awaited<ReturnType<NonNullable<MessagingApi['groups']>['add']>>)
  })),

  remove: vi.fn().mockResolvedValue(undefined),

  history: vi.fn().mockResolvedValue([saved]),

  send: vi.fn(() => new Promise<Message>(resolve => {
    release = value => resolve(value as Message)
  }))
}; vi.mocked(mock.dm.inbox).mockResolvedValue([{kind:'group',conversation_id:'group',student_id:null,name:detail.name,member_count:3,last_message_at:saved.created_at,message_time:saved.created_at,preview:saved.body}])
 const f=fake(session('a'));render(<App client={f.client}/>);await screen.findByText('Student a');fireEvent.click(screen.getByRole('button',{name:/^Messages$/}))
 if(mode==='create'){
  fireEvent.click(screen.getByText('New group'));fireEvent.click(await screen.findByRole('checkbox',{name:/Ada/}));fireEvent.click(screen.getByRole('checkbox',{name:/Grace/}));fireEvent.click(screen.getByText('Create group'))
 }else{
  fireEvent.click(await screen.findByRole('button',{name:/Private group title/}));await screen.findByRole('textbox',{name:'Messages'})
  if(mode==='add'){fireEvent.click(screen.getByText('Add members'));fireEvent.click(await screen.findByRole('checkbox',{name:/Later friend/}));fireEvent.click(screen.getByText('Add selected members'))}
  if(mode==='retry'){vi.mocked(mock.dm.groups!.send).mockRejectedValueOnce(Error('Private group failure'));fireEvent.change(screen.getByRole('textbox'),{target:{value:'Private group draft'}});fireEvent.click(screen.getByRole('button',{name:/^Send$/}));await screen.findByText('Retry send')}
  if(mode==='send'){fireEvent.change(screen.getByRole('textbox'),{target:{value:'Private group draft'}});fireEvent.click(screen.getByRole('button',{name:/^Send$/}))}
if (mode === 'reconnect') {
  vi.mocked(mock.dm.groups!.history).mockImplementationOnce(
    () => new Promise<Message[]>(resolve => {
      release = value => resolve(value as Message[])
    })
  )

  act(() => window.dispatchEvent(new Event('online')))
  await waitFor(() => expect(release).toBeTypeOf('function'))
} }
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile('b'),courses:[], plannerCourses:[]});vi.mocked(mock.dm.inbox).mockResolvedValue([]);act(()=>f.emit('b'));await screen.findByText('Student b')
 if(release)await act(async()=>release(mode==='reconnect'?[saved]:mode==='send'?{...saved,sender_id:'a'}:detail))
 expect(document.querySelector('dialog[open]')).toBeNull();expect(screen.queryByText('Private group title')).toBeNull();expect(screen.queryByText('Private group text')).toBeNull();expect(screen.queryByDisplayValue('Private group draft')).toBeNull();expect(screen.queryByText('Private group failure')).toBeNull()
 act(()=>f.emit(null));await screen.findByRole('button',{name:'Continue with Google'});expect(document.querySelector('dialog[open]')).toBeNull()
})
