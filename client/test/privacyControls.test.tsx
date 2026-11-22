import { StrictMode } from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import Profile from '../src/Profile'
import { BlockedStudentsSection, SharedGroupWarningBanner, StudentBlockAction } from '../src/StudentPrivacyControls'
import { useStudentPrivacy } from '../src/useStudentPrivacy'
import { useSharedGroupWarnings } from '../src/useSharedGroupWarnings'
import { privacyChangedEvent } from '../src/studentPrivacy'
import type { BlockedStudent, SharedGroupWarning, StudentPrivacyApi } from '../src/studentPrivacy'
import type { StudentProfile } from '../src/account'
import { normalizeProfile } from '../src/account'
import { useClassmates } from '../src/useClassmates'
import { useCourseRecommendations } from '../src/useCourseRecommendations'
import { useFriendships } from '../src/useFriendships'
import type { FriendApi } from '../src/friendshipApi'
import type { SupabaseClient } from '@supabase/supabase-js'

const id = (n: number) => `19000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const actor=id(1), student=id(2), group=id(3), nextGroup=id(4)
const warning: SharedGroupWarning = { warning_id: id(5), blocked_student_id: student, name: 'Authorized group name' }
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes,no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function fixture() {
  let records: BlockedStudent[] = []
  const api = { blocks: vi.fn(async () => records), block: vi.fn(async (student: string) => { records = [{ student_id: student, created_at: '2026-11-21T00:00:00Z', name_snapshot: null }] }), unblock: vi.fn(async () => { records = [] }),
    warnings: vi.fn().mockResolvedValue([warning]), dismiss: vi.fn().mockResolvedValue(undefined), groupPicture: vi.fn() } satisfies StudentPrivacyApi
  return api
}
const profile: StudentProfile = { id: actor, is_private: true, name: 'Owner', major: null, year: null, residence_status: null, interests: [], avatar_path: null, dm_permission: 'friends_only', allow_group_additions: false, share_avatar: false }
afterEach(() => { vi.useRealTimers() })

test('private mode starts from server truth, retains failed drafts and independent preferences, and confirms a successful save', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined)
  const { rerender } = render(<Profile profile={profile} onSave={save} />)
  expect(screen.getByRole('status', { name: 'Profile visibility' })).toHaveTextContent('Private')
  fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
  const toggle = screen.getByRole('switch', { name: 'Private Mode' })
  expect(toggle).toBeChecked(); fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  await screen.findByText('Offline'); expect(toggle).not.toBeChecked()
  expect(screen.getByRole('status', { name: 'Profile save status' })).toBeEmptyDOMElement()
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  await screen.findByRole('button', { name: 'Edit profile' })
  expect(save.mock.calls[1][0]).toMatchObject({ is_private: false, dm_permission: 'friends_only', allow_group_additions: false, share_avatar: false })
  rerender(<Profile profile={{ ...profile, is_private: false }} onSave={save} />)
  expect(screen.getByRole('status', { name: 'Profile visibility' })).toHaveTextContent('Public')
  expect(screen.getByRole('status', { name: 'Profile save status' })).toHaveTextContent('Profile saved.')
})

test('missing or malformed private mode is never defaulted to public', () => {
  expect(() => normalizeProfile({ ...profile, is_private: undefined } as unknown as StudentProfile)).toThrow('Privacy settings are unavailable')
  expect(() => normalizeProfile({ ...profile, is_private: 'false' } as unknown as StudentProfile)).toThrow('Privacy settings are unavailable')
})

test('blocked management uses snapshots/fallbacks only and retries a failed unblock', async () => {
  const api=fixture()
  api.blocks.mockResolvedValue([{ student_id: student, created_at: '2026-11-21T00:00:00Z', name_snapshot: null }])
  api.unblock.mockRejectedValueOnce(new Error('Internal data')).mockResolvedValue(undefined)
  function Workspace() { const privacy=useStudentPrivacy(api,actor); return <BlockedStudentsSection privacy={privacy} /> }
  render(<Workspace />); fireEvent.click(screen.getByText('Blocked Students'))
  fireEvent.click(await screen.findByRole('button', { name: 'Unblock Blocked student' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm unblock' }))
  await screen.findByRole('alert'); expect(screen.queryByText('Internal data')).not.toBeInTheDocument()
  api.blocks.mockResolvedValue([])
  fireEvent.click(screen.getByRole('button', { name: 'Retry privacy change' }))
  await screen.findByText('You have not blocked any students.')
  expect(api.unblock).toHaveBeenCalledTimes(2)
  expect(api.unblock).toHaveBeenLastCalledWith(student,actor,expect.any(AbortSignal))
  expect(api.groupPicture).not.toHaveBeenCalled()
})

test('block requires confirmation, stays pending until success, and invalidates once', async () => {
  const api=fixture(), change=deferred<void>(), changed=vi.fn(), closed=vi.fn()
  api.block.mockReturnValue(change.promise)
  window.addEventListener(privacyChangedEvent,changed)
  function Workspace() { const privacy=useStudentPrivacy(api,actor); return <StudentBlockAction privacy={privacy} student={student} name="Authorized profile" onBlocked={closed} /> }
  const mounted=render(<Workspace />)
  await waitFor(()=>expect(api.blocks).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button',{name:'Block Authorized profile'}))
  expect(api.block).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Confirm block'}))
  expect(screen.getByRole('button',{name:'Saving privacy change…'})).toBeDisabled()
  api.blocks.mockResolvedValue([{ student_id: student, created_at: '2026-11-21T00:00:00Z', name_snapshot: null }])
  await act(async()=>change.resolve())
  expect(closed).toHaveBeenCalledOnce(); expect(changed).toHaveBeenCalledOnce()
  mounted.unmount(); window.removeEventListener(privacyChangedEvent,changed)
})

test('privacy changes refetch classmates and recommendations without keeping old results', async () => {
  const roster=vi.fn().mockResolvedValue([{student_id:student,name:'Previously visible',major:null}])
  const recommend=vi.fn().mockResolvedValue([])
  const {result}=renderHook(()=>({ roster:useClassmates(roster,actor,'CSE 416','01','Ada','Lovelace'), recommendations:useCourseRecommendations(recommend,actor,'CSE 416','01','Ada','Lovelace') }))
  await waitFor(()=>expect(result.current.roster.status).toBe('success'))
  roster.mockResolvedValue([])
  act(()=>window.dispatchEvent(new Event(privacyChangedEvent)))
  await waitFor(()=>expect(roster).toHaveBeenCalledTimes(2))
  expect(recommend).toHaveBeenCalledTimes(2)
  expect(result.current.roster.classmates).toEqual([])
})

test('StrictMode shares initial block and warning requests; ordinary rerenders do not refetch warnings', async () => {
  const api=fixture(), pending=deferred<SharedGroupWarning[]>();api.warnings.mockReturnValue(pending.promise)
  const {result,rerender}=renderHook(()=>({blocks:useStudentPrivacy(api,actor),warnings:useSharedGroupWarnings(api,actor,'messaging',group)}), {wrapper:StrictMode})
  await waitFor(()=>expect(api.warnings).toHaveBeenCalledTimes(1))
  expect(api.blocks).toHaveBeenCalledTimes(1);rerender();expect(api.warnings).toHaveBeenCalledTimes(1)
  await act(async()=>pending.resolve([warning]));expect(result.current.warnings.warnings).toEqual([warning])
})

test('no unopened or unauthorized warning context invokes the mutating RPC', async () => {
  const api=fixture()
  const {rerender}=renderHook(({groupId})=>useSharedGroupWarnings(api,actor,'study',groupId),{initialProps:{groupId:null as string|null}})
  expect(api.warnings).not.toHaveBeenCalled()
  rerender({groupId:group});await waitFor(()=>expect(api.warnings).toHaveBeenCalledOnce())
  expect(api.warnings).toHaveBeenCalledWith('study',group,actor,expect.any(AbortSignal))
})

test('warning dismissal is server confirmed, survives a fresh component session, and does not write localStorage', async () => {
  const api=fixture(), pending=deferred<void>(), storage=vi.spyOn(Storage.prototype,'setItem')
  api.dismiss.mockReturnValue(pending.promise)
  const first=renderHook(()=>useSharedGroupWarnings(api,actor,'messaging',group))
  await waitFor(()=>expect(first.result.current.warnings).toHaveLength(1))
  act(()=>{void first.result.current.dismiss(warning.warning_id)})
  expect(first.result.current.warnings).toHaveLength(1);expect(first.result.current.pending.has(warning.warning_id)).toBe(true)
  api.warnings.mockResolvedValue([]);await act(async()=>pending.resolve())
  await waitFor(()=>expect(first.result.current.warnings).toEqual([]));first.unmount()
  const second=renderHook(()=>useSharedGroupWarnings(api,actor,'messaging',group))
  await waitFor(()=>expect(second.result.current.loading).toBe(false));expect(second.result.current.warnings).toEqual([])
  expect(storage).not.toHaveBeenCalled()
})

test('dismissal failure retains its banner and retry removes only the confirmed ID', async () => {
  const api=fixture();api.dismiss.mockRejectedValueOnce(new Error('Lost reply'))
  render(<SharedGroupWarningBanner api={api} userId={actor} context="study" groupId={group} onLeave={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button',{name:'Dismiss notice about Authorized group name'}))
  const retry=await screen.findByRole('button',{name:'Retry dismissal for Authorized group name'})
  expect(screen.getByText(/You blocked Authorized group name/)).toBeInTheDocument()
  api.warnings.mockResolvedValue([]);fireEvent.click(retry)
  await waitFor(()=>expect(screen.queryByText(/You blocked Authorized group name/)).not.toBeInTheDocument())
  expect(api.dismiss).toHaveBeenCalledTimes(2)
})

test('a delayed pre-dismiss fetch cannot restore an old UUID or hide a new episode', async () => {
  const api=fixture(), oldRead=deferred<SharedGroupWarning[]>()
  const {result}=renderHook(()=>useSharedGroupWarnings(api,actor,'messaging',group))
  await waitFor(()=>expect(result.current.warnings).toHaveLength(1))
  api.warnings.mockReturnValueOnce(oldRead.promise).mockResolvedValue([{...warning,warning_id:id(6)}])
  act(()=>{void result.current.retry()});await waitFor(()=>expect(api.warnings).toHaveBeenCalledTimes(2))
  await act(async()=>result.current.dismiss(warning.warning_id))
  expect(result.current.warnings).toEqual([])
  await act(async()=>oldRead.resolve([warning]))
  await waitFor(()=>expect(result.current.warnings.map(row=>row.warning_id)).toEqual([id(6)]))
})

test('group changes and membership denial clear warnings and ignore late responses', async () => {
  const api=fixture(), old=deferred<SharedGroupWarning[]>()
  api.warnings.mockReturnValueOnce(old.promise).mockResolvedValue([])
  const {result,rerender}=renderHook(({selected})=>useSharedGroupWarnings(api,actor,'messaging',selected),{initialProps:{selected:group}})
  rerender({selected:nextGroup});await act(async()=>old.resolve([warning]))
  await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.warnings).toEqual([])
  api.warnings.mockRejectedValue(Object.assign(new Error('Group unavailable'),{code:'42501'}))
  await act(async()=>result.current.retry());expect(result.current.warnings).toEqual([])
})

test('logout discards block and warning responses; later login starts with separate state', async () => {
  const api=fixture(), blocks=deferred<[]>(), notices=deferred<SharedGroupWarning[]>()
  api.blocks.mockReturnValueOnce(blocks.promise);api.warnings.mockReturnValueOnce(notices.promise)
  const first=renderHook(()=>({blocks:useStudentPrivacy(api,actor),warnings:useSharedGroupWarnings(api,actor,'study',group)}))
  first.unmount();await act(async()=>{blocks.resolve([]);notices.resolve([warning])})
  api.warnings.mockResolvedValue([])
  const next=renderHook(()=>({blocks:useStudentPrivacy(api,id(8)),warnings:useSharedGroupWarnings(api,id(8),'study',nextGroup)}))
  await waitFor(()=>expect(next.result.current.warnings.loading).toBe(false))
  expect(next.result.current.warnings.warnings).toEqual([]);expect(next.result.current.blocks.blocks).toEqual([])
})

test('unmounted block operation cannot invalidate a subsequent session', async () => {
  const api=fixture(), operation=deferred<void>(), changed=vi.fn()
  api.block.mockReturnValue(operation.promise);window.addEventListener(privacyChangedEvent,changed)
  const {result,unmount}=renderHook(()=>useStudentPrivacy(api,actor))
  await waitFor(()=>expect(result.current.loading).toBe(false))
  let response!:Promise<boolean>;act(()=>{response=result.current.mutate(student,true)})
  unmount();await act(async()=>operation.resolve());expect(await response).toBe(false)
  expect(changed).not.toHaveBeenCalled();window.removeEventListener(privacyChangedEvent,changed)
})

test('invalid authentication removes previously loaded block identities and warnings',async()=>{
  const api=fixture()
  api.blocks.mockResolvedValue([{student_id:student,created_at:'2026-11-21T00:00:00Z',name_snapshot:'Saved private label'}])
  const {result}=renderHook(()=>({blocks:useStudentPrivacy(api,actor),warnings:useSharedGroupWarnings(api,actor,'study',group)}))
  await waitFor(()=>expect(result.current.blocks.blocks).toHaveLength(1))
  await waitFor(()=>expect(result.current.warnings.warnings).toHaveLength(1))
  const invalid=Object.assign(new Error('Expired session'),{code:'PGRST301'})
  api.blocks.mockRejectedValue(invalid);api.warnings.mockRejectedValue(invalid)
  await act(async()=>{await result.current.blocks.refresh();await result.current.warnings.retry()})
  expect(result.current.blocks.blocks).toEqual([]);expect(result.current.warnings.warnings).toEqual([])
})

test('a failed block never invalidates caches or claims success, and remains retryable',async()=>{
  const api=fixture(),changed=vi.fn();api.block.mockRejectedValueOnce(new Error('Offline'))
  window.addEventListener(privacyChangedEvent,changed)
  const {result}=renderHook(()=>useStudentPrivacy(api,actor))
  await waitFor(()=>expect(result.current.loading).toBe(false))
  await act(async()=>{await expect(result.current.mutate(student,true)).rejects.toThrow('Offline')})
  expect(changed).not.toHaveBeenCalled();expect(result.current.outgoing.has(student)).toBe(false)
  await act(async()=>{await result.current.mutate(student,true)})
  expect(changed).toHaveBeenCalledOnce();expect(api.block).toHaveBeenCalledTimes(2)
  window.removeEventListener(privacyChangedEvent,changed)
})

test('confirmed privacy changes refresh friendships and request state without relying on Realtime',async()=>{
  const api={inbox:vi.fn().mockResolvedValue([]),friends:vi.fn().mockResolvedValue([]),relationships:vi.fn().mockResolvedValue([])} as unknown as FriendApi
  const client={} as SupabaseClient
  const {result}=renderHook(()=>useFriendships(api,client,actor,null,null))
  await waitFor(()=>expect(result.current.friends.status).toBe('success'))
  act(()=>window.dispatchEvent(new Event(privacyChangedEvent)))
  await waitFor(()=>expect(api.inbox).toHaveBeenCalledTimes(2))
  expect(api.friends).toHaveBeenCalledTimes(2)
})

test('a lost block reply followed by reconciliation never turns a retry into an unblock',async()=>{
  const api=fixture()
  api.block.mockImplementationOnce(async()=>{
    api.blocks.mockResolvedValue([{student_id:student,created_at:'2026-11-21T00:00:00Z',name_snapshot:null}])
    throw new Error('Reply lost after commit')
  })
  function Workspace(){const privacy=useStudentPrivacy(api,actor);return <><StudentBlockAction privacy={privacy} student={student} name="Known student"/><button onClick={()=>void privacy.refresh()}>Reconcile blocks</button></>}
  render(<Workspace/>);await waitFor(()=>expect(api.blocks).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button',{name:'Block Known student'}));fireEvent.click(screen.getByRole('button',{name:'Confirm block'}))
  await screen.findByRole('button',{name:'Retry privacy change'})
  fireEvent.click(screen.getByRole('button',{name:'Reconcile blocks'}))
  await waitFor(()=>expect(api.blocks).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button',{name:'Retry privacy change'}))
  await waitFor(()=>expect(api.block).toHaveBeenCalledTimes(2));expect(api.unblock).not.toHaveBeenCalled()
})


test('confirmed unblock invalidates an old warning read even when fresh reconciliation fails; a new episode can appear',async()=>{
 const api=fixture(),old=deferred<SharedGroupWarning[]>();api.warnings.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('Offline'))
 const {result}=renderHook(()=>useSharedGroupWarnings(api,actor,'messaging',group))
 await waitFor(()=>expect(api.warnings).toHaveBeenCalledOnce())
 act(()=>window.dispatchEvent(new Event(privacyChangedEvent)))
 expect(result.current.warnings).toEqual([])
 await act(async()=>old.resolve([warning]))
 await waitFor(()=>expect(result.current.error).toContain('could not be refreshed'))
 expect(api.warnings).toHaveBeenCalledTimes(2);expect(result.current.warnings).toEqual([])
 api.warnings.mockResolvedValue([{...warning,warning_id:id(9)}])
 await act(async()=>result.current.retry())
 expect(result.current.warnings.map(row=>row.warning_id)).toEqual([id(9)])
})

test('privacy invalidation clears visible warnings and drains reconciliation after failed dismissal',async()=>{
 const api=fixture(),dismiss=deferred<void>();api.dismiss.mockReturnValueOnce(dismiss.promise)
 const {result}=renderHook(()=>useSharedGroupWarnings(api,actor,'study',group))
 await waitFor(()=>expect(result.current.warnings).toHaveLength(1))
 act(()=>{void result.current.dismiss(warning.warning_id)})
 act(()=>window.dispatchEvent(new Event(privacyChangedEvent)))
 expect(result.current.warnings).toEqual([])
 api.warnings.mockResolvedValue([{...warning,warning_id:id(9)}])
 await act(async()=>dismiss.reject(new Error('Lost reply')))
 await waitFor(()=>expect(result.current.warnings.map(row=>row.warning_id)).toEqual([id(9)]))
 expect(api.warnings).toHaveBeenCalledTimes(2)
})


test.each([false,true])('blocked settings expand and collapse with populated=%s, using snapshots only',async(populated)=>{
 const api=fixture();api.blocks.mockResolvedValue(populated?[{student_id:student,created_at:'2026-11-21T00:00:00Z',name_snapshot:'Saved label'}]:[])
 function Workspace(){const privacy=useStudentPrivacy(api,actor);return <BlockedStudentsSection privacy={privacy}/>}
 const {container}=render(<Workspace/>);const details=container.querySelector('details')!
 expect(details.open).toBe(false);fireEvent.click(screen.getByText('Blocked Students'))
 await waitFor(()=>expect(details.open).toBe(true))
 if(populated)expect(await screen.findByRole('button',{name:'Unblock Saved label'})).toBeVisible()
 else expect(await screen.findByText('You have not blocked any students.')).toBeVisible()
 fireEvent.click(screen.getByText('Blocked Students'));expect(details.open).toBe(false)
 expect(api.groupPicture).not.toHaveBeenCalled()
})

test('private switch is labeled and described, and draft changes do not claim persisted state while saving',async()=>{
 const pending=deferred<void>(),save=vi.fn(()=>pending.promise)
 render(<Profile profile={{...profile,is_private:false}} onSave={save}/>)
 fireEvent.click(screen.getByRole('button',{name:'Edit profile'}))
 const control=screen.getByRole('switch',{name:'Private Mode'})
 expect(control).not.toBeChecked();expect(control).toHaveAccessibleDescription(/Private Mode hides you/)
 expect(screen.getAllByRole('switch')).toHaveLength(6)
 fireEvent.click(control);expect(control).toBeChecked();expect(save).not.toHaveBeenCalled()
 expect(screen.getByRole('status', { name: 'Profile visibility' })).toHaveTextContent('Public')
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));expect(control).toBeDisabled()
 expect(screen.getByRole('status', { name: 'Profile visibility' })).toHaveTextContent('Public')
 await act(async()=>pending.reject(new Error('Save unavailable')))
 expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable');expect(control).toBeEnabled();expect(control).toBeChecked()
 expect(screen.getByRole('status', { name: 'Profile visibility' })).toHaveTextContent('Public')
})
