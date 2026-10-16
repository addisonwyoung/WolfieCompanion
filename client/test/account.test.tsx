import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import App from '../src/App'
import type { AccountApi, StudentProfile } from '../src/account'
const mock=vi.hoisted(()=>({api:{} as AccountApi}))
vi.mock('../src/account',async original=>({...await original<typeof import('../src/account')>(),accountApi:()=>mock.api}))
const profile=(id='a'):StudentProfile=>({id,name:`Student ${id}`,major:null,year:null,interests:[],residence_status:null,avatar_path:null})
const session=(id:string)=>({user:{id},access_token:`token-${id}`}) as Session
function fake(initial:Session|null=null){
 let current=initial;let listener:(event:string,s:Session|null)=>void=()=>{}
 const unsubscribe=vi.fn()
 const auth={getSession:vi.fn(async()=>({data:{session:current},error:null})),onAuthStateChange:vi.fn((fn:typeof listener)=>{listener=fn;return {data:{subscription:{unsubscribe}}}}),signInWithOAuth:vi.fn(async()=>({error:null})),signOut:vi.fn(async()=>{current=null;listener('SIGNED_OUT',null);return {error:null}})}
 return {client:{auth} as unknown as SupabaseClient,auth,unsubscribe,emit:(id:string|null,event='SIGNED_IN')=>{current=id?session(id):null;listener(event,current)}}
}
beforeEach(()=>{mock.api={eligible:vi.fn().mockResolvedValue(true),load:vi.fn().mockResolvedValue({profile:profile(),courses:[]}),saveClasses:vi.fn().mockResolvedValue([{id:'cse-310',code:'CSE 310',sections:['01']}]),saveProfile:vi.fn(async p=>({profile:p,cleanupPath:null})),pictureUrl:vi.fn(),removeObject:vi.fn()}})
test('Google start failure, cancellation and unsubscribe',async()=>{
 const f=fake();const v=render(<App client={f.client}/>);await screen.findByRole('button',{name:'Continue with Google'})
 f.auth.signInWithOAuth.mockResolvedValueOnce({error:{message:'failed'}} as never);fireEvent.click(screen.getByRole('button',{name:'Continue with Google'}));expect(await screen.findByRole('alert')).toHaveTextContent('could not start')
 fireEvent.click(screen.getByRole('button',{name:'Continue with Google'}));await waitFor(()=>expect(f.auth.signInWithOAuth).toHaveBeenCalledTimes(2));expect(f.auth.signInWithOAuth).toHaveBeenLastCalledWith(expect.objectContaining({provider:'google',options:expect.objectContaining({redirectTo:expect.stringContaining('/auth/callback')})}))
 v.unmount();expect(f.unsubscribe).toHaveBeenCalled();window.history.replaceState({},'','/auth/callback?error=access_denied');render(<App client={fake().client}/>);expect(await screen.findByRole('alert')).toHaveTextContent('canceled');window.history.replaceState({},'','/')
})
test('restores empty account, manual classes call persistence, signout clears state',async()=>{
 const f=fake(session('a'));render(<App client={f.client}/>);await screen.findByText('Student a');expect(screen.getByText(/No saved classes yet/)).toBeInTheDocument();expect(screen.queryByText('Alex Morgan')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Enter classes manually'}));fireEvent.change(screen.getByLabelText('Manual course code 1'),{target:{value:'cse310'}});fireEvent.change(screen.getByLabelText('Manual section 1'),{target:{value:'01'}});fireEvent.click(screen.getByRole('button',{name:'Save classes',exact:true}));expect(await screen.findByRole('heading',{name:'Classmates in CSE 310'})).toBeInTheDocument();expect(mock.api.saveClasses).toHaveBeenCalledWith([{code:'cse310',section:'01'}])
 fireEvent.click(screen.getByRole('button',{name:'Sign out'}));await screen.findByRole('button',{name:'Continue with Google'});expect(screen.queryByText('Student a')).not.toBeInTheDocument()
})
test('ineligible signs out, failed load retries',async()=>{
 const f=fake(session('a'));vi.mocked(mock.api.eligible).mockResolvedValueOnce(false);const v=render(<App client={f.client}/>);expect(await screen.findByText(/Use a verified @stonybrook.edu/)).toBeInTheDocument();expect(mock.api.load).not.toHaveBeenCalled();v.unmount()
 vi.mocked(mock.api.load).mockRejectedValueOnce(new Error('Unable to load.'));render(<App client={fake(session('a')).client}/>);fireEvent.click(await screen.findByRole('button',{name:'Retry loading account'}));expect(await screen.findByText('Student a')).toBeInTheDocument()
})
test('late A cannot populate B and refresh does not discard workspace',async()=>{
 let resolveA!:(data:Awaited<ReturnType<AccountApi['load']>>)=>void
 vi.mocked(mock.api.load).mockImplementationOnce(()=>new Promise(r=>{resolveA=r})).mockResolvedValueOnce({profile:profile('b'),courses:[]});const f=fake(session('a'));render(<App client={f.client}/>);await waitFor(()=>expect(mock.api.load).toHaveBeenCalledTimes(1));act(()=>{f.emit(null);f.emit('b')});await screen.findByText('Student b')
 await act(async()=>resolveA({profile:profile('a'),courses:[{id:'bad',code:'AAA 100'}]}));expect(screen.queryByText('Student a')).not.toBeInTheDocument();act(()=>f.emit('b','TOKEN_REFRESHED'));expect(screen.getByText('Student b')).toBeInTheDocument();expect(mock.api.load).toHaveBeenCalledTimes(2);act(()=>f.emit(null));await screen.findByRole('button',{name:'Continue with Google'})
})
test('missing config is actionable',()=>{render(<App client={null}/>);expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL')})
