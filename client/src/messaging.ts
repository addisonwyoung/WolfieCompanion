import type { SupabaseClient } from '@supabase/supabase-js'
export interface Contact { student_id: string; name: string; conversation_id: string | null; can_send: boolean; reason: 'closed' | 'unavailable' | null }
export interface Message { id: string; conversation_id: string; sequence: number; sender_id: string; client_message_id: string; body: string; created_at: string }
export interface Conversation { conversation_id: string; student_id: string; name: string; last_message_at: string; preview: string }
export interface Target { student: string; course?: string }
export interface MessagingApi {
 contact(target: Target, signal: AbortSignal): Promise<Contact | null>
 inbox(signal: AbortSignal, before?: Conversation): Promise<Conversation[]>
 history(id: string, signal: AbortSignal, before?: number, after?: number): Promise<Message[]>
 send(target: Target, body: string, request: string): Promise<Message>
}
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
// ECMAScript whitespace matches the explicit server-side character set.
const whitespace = /^\s*$/u
export function validateMessage(body: string) { if (whitespace.test(body) || Array.from(body).length > 2000 || body.includes('\0')) throw new Error('Enter text of 1 to 2000 characters.') }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid messaging response'); return value as Record<string, unknown> }
function identifier(value: unknown): value is string { return typeof value === 'string' && uuid.test(value) }
function text(value: unknown): value is string { return typeof value === 'string' }
function date(value: unknown): value is string { return text(value) && Number.isFinite(Date.parse(value)) }
export function parseContact(value: unknown, student: string): Contact | null {
 if (value === null) return null
 const row = object(value)
 if (!identifier(row.student_id) || row.student_id !== student || !text(row.name) || !row.name.trim() || !(row.conversation_id === null || identifier(row.conversation_id)) || typeof row.can_send !== 'boolean' || row.can_send !== (row.reason === null) || ![null,'closed','unavailable'].includes(row.reason as null)) throw new Error('Invalid messaging contact')
 return { student_id: row.student_id, name: row.name, conversation_id: row.conversation_id as string | null, can_send: row.can_send, reason: row.reason as Contact['reason'] }
}
export function parseMessage(value: unknown, conversation?: string): Message {
 const r = object(value)
 if (!identifier(r.id) || !identifier(r.conversation_id) || (conversation && r.conversation_id !== conversation) || !Number.isSafeInteger(r.sequence) || Number(r.sequence) <= 0 || !identifier(r.sender_id) || !identifier(r.client_message_id) || !text(r.body) || !date(r.created_at)) throw new Error('Invalid message')
 validateMessage(r.body)
 return { id: r.id, conversation_id: r.conversation_id, sequence: Number(r.sequence), sender_id: r.sender_id, client_message_id: r.client_message_id, body: r.body, created_at: r.created_at }
}
export function parseConversation(value: unknown): Conversation {
 const r = object(value)
 if (!identifier(r.conversation_id) || !identifier(r.student_id) || !text(r.name) || !r.name.trim() || !date(r.last_message_at) || !text(r.preview)) throw new Error('Invalid conversation')
 return { conversation_id: r.conversation_id, student_id: r.student_id, name: r.name, last_message_at: r.last_message_at, preview: r.preview }
}
function rows<T>(value: unknown, parse: (value: unknown) => T): T[] { if (!Array.isArray(value) || value.length > 50) throw new Error('Invalid message page'); return value.map(parse) }
function failure(error: { code?: string } | null) {
 return new Error(error?.code === 'P0001' ? 'This person has closed new direct messages.' : error?.code === '42501' ? 'Messaging is unavailable for this contact.' : ['PGRST202','42P01','42883'].includes(error?.code ?? '') ? 'Messaging is not set up yet. The project owner must apply the reviewed migration.' : 'Messaging could not be completed. Please retry.')
}
export function messagingApi(client: SupabaseClient): MessagingApi {
 return {
  async contact(target, signal) { if(!identifier(target.student))throw new Error('Invalid contact');const {data,error}=await client.rpc('dm_contact_state',{p_student_id:target.student,p_course_code:target.course??null}).abortSignal(signal);if(error)throw failure(error);return parseContact(data,target.student) },
  async inbox(signal,before) { if(before)parseConversation(before);const {data,error}=await client.rpc('dm_inbox',{p_before_activity:before?.last_message_at??null,p_before_id:before?.conversation_id??null,p_limit:50}).abortSignal(signal);if(error)throw failure(error);return rows(data,parseConversation) },
  async history(id,signal,before,after) { if(!identifier(id))throw new Error('Invalid conversation');if ((before!==undefined&&(!Number.isSafeInteger(before)||before<=0))||(after!==undefined&&(!Number.isSafeInteger(after)||after<0))||(before!==undefined&&after!==undefined))throw new Error('Invalid history cursor');const {data,error}=await client.rpc('dm_history',{p_conversation_id:id,p_before_sequence:before??null,p_after_sequence:after??null,p_limit:50}).abortSignal(signal);if(error)throw failure(error);return rows(data,row=>parseMessage(row,id)) },
  async send(target,body,request) { if(!identifier(target.student)||!identifier(request))throw new Error('Invalid send request');validateMessage(body);const {data,error}=await client.rpc('dm_send_message',{p_student_id:target.student,p_body:body,p_client_message_id:request,p_course_code:target.course??null});if(error)throw failure(error);const row=parseMessage(data);if(row.client_message_id!==request||row.body!==body)throw new Error('Send could not be confirmed. Please retry.');return row },
 }
}
