import { campusZone } from './academicItems'
import { readableDay, readableTime } from './academicCalendarDates'

const timestampFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: campusZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit',
})
const timestampDateFormat = new Intl.DateTimeFormat('en-US', { timeZone: campusZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const timestampTimeFormat = new Intl.DateTimeFormat('en-US', { timeZone: campusZone, hour: 'numeric', minute: '2-digit' })
export function readableTimestamp(value: string) { return timestampFormat.format(new Date(value)) }
export function readableTimestampDate(value: string) { return timestampDateFormat.format(new Date(value)) }
export function readableTimestampTime(value: string) { return timestampTimeFormat.format(new Date(value)) }
export function readableDeadline(date: string, time: string | null) {
  // Calendar dates and wall times are already in campus time; never parse them as instants.
  return `${readableDay(date, true)}${time ? ` at ${readableTime(time)}` : ''}`
}
