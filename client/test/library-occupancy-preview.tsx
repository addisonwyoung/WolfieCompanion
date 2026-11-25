import { createRoot } from 'react-dom/client'
import CrowdMeter from '../src/CrowdMeter'
import { libraryHistory, libraryReadings } from './libraryOccupancyFixtures'
import '../src/index.css'
import '../src/App.css'

// Synthetic, local-only browser fixture. Never requests SBU or private account data.
const preview = { requests: 0, histories: 0 }
const comparisonMode = new URLSearchParams(window.location.search).get('comparison')
const recoveryMode = new URLSearchParams(window.location.search).get('recovery')
const recovery = { release: () => {} }
let liveTime = Date.now()
Object.assign(window, { occupancyPreview: preview })
Object.assign(window, { occupancyRecovery: recovery })
window.fetch = async (url, init) => {
  const historical = String(url).endsWith('/history')
  const recovering = recoveryMode === (historical ? 'history' : 'live')
  const count = historical ? ++preview.histories : ++preview.requests
  if (recovering && count === 1) return new Response('', { status: 503 })
  if (recovering && count === 2) await new Promise<void>((resolve, reject) => {
    recovery.release = resolve
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
  if (String(url).endsWith('/history')) {
    const history = libraryHistory(Date.now(), Number(String(url).split('/')[3]))
    if (comparisonMode && history.id === 1) {
      const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(liveTime))
      const bucket = history.buckets.find(bucket => bucket.hour === hour)!
      bucket.percentage = comparisonMode === 'less' ? 70 : comparisonMode === 'similar' ? 50 : 30
      bucket.count = bucket.percentage * history.capacity / 100
    }
    return new Response(JSON.stringify(history))
  }
  liveTime = Date.now()
  return new Response(JSON.stringify({ libraries: libraryReadings(liveTime) }))
}
createRoot(document.getElementById('root')!).render(<>
  <header className="site-header"><div className="header-inner"><span className="brand"><span className="brand-mark">W</span><strong>Wolfie Companion</strong></span><span>Study spaces</span></div></header>
  <main><CrowdMeter /></main><footer><span>Wolfie Companion</span><span>Local interface preview</span></footer>
</>)
