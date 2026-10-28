import { parseOffsets } from './academicReminders'
import type { ReminderOffset } from './academicReminders'
import type { SupabaseClient } from '@supabase/supabase-js'

export const itemTypes = ['assignment', 'exam', 'quiz', 'project'] as const
export type ItemType = typeof itemTypes[number]
export interface AcademicInput {
  reminder_offsets?: ReminderOffset[] | null;
  user_course_id: string; title: string; type: ItemType; due_date: string
  due_time: string | null; notes: string | null; location: string | null; completed_at: string | null
}
export interface AcademicItem extends AcademicInput { id: string }
const columns = 'id,user_course_id,title,type,due_date,due_time,notes,location,completed_at,reminder_offsets'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function normalizeItem(input: AcademicInput): AcademicInput {
  const result: AcademicInput = {
    user_course_id: input.user_course_id, title: input.title.trim(), type: input.type,
    due_date: input.due_date, due_time: input.due_time || null,
    notes: input.notes?.trim() || null, location: input.location?.trim() || null,
    completed_at: input.completed_at,
  }
  if ('reminder_offsets' in input) {result.reminder_offsets=input.reminder_offsets==null?null:parseOffsets(input.reminder_offsets);if(!result.due_time&&result.reminder_offsets?.includes('three_hours'))throw Error('Three-hour reminders require a due time.')}
  if (!uuid.test(result.user_course_id)) throw new Error('Choose a saved course.')
  if (!result.title || result.title.length > 200) throw new Error('Enter a title of 1 to 200 characters.')
  if (!itemTypes.includes(result.type)) throw new Error('Choose a listed item type.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.due_date) || result.due_date < '0001-01-01' || Number.isNaN(Date.parse(result.due_date)) || new Date(result.due_date).toISOString().slice(0, 10) !== result.due_date) throw new Error('Enter a valid due date.')
  if (result.due_time && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(result.due_time)) throw new Error('Enter a valid time or leave it blank.')
  if ((result.notes?.length ?? 0) > 5000) throw new Error('Notes must be at most 5000 characters.')
  if ((result.location?.length ?? 0) > 200) throw new Error('Location must be at most 200 characters.')
  if (result.completed_at && Number.isNaN(Date.parse(result.completed_at))) throw new Error('Invalid completion date.')
  return result
}
function failure(error: { code?: string } | null, action: string) {
  if (error?.code === 'PGRST205' || error?.code === '42P01') return new Error('Academic item storage is not set up yet. The project owner must manually apply the reviewed migration. Your draft is retained; retry afterward.')
  return new Error(`Unable to ${action}. Please retry.`)
}
export function academicItemsApi(client: SupabaseClient) {
  let reminderColumns=true
  const selection=()=>reminderColumns?columns:columns.replace(',reminder_offsets','')
  return {
    async load(): Promise<AcademicItem[]> {
      let { data, error } = await client.from('academic_items').select(selection()).order('due_date')
      if(error&&['42703','PGRST204'].includes(error.code)){reminderColumns=false;const fallback=await client.from('academic_items').select(selection()).order('due_date');data=fallback.data;error=fallback.error}
      if (error) throw failure(error, 'load academic items')
      return (data ?? []) as unknown as AcademicItem[]
    },
    async save(input: AcademicInput, id?: string): Promise<AcademicItem> {
      const value = normalizeItem(input)
      if(!reminderColumns&&'reminder_offsets' in value)throw new Error('Reminder storage is not set up yet. Your draft is retained; ask the owner to apply the migration.')
      const table = client.from('academic_items')
      const query = id ? table.update(value).eq('id', id) : table.insert(value)
      const { data, error } = await query.select(selection()).single()
      if (error || !data) throw failure(error, 'save this item')
      return data as unknown as AcademicItem
    },
    async complete(id: string, completed: boolean): Promise<AcademicItem> {
      const { data, error } = await client.from('academic_items').update({ completed_at: completed ? new Date().toISOString() : null }).eq('id', id).select(selection()).single()
      if (error || !data) throw failure(error, 'update completion')
      return data as unknown as AcademicItem
    },
    async remove(id: string): Promise<void> {
      // Returning the deleted ID distinguishes a committed deletion from a zero-row RLS result.
      const { data, error } = await client.from('academic_items').delete().eq('id', id).select('id').single()
      if (error || !data) throw failure(error, 'delete this item')
    },
  }
}
export type AcademicApi = ReturnType<typeof academicItemsApi>

export const campusZone = 'America/New_York'
const clockFormat = new Intl.DateTimeFormat('en-US', { timeZone: campusZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
export type ItemGroup = 'Overdue' | 'Today' | 'Upcoming' | 'Completed'
export function itemGroup(item: AcademicItem, now = new Date()): ItemGroup {
  if (item.completed_at) return 'Completed'
  const parts = Object.fromEntries(clockFormat.formatToParts(now).map(p => [p.type, p.value]))
  const date = `${parts.year}-${parts.month}-${parts.day}`
  const time = `${parts.hour}:${parts.minute}:${parts.second}`
  if (item.due_date < date || (item.due_date === date && item.due_time && item.due_time.padEnd(8, ':00') < time)) return 'Overdue'
  return item.due_date === date ? 'Today' : 'Upcoming'
}
export function compareItems(a: AcademicItem, b: AcademicItem) {
  return a.due_date.localeCompare(b.due_date) || (a.due_time ?? '99:99').localeCompare(b.due_time ?? '99:99') || a.id.localeCompare(b.id)
}
