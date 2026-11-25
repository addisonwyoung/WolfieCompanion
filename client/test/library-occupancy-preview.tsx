import { createRoot } from 'react-dom/client'
import CrowdMeter from '../src/CrowdMeter'
import { libraryHistory, libraryReadings } from './libraryOccupancyFixtures'
import '../src/index.css'
import '../src/App.css'

// Synthetic, local-only browser fixture. Never requests SBU or private account data.
const preview = { requests: 0, histories: 0 }
const comparisonMode = new URLSearchParams(window.location.search).get('comparison')
let liveTime = Date.now()
Object.assign(window, { occupancyPreview: preview })
window.fetch = async url => {
  if (String(url).endsWith('/history')) {
    preview.histories++
    const history = libraryHistory(Date.now(), Number(String(url).split('/')[3]))
    if (comparisonMode && history.id === 1) {
      const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(liveTime))
      const bucket = history.buckets.find(bucket => bucket.hour === hour)!
      bucket.percentage = comparisonMode === 'less' ? 70 : comparisonMode === 'similar' ? 50 : 30
      bucket.count = bucket.percentage * history.capacity / 100
    }
    return new Response(JSON.stringify(history))
  }
  preview.requests++
  liveTime = Date.now()
  return new Response(JSON.stringify({ libraries: libraryReadings(liveTime) }))
}
createRoot(document.getElementById('root')!).render(<>
  <header className="site-header"><div className="header-inner"><span className="brand"><span className="brand-mark">W</span><strong>Wolfie Companion</strong></span><span>Study spaces</span></div></header>
  <main><CrowdMeter /></main><footer><span>Wolfie Companion</span><span>Local interface preview</span></footer>
</>)
