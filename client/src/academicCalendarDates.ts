import { campusZone, compareItems } from './academicItems'
import type { AcademicItem } from './academicItems'

const campusFormat = new Intl.DateTimeFormat('en-US', { timeZone: campusZone, year: 'numeric', month: '2-digit', day: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long' })
export function campusDate(now: Date) {
  const parts = Object.fromEntries(campusFormat.formatToParts(now).map(part => [part.type, part.value]))
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`
}
function anchor(year: number, month: number, day = 1) {
  const date = new Date(0)
  date.setUTCHours(12, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return date
}
export function monthCells(month: string): (string | null)[] {
  const [year, number] = month.split('-').map(Number)
  const first = anchor(year, number)
  const count = anchor(year, number + 1, 0).getUTCDate()
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null)
  for (let day = 1; day <= count; day++) cells.push(`${month}-${String(day).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return cells
}
export function shiftMonth(month: string, offset: -1 | 1): string | null {
  const [year, number] = month.split('-').map(Number)
  const index = (year - 1) * 12 + number - 1 + offset
  if (index < 0 || index >= 9999 * 12) return null
  return `${String(Math.floor(index / 12) + 1).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`
}
export function monthSelection(month: string, today: string) { return today.startsWith(`${month}-`) ? today : `${month}-01` }
export function readableDay(day: string) { return dayFormat.format(anchor(...day.split('-').map(Number) as [number, number, number])) }
export function readableMonth(month: string) { return monthFormat.format(anchor(...month.split('-').map(Number) as [number, number])) }
export function readableTime(time: string) {
  const [hours, minutes, seconds = '00'] = time.split(':')
  const hour = Number(hours)
  return `${hour % 12 || 12}:${minutes}${seconds !== '00' ? `:${seconds}` : ''} ${hour < 12 ? 'AM' : 'PM'}`
}
export function itemsByDate(items: AcademicItem[], month: string) {
  const days = new Map<string, AcademicItem[]>()
  for (const item of [...items].sort(compareItems)) {
    if (!item.due_date.startsWith(`${month}-`)) continue
    const list = days.get(item.due_date) ?? []
    list.push(item); days.set(item.due_date, list)
  }
  return days
}
