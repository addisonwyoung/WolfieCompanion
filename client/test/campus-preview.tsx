// Synthetic browser fixture only. No Supabase; vector mode requires the runner to intercept provider requests.
import { createRoot } from 'react-dom/client'
import CampusExplorer from '../src/CampusExplorer'
import { campusCategories, CampusLocationError } from '../src/campusLocations'
import type { CampusLocation, CampusLocationsApi } from '../src/campusLocations'
import '../src/index.css'
import '../src/App.css'
let items: CampusLocation[] = Array.from({ length: 100 }, (_, index) => ({
  id: `fixture-${index}`, name: index === 0 ? 'Library printer' : index === 1 ? 'Library water' : `Campus resource ${index}`,
  category: index === 0 ? 'printer' : index === 1 ? 'drinking_water' : campusCategories[index % 5],
  latitude: 40.9143 + (index < 2 ? 0 : (index % 10) * 0.0002), longitude: -73.1234 + (index < 2 ? 0 : Math.floor(index / 10) * 0.0002),
  building: 'Local fixture library', floor: index === 1 ? '1' : '2', directions: 'Find the resource beside the stairs.', description: null, access_note: null,
  status: 'published', source_url: null, source_note: 'Synthetic browser check, not a real location.', verified_at: '2026-10-23T12:00:00Z', created_at: '', updated_at: '', revision: 1,
}))
const fixture = { loads: 0, saves: 0, removes: 0, lastSaved: null as CampusLocation | null }
Object.assign(window, { campusFixture: fixture })
const params = new URLSearchParams(location.search)
const editor = params.has('editor')
const api: CampusLocationsApi = {
  load: async () => { fixture.loads++; return items.map(item => ({ ...item })) }, canManage: async () => editor,
  save: async (input, target) => {
    if (!editor) throw new Error('Fixture is read-only')
    const previous = items.find(item => item.id === target?.id)
    if (target && previous?.revision !== target.revision) throw new CampusLocationError('conflict', 'Fixture revision conflict')
    const next = { ...input, id: previous?.id ?? `fixture-new-${fixture.saves}`, revision: (previous?.revision ?? 0) + 1, created_at: previous?.created_at || new Date().toISOString(), updated_at: new Date().toISOString() }
    fixture.saves++; fixture.lastSaved = next
    items = [...items.filter(item => item.id !== next.id), next]
    return next
  },
  remove: async (id, revision) => {
    if (!editor) throw new Error('Fixture is read-only')
    if (items.find(item => item.id === id)?.revision !== revision) throw new CampusLocationError('conflict', 'Fixture revision conflict')
    fixture.removes++; items = items.filter(item => item.id !== id)
  },
}
// Only this test entry enables intercepted vector requests; never a live key.
const vector = params.has('vector')
createRoot(document.getElementById('root')!).render(<main><CampusExplorer api={api} userId="fixture" config={{ key: vector ? 'offline-fixture-key' : '', mapId: vector ? 'offline-fixture' : '', feedback: '' }} /></main>)
