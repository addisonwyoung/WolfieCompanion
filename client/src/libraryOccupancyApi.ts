export interface LiveLibraryReading {
  id: number
  name: string
  capacity: number
  population: number | null
  percentage: number | null
  crowdLevel: 'Low' | 'Moderate' | 'Busy' | null
  estimatedRemainingCapacity: number | null
  status: 'fresh' | 'stale' | 'unavailable'
  retrievedAt: string | null
  freshUntil: string | null
  usableUntil: string | null
  sourceUrl: string
}

export const occupancySource = 'https://library.stonybrook.edu/how-busy-are-the-libraries/'

export interface HistoricalBucket {
  hour: number
  referenceDateTime: string
  count: number | null
  percentage: number | null
}
export interface LibraryHistory {
  id: number
  capacity: number
  status: 'available' | 'unavailable'
  weeks: '52' | '48,49,50' | '49,50,51'
  bucketMinutes: 60
  buckets: HistoricalBucket[]
  retrievedAt: string | null
  expiresAt: string | null
  sourceUrl: string
}

export async function loadLibraryHistory(id: number, signal: AbortSignal): Promise<LibraryHistory> {
  if (!Number.isInteger(id) || id < 1 || id > 5) throw new Error('Unknown library')
  const expectedWeeks = id <= 3 ? '52' : id === 4 ? '48,49,50' : '49,50,51'
  const timeout = new AbortController()
  const timer = window.setTimeout(() => timeout.abort(), 8000)
  try {
    const response = await fetch(`/api/libraries/${id}/history`, {
      signal: AbortSignal.any([signal, timeout.signal]), cache: 'no-store',
    })
    if (!response.ok) throw new Error('Historical occupancy unavailable')
    const value: LibraryHistory = await response.json()
    if (!value || value.id !== id || !Number.isFinite(value.capacity) || value.capacity <= 0
      || value.sourceUrl !== occupancySource || value.weeks !== expectedWeeks || value.bucketMinutes !== 60 || !Array.isArray(value.buckets)) throw new Error('Invalid history response')
    if (value.status === 'unavailable' && value.buckets.length === 0) return value
    if (value.status !== 'available' || value.buckets.length !== 24
      || typeof value.retrievedAt !== 'string' || !Number.isFinite(Date.parse(value.retrievedAt))
      || typeof value.expiresAt !== 'string' || Date.parse(value.expiresAt) !== Date.parse(value.retrievedAt) + 3_600_000
      || !value.buckets.every((bucket, index, buckets) => {
        const previous = buckets[index - 1]
        return bucket && Number.isInteger(bucket.hour) && bucket.hour >= 0 && bucket.hour <= 23
          && typeof bucket.referenceDateTime === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:00:00$/.test(bucket.referenceDateTime)
          && Number(bucket.referenceDateTime.slice(11, 13)) === bucket.hour
          && (!previous || (bucket.hour === (previous.hour + 1) % 24 && bucket.referenceDateTime > previous.referenceDateTime))
          && (bucket.percentage === null || (typeof bucket.percentage === 'number' && Number.isFinite(bucket.percentage) && bucket.percentage >= 0))
      }) || !value.buckets.some(bucket => bucket.percentage !== null)) throw new Error('Invalid historical buckets')
    return value
  } finally { window.clearTimeout(timer) }
}

function validReading(value: unknown): value is LiveLibraryReading {
  if (!value || typeof value !== 'object') return false
  const row = value as LiveLibraryReading
  if (!Number.isInteger(row.id) || row.id < 1 || row.id > 5 || typeof row.name !== 'string'
    || !Number.isFinite(row.capacity) || row.capacity <= 0 || row.sourceUrl !== occupancySource) return false
  if (row.status === 'unavailable') return [row.population, row.percentage, row.crowdLevel,
    row.estimatedRemainingCapacity, row.retrievedAt, row.freshUntil, row.usableUntil].every(value => value === null)
  return (row.status === 'fresh' || row.status === 'stale')
    && typeof row.population === 'number' && Number.isFinite(row.population) && row.population >= 0
    && typeof row.percentage === 'number' && Number.isFinite(row.percentage) && row.percentage >= 0 && row.percentage <= 100
    && ['Low', 'Moderate', 'Busy'].includes(row.crowdLevel ?? '')
    && typeof row.estimatedRemainingCapacity === 'number' && Number.isFinite(row.estimatedRemainingCapacity) && row.estimatedRemainingCapacity >= 0
    && [row.retrievedAt, row.freshUntil, row.usableUntil].every(date => typeof date === 'string' && Number.isFinite(Date.parse(date)))
    && Date.parse(row.freshUntil!) === Date.parse(row.retrievedAt!) + 300_000
    && Date.parse(row.usableUntil!) === Date.parse(row.retrievedAt!) + 1_800_000
}

export async function loadLibraryOccupancy(signal: AbortSignal): Promise<LiveLibraryReading[]> {
  const timeout = new AbortController()
  const timer = window.setTimeout(() => timeout.abort(), 8000)
  try {
    const response = await fetch('/api/libraries', {
      signal: AbortSignal.any([signal, timeout.signal]), cache: 'no-store',
    })
    if (!response.ok) throw new Error('Library occupancy could not be loaded.')
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('libraries' in body) || !Array.isArray(body.libraries)
      || body.libraries.length !== 5 || !body.libraries.every(validReading)
      || new Set(body.libraries.map(row => row.id)).size !== 5) {
      throw new Error('Library occupancy returned an unexpected response.')
    }
    return body.libraries
  } catch (error) {
    if (timeout.signal.aborted) throw new Error('Library occupancy is taking too long to respond.', { cause: error })
    throw error
  } finally { window.clearTimeout(timer) }
}

/** Display-only freshness: never initiates requests or renews provider timestamps. */
export function occupancyStatus(row: LiveLibraryReading, now: number): LiveLibraryReading['status'] {
  if (row.status === 'unavailable' || !row.usableUntil || now > Date.parse(row.usableUntil)) return 'unavailable'
  return row.status === 'stale' || now >= Date.parse(row.freshUntil!) ? 'stale' : 'fresh'
}
