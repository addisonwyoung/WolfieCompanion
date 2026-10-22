// Local browser fixture only. No Supabase client, credentials, or hosted requests.
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import AcademicPlanner from '../src/AcademicPlanner'
import type { AcademicApi, AcademicItem } from '../src/academicItems'
import '../src/index.css'
import '../src/App.css'

const course = { id: 'cse-310', databaseId: '10000000-0000-0000-0000-000000000021', code: 'CSE 310' }
type Mode = 'ok' | 'fail' | 'wait'
const control = {
  saveMode: 'ok' as Mode, deleteMode: 'ok' as Mode,
  saveCalls: 0, deleteCalls: 0, backgroundClicks: 0,
  releaseSave: null as (() => void) | null, releaseDelete: null as (() => void) | null,
  switchAccount: () => {},
}
declare global { interface Window { academicFixture: typeof control } }
window.academicFixture = control
function fixtureApi(owner: string): AcademicApi {
  const key = `wolfie-academic-browser-fixture:${owner}`
  const read = (): AcademicItem[] => JSON.parse(localStorage.getItem(key) ?? '[]')
  const write = (rows: AcademicItem[]) => localStorage.setItem(key, JSON.stringify(rows))
  return {
    load: async () => read(),
    save: async (value, id = crypto.randomUUID()) => {
      control.saveCalls++
      if (control.saveMode === 'wait') await new Promise<void>(resolve => { control.releaseSave = resolve })
      if (control.saveMode === 'fail') { control.saveMode = 'ok'; throw new Error('Unable to save fixture item. Please retry.') }
      const item = { ...value, id }; write([...read().filter(row => row.id !== id), item]); return item
    },
    complete: async (id, done) => { const item = { ...read().find(row => row.id === id)!, completed_at: done ? new Date().toISOString() : null }; write(read().map(row => row.id === id ? item : row)); return item },
    remove: async id => {
      control.deleteCalls++
      if (control.deleteMode === 'wait') await new Promise<void>(resolve => { control.releaseDelete = resolve })
      if (control.deleteMode === 'fail') { control.deleteMode = 'ok'; throw new Error('Unable to delete fixture item. Please retry.') }
      write(read().filter(row => row.id !== id))
    },
  }
}
export default function Fixture() {
  const [owner, setOwner] = useState('a')
  useEffect(() => { control.switchAccount = () => setOwner(previous => previous === 'a' ? 'b' : 'a') }, [])
  const api = useMemo(() => fixtureApi(owner), [owner])
  return <><button id="fixture-background" onClick={() => { control.backgroundClicks++ }}>Background navigation</button><AcademicPlanner key={owner} api={api} courses={[course]} onAddCourses={() => {}} /></>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
