import { campusZone } from './academicItems'
import { occupancyStatus } from './libraryOccupancyApi'
import type { LibraryHistory, LiveLibraryReading } from './libraryOccupancyApi'

const campusHour = new Intl.DateTimeFormat('en-US', { timeZone: campusZone, hour: 'numeric', hourCycle: 'h23' })

/** A unique usable retrieval-hour bucket, also used for the chart's initial selection. */
export function matchingHistoricalHourIndex(live: LiveLibraryReading | undefined, history: LibraryHistory | null) {
  if (!live || !history || history.status !== 'available' || history.id !== live.id
    || history.capacity !== live.capacity || !live.retrievedAt || !Number.isFinite(Date.parse(live.retrievedAt))) return null
  const hour = Number(campusHour.format(new Date(live.retrievedAt)))
  const matching = history.buckets.map((bucket, index) => ({ bucket, index })).filter(item => item.bucket.hour === hour)
  if (matching.length !== 1) return null
  const { bucket, index } = matching[0]!
  if (typeof bucket.count !== 'number' || !Number.isFinite(bucket.count) || bucket.count < 0
    || typeof bucket.percentage !== 'number' || !Number.isFinite(bucket.percentage) || bucket.percentage < 0) return null
  return index
}

/** Uses existing data only. Historical hour numbers are assumed to be campus-local. */
export function compareOccupancy(live: LiveLibraryReading | undefined, history: LibraryHistory | null, now: number | undefined) {
  if (!live || !history || now === undefined || !Number.isFinite(now) || history.status !== 'available'
    || history.id !== live.id || history.capacity !== live.capacity || occupancyStatus(live, now) !== 'fresh'
    || !live.retrievedAt || !Number.isFinite(Date.parse(live.retrievedAt)) || Date.parse(live.retrievedAt) > now
    || !live.freshUntil || !Number.isFinite(Date.parse(live.freshUntil))
    || typeof live.population !== 'number' || !Number.isFinite(live.population) || live.population < 0
    || !Number.isFinite(live.capacity) || live.capacity <= 0) return null
  const index = matchingHistoricalHourIndex(live, history)
  if (index === null) return null
  const bucket = history.buckets[index]!
  const hour = bucket.hour
  // The live DTO percentage is rounded/capped for its meter; recompute the actual percentage.
  const livePercentage = live.population / live.capacity * 100
  if (!Number.isFinite(livePercentage)) return null
  const historicalPercentage = bucket.percentage!
  const difference = livePercentage - historicalPercentage
  // Absorb floating-point arithmetic noise at exactly ten points, not display rounding.
  const epsilon = Number.EPSILON * Math.max(1, livePercentage, historicalPercentage) * 4
  const tone = difference <= -10 + epsilon ? 'less' : difference >= 10 - epsilon ? 'busier' : 'similar'
  const label = tone === 'less' ? 'Less busy than usual' : tone === 'busier' ? 'Busier than usual' : 'About as busy as usual'
  return { tone, label, livePercentage, historicalPercentage, hour }
}
