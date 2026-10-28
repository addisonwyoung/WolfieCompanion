import type { SupabaseClient } from '@supabase/supabase-js'
import type { ItemType } from './academicItems'
export const reminderOffsets = ['week', 'three_days', 'day', 'three_hours'] as const
export type ReminderOffset = typeof reminderOffsets[number]
export type ReminderSettings = { enabled: boolean } & Record<ItemType, ReminderOffset[]>
export const defaultReminderSettings: ReminderSettings = { enabled: true, assignment: ['day'], quiz: ['day'], exam: ['week', 'day'], project: ['week', 'day'] }
export const offsetLabel = (key: ReminderOffset, timed = true) => ({ week: timed ? '1 week before' : '7 days before at 9 AM', three_days: timed ? '3 days before' : '3 days before at 9 AM', day: timed ? '24 hours before' : 'Day before at 9 AM', three_hours: '3 hours before' })[key]
export interface AcademicReminder { id: string; item_id: string; title: string; course_code: string; item_type: ItemType; offset_key: ReminderOffset; due_at: string; delivered_at: string; read_at: string | null; deadline_date: string; deadline_time: string | null }
export interface ReminderPage { rows: AcademicReminder[]; unread: number }
export interface ReminderApi {
 refresh(signal: AbortSignal): Promise<void>
 list(signal: AbortSignal, before?: AcademicReminder): Promise<ReminderPage>
 settings(signal: AbortSignal): Promise<ReminderSettings>
 saveSettings(value: ReminderSettings): Promise<ReminderSettings>
 read(id: string): Promise<void>
 clear(id: string): Promise<void>
 bound(): Promise<number>
 clearAll(bound: number): Promise<void>
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v)
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Invalid reminder response'); return v as Record<string, unknown> }
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
export function parseOffsets(v: unknown): ReminderOffset[] { if (!Array.isArray(v) || v.length > 4 || v.some(k => !reminderOffsets.includes(k)) || new Set(v).size !== v.length) throw Error('Choose valid, distinct reminder times.'); return reminderOffsets.filter(k => v.includes(k)) }
export function parseSettings(v: unknown): ReminderSettings { const r = object(v); if (typeof r.enabled !== 'boolean') throw Error('Invalid reminder settings'); return { enabled: r.enabled, assignment: parseOffsets(r.assignment), exam: parseOffsets(r.exam), quiz: parseOffsets(r.quiz), project: parseOffsets(r.project) } }
export function parseReminder(v: unknown): AcademicReminder {
 const r = object(v)
 if (!uuid(r.id) || !uuid(r.item_id) || typeof r.title !== 'string' || !r.title.trim() || typeof r.course_code !== 'string' || !/^[A-Z]{2,4} [0-9]{3}$/.test(r.course_code) || !['assignment','exam','quiz','project'].includes(String(r.item_type)) || !reminderOffsets.includes(r.offset_key as ReminderOffset) || !date(r.due_at) || !date(r.delivered_at) || !(r.read_at === null || date(r.read_at)) || typeof r.deadline_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.deadline_date) || !(r.deadline_time === null || typeof r.deadline_time === 'string' && /^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(r.deadline_time))) throw Error('Invalid reminder response')
 return Object.fromEntries(['id','item_id','title','course_code','item_type','offset_key','due_at','delivered_at','read_at','deadline_date','deadline_time'].map(k => [k,r[k]])) as unknown as AcademicReminder
}
export function reminderFailure(error: { code?: string } | null) { return Error(['42P01','42883','PGRST202','PGRST205'].includes(error?.code ?? '') ? 'Reminders are not set up yet. The project owner must apply the reviewed reminder migration. Your coursework is still available.' : error?.code === '42501' ? 'This reminder is unavailable for your account.' : 'Reminders could not be updated. Please retry.') }
export function reminderApi(client: SupabaseClient): ReminderApi {
 async function write(name: string, args?: Record<string, unknown>) { const { data, error } = await client.rpc(name,args); if(error) throw reminderFailure(error); return data }
 async function read(name: string, signal: AbortSignal, args?: Record<string, unknown>) { const { data,error } = await client.rpc(name,args).abortSignal(signal); if(error) throw reminderFailure(error); return data }
 const checkId = (id:string) => { if(!uuid(id)) throw Error('Invalid reminder') }
 return {
  async refresh(signal) { await read('academic_reminders_refresh',signal) },
  async list(signal,before) { const r=object(await read('academic_reminders_list',signal,{p_before:before?.delivered_at??null,p_before_id:before?.id??null})); if(!Array.isArray(r.rows)||r.rows.length>20||!Number.isSafeInteger(r.unread)||Number(r.unread)<0) throw Error('Invalid reminder page'); const rows=r.rows.map(parseReminder);if(new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('Duplicate reminders'); return {rows,unread:Number(r.unread)} },
  async settings(signal) { return parseSettings(await read('academic_reminder_settings',signal)) },
  async saveSettings(value) { return parseSettings(await write('academic_reminder_settings_save',{p_settings:parseSettings(value)})) },
  async read(id) {checkId(id);await write('academic_reminder_read',{p_id:id})},
  async clear(id) {checkId(id);await write('academic_reminder_clear',{p_id:id})},
  async bound() {const n=await write('academic_reminders_bound');if(!Number.isSafeInteger(n)||Number(n)<0)throw Error('Invalid clear boundary');return Number(n)},
  async clearAll(bound) {if(!Number.isSafeInteger(bound)||bound<0)throw Error('Invalid clear boundary');await write('academic_reminders_clear_all',{p_bound:bound})},
 }
}
