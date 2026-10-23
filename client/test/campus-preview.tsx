// Synthetic browser fixture only. No Supabase, tile provider or external requests.
import { createRoot } from 'react-dom/client'
import CampusExplorer from '../src/CampusExplorer'
import { campusCategories } from '../src/campusLocations'
import type { CampusLocation, CampusLocationsApi } from '../src/campusLocations'
import '../src/index.css'
import '../src/App.css'
const items: CampusLocation[] = Array.from({ length: 100 }, (_, index) => ({
  id: `fixture-${index}`, name: index === 0 ? 'Library printer' : index === 1 ? 'Library water' : `Campus resource ${index}`,
  category: index === 0 ? 'printer' : index === 1 ? 'drinking_water' : campusCategories[index % 5],
  latitude: 40.9143 + (index < 2 ? 0 : (index % 10) * 0.0002), longitude: -73.1234 + (index < 2 ? 0 : Math.floor(index / 10) * 0.0002),
  building: 'Local fixture library', floor: index === 1 ? '1' : '2', directions: 'Find the resource beside the stairs.', description: null, access_note: null,
  status: 'published', source_url: null, source_note: 'Synthetic browser check, not a real location.', verified_at: '2026-10-23T12:00:00Z', created_at: '', updated_at: '', revision: 1,
}))
const fixture = { loads: 0 }
Object.assign(window, { campusFixture: fixture })
const api: CampusLocationsApi = { load: async () => { fixture.loads++; return items }, canManage: async () => false, save: async () => { throw new Error('Fixture is read-only') }, remove: async () => { throw new Error('Fixture is read-only') } }
createRoot(document.getElementById('root')!).render(<main><CampusExplorer api={api} userId="fixture" config={{ key: '', mapId: '', feedback: '' }} /></main>)
