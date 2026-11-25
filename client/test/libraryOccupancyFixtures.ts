import type { LibraryHistory, LiveLibraryReading } from '../src/libraryOccupancyApi'
import { occupancySource } from '../src/libraryOccupancyApi'

export function libraryReadings(time: number): LiveLibraryReading[] {
  return [
    { id: 1, name: 'North Reading Room', capacity: 900, population: 450 },
    { id: 2, name: 'Central Reading Room', capacity: 300, population: 250 },
    { id: 3, name: 'Health Sciences Library', capacity: 350, population: 220 },
    { id: 4, name: 'Music Library', capacity: 110, population: 0 },
    { id: 5, name: '3rd Floor', capacity: 300, population: null },
  ].map(row => {
    const percentage = row.population === null ? null : Math.min(100, Math.round(row.population / row.capacity * 100))
    return { ...row, percentage, crowdLevel: percentage === null ? null : percentage > 80 ? 'Busy' : percentage > 50 ? 'Moderate' : 'Low',
      estimatedRemainingCapacity: row.population === null ? null : Math.max(0, row.capacity - row.population),
      status: percentage === null ? 'unavailable' : 'fresh',
      retrievedAt: percentage === null ? null : new Date(time).toISOString(),
      freshUntil: percentage === null ? null : new Date(time + 300_000).toISOString(),
      usableUntil: percentage === null ? null : new Date(time + 1_800_000).toISOString(), sourceUrl: occupancySource }
  })
}

export function libraryHistory(time: number, id = 1): LibraryHistory {
  const capacity = libraryReadings(time).find(row => row.id === id)!.capacity
  return { id, capacity, status: 'available', weeks: id <= 3 ? '52' : id === 4 ? '48,49,50' : '49,50,51', bucketMinutes: 60,
    retrievedAt: new Date(time).toISOString(), expiresAt: new Date(time + 3_600_000).toISOString(), sourceUrl: occupancySource,
    buckets: Array.from({ length: 24 }, (_, index) => {
      const hour = (16 + index) % 24
      const percentage = index === 1 ? null : index === 2 ? 112 : index === 0 ? 0 : Math.max(0, 82 - index * 3)
      return { hour, referenceDateTime: `2026-11-${index < 8 ? '17' : '18'} ${String(hour).padStart(2, '0')}:00:00`,
        count: percentage === null ? null : percentage * capacity / 100, percentage }
    }) }
}
