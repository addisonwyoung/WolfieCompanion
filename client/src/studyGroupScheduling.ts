export const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export type Weekday = typeof weekdays[number]

export interface WeeklyAvailability {
  day: Weekday
  start: number
  end: number
}

export type SharedWindow = WeeklyAvailability

interface TimeRange { start: number; end: number }

function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = [...ranges]
    .filter(range => Number.isFinite(range.start) && Number.isFinite(range.end) && range.start >= 0 && range.end <= 1440 && range.start < range.end)
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
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    const first = left[leftIndex]
    const second = right[rightIndex]
    if (!first || !second) break
    const start = Math.max(first.start, second.start)
    const end = Math.min(first.end, second.end)
    if (start < end) result.push({ start, end })
    if (first.end <= second.end) leftIndex++
    if (second.end <= first.end) rightIndex++
  }
  return mergeRanges(result)
}

/** Finds recurring weekly windows shared by every member and long enough for the meeting. */
export function findSharedWindows(memberAvailability: readonly (readonly WeeklyAvailability[])[], durationMinutes: number): SharedWindow[] {
  if (!memberAvailability.length || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return []
  const shared: SharedWindow[] = []
  for (const day of weekdays) {
    const firstMemberRanges = memberAvailability[0]
    if (!firstMemberRanges) return []
    let overlap = mergeRanges(firstMemberRanges.filter(window => window.day === day))
    for (let memberIndex = 1; memberIndex < memberAvailability.length && overlap.length; memberIndex++) {
      const availability = memberAvailability[memberIndex]
      if (!availability) return []
      overlap = intersectRanges(overlap, mergeRanges(availability.filter(window => window.day === day)))
    }
    for (const range of overlap) {
      if (range.end - range.start >= durationMinutes) shared.push({ day, start: range.start, end: range.end })
    }
  }
  return shared
}

export function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour < 24 && minute < 60 ? hour * 60 + minute : null
}

export function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
}
