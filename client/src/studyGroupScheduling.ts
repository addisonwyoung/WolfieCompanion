export const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export type Weekday = typeof weekdays[number]
export interface WeeklyAvailability { day: Weekday; start: number; end: number }
export type SharedWindow = WeeklyAvailability
interface TimeRange { start: number; end: number }

function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = [...ranges].filter(range => Number.isFinite(range.start) && Number.isFinite(range.end)
    && range.start >= 0 && range.end <= 1440 && range.start < range.end)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: TimeRange[] = []
  for (const range of sorted) {
    const previous = merged.at(-1)
    if (!previous || range.start > previous.end) merged.push({ ...range })
    else previous.end = Math.max(previous.end, range.end)
  }
  return merged
}

function intersectRanges(left: readonly TimeRange[], right: readonly TimeRange[]): TimeRange[] {
  const result: TimeRange[] = []
  let leftIndex = 0; let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    const first = left[leftIndex]; const second = right[rightIndex]
    if (!first || !second) break
    const start = Math.max(first.start, second.start); const end = Math.min(first.end, second.end)
    if (start < end) result.push({ start, end })
    if (first.end <= second.end) leftIndex++
    if (second.end <= first.end) rightIndex++
  }
  return mergeRanges(result)
}

/** Returns recurring weekly windows shared by every member and long enough for the meeting. */
export function findSharedWindows(memberAvailability: readonly (readonly WeeklyAvailability[])[], durationMinutes: number): SharedWindow[] {
  if (!memberAvailability.length || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return []
  const shared: SharedWindow[] = []
  for (const day of weekdays) {
    const first = memberAvailability[0]
    if (!first) return []
    let overlap = mergeRanges(first.filter(window => window.day === day))
    for (let index = 1; index < memberAvailability.length && overlap.length; index++) {
      const windows = memberAvailability[index]
      if (!windows) return []
      overlap = intersectRanges(overlap, mergeRanges(windows.filter(window => window.day === day)))
    }
    for (const range of overlap) if (range.end - range.start >= durationMinutes) shared.push({ day, ...range })
  }
  return shared
}

export function timeToMinutes(value: string): number | null {
  const twelveHour = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim())
  if (twelveHour) {
    const hour = Number(twelveHour[1]); const minute = Number(twelveHour[2])
    if (hour < 1 || hour > 12 || minute > 59) return null
    return (hour % 12 + (twelveHour[3]?.toUpperCase() === 'PM' ? 12 : 0)) * 60 + minute
  }
  const twentyFourHour = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (twentyFourHour) return Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2])
  return value.trim() === '24:00' ? 1440 : null
}

export function formatTime(minutes: number): string {
  if (minutes === 1440) return '12:00 AM'
  const hour = Math.floor(minutes / 60); const minute = minutes % 60
  const period = hour < 12 ? 'AM' : 'PM'; const displayHour = hour % 12 || 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
}
