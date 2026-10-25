import type { SupabaseClient } from '@supabase/supabase-js'
import type { Conversation, Message } from './messaging'
import { parseMessage, validateMessage } from './messaging'
export type ConversationKind='direct'|'group'
export const conversationKey=(id:string,kind:ConversationKind='direct')=>`${kind}:${id}`
export interface GroupMember {student_id:string;name:string}
export interface GroupDetail {group_id:string;name:string;creator_id:string|null;joined_after_sequence:number;last_read_sequence:number;members:GroupMember[]}
export interface GroupCandidate extends GroupMember {major:string|null;can_add:boolean;reason:'closed'|'unavailable'|null}
export interface GroupApi {
 candidates(search:string,signal:AbortSignal,before?:GroupCandidate,group?:string):Promise<GroupCandidate[]>
 detail(id:string,signal:AbortSignal):Promise<GroupDetail>
 create(name:string,members:string[],request:string):Promise<GroupDetail>
 add(id:string,members:string[],request:string):Promise<GroupDetail>
 remove(id:string,member:string):Promise<GroupDetail>
 history(id:string,signal:AbortSignal,before?:number,after?:number):Promise<Message[]>
 send(id:string,body:string,request:string):Promise<Message>
}
export const isUuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)
const integer=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0
const string=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0
const date=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value))
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid group response');return value as Record<string,unknown>}
function member(value:unknown):GroupMember{const r=object(value);if(!isUuid(r.student_id)||!string(r.name))throw Error('Invalid group member');return {student_id:r.student_id,name:r.name}}
export function parseGroup(value:unknown,expected?:string):GroupDetail{
 const r=object(value)
 if(!isUuid(r.group_id)||(expected&&r.group_id!==expected)||!string(r.name)||!(r.creator_id===null||isUuid(r.creator_id))||!integer(r.joined_after_sequence)||!integer(r.last_read_sequence)||r.last_read_sequence<r.joined_after_sequence||!Array.isArray(r.members)||r.members.length<1||r.members.length>50)throw Error('Invalid group response')
 const members=r.members.map(member);if(new Set(members.map(m=>m.student_id)).size!==members.length)throw Error('Invalid group members')
 return {group_id:r.group_id,name:r.name,creator_id:r.creator_id,joined_after_sequence:r.joined_after_sequence,last_read_sequence:r.last_read_sequence,members}
}
export function parseGroupMessage(value:unknown,expected:string):Message{
 const r=object(value);if(r.group_id!==expected||!(r.sender_id===null||isUuid(r.sender_id))||!string(r.sender_name))throw Error('Invalid group message')
 const base=parseMessage({...r,conversation_id:r.group_id,sender_id:r.sender_id??'00000000-0000-0000-0000-000000000000'},expected)
 return {...base,sender_id:r.sender_id,sender_name:r.sender_name}
}
export function parseCombined(value:unknown):Conversation{
 const r=object(value)
 if(!['direct','group'].includes(String(r.kind))||!isUuid(r.conversation_id)||!string(r.name)||!date(r.last_message_at)||!(r.message_time===null||date(r.message_time))||!(r.preview===null||typeof r.preview==='string'))throw Error('Invalid conversation')
 if(r.kind==='direct'?!isUuid(r.student_id):(r.student_id!==null||!integer(r.member_count)||r.member_count<1||r.member_count>50))throw Error('Invalid conversation identity')
 return {kind:r.kind as ConversationKind,conversation_id:r.conversation_id,student_id:r.student_id as string|null,name:r.name,last_message_at:r.last_message_at,message_time:r.message_time as string|null,preview:r.preview as string|null,member_count:r.kind==='group'?Number(r.member_count):undefined}
}
export function groupError(error:{code?:string}|null):Error{return Object.assign(Error(missingGroups(error)?'Group messaging is not set up yet. The project owner must apply the reviewed group migration.':error?.code==='P0001'?'A selected friend has closed new messages.':error?.code==='42501'?'Group access or accepted friendship is unavailable.':error?.code==='22023'?'Check the group name, members, or page and retry.':error?.code==='23505'?'This attempt was already used with different details. Discard it before starting again.':'Group messaging could not be completed. Please retry.'),{code:error?.code})}
export const missingGroups=(error:{code?:string}|null)=>['PGRST202','42P01','42883'].includes(error?.code??'')
export function groupName(name:string){const next=name.trim();if(Array.from(next).length>80||next.includes('\0'))throw Error('Group names can have up to 80 characters.');return next}
function ids(members:string[],minimum:number){if(members.length<minimum||members.length>49||!members.every(isUuid)||new Set(members).size!==members.length)throw Error('Choose distinct friends for this group.')}
function page<T>(data:unknown,parse:(row:unknown)=>T):T[]{if(!Array.isArray(data)||data.length>50)throw Error('Invalid group page');return data.map(parse)}
export function groupApi(client:SupabaseClient):GroupApi{return {
 async candidates(search,signal,before,group){if(search.length>100||group&&!isUuid(group)||before&&!isUuid(before.student_id))throw Error('Invalid friend page');const {data,error}=await client.rpc('group_friend_candidates',{p_group_id:group??null,p_search:search,p_before_name:before?.name??null,p_before_id:before?.student_id??null,p_limit:50}).abortSignal(signal);if(error)throw groupError(error);return page(data,value=>{const r=object(value),m=member(r);if(!(r.major===null||typeof r.major==='string')||typeof r.can_add!=='boolean'||![null,'closed','unavailable'].includes(r.reason as null)||r.can_add!==(r.reason===null))throw Error('Invalid friend candidate');return {...m,major:r.major as string|null,can_add:r.can_add,reason:r.reason as GroupCandidate['reason']}})},
 async detail(id,signal){if(!isUuid(id))throw Error('Invalid group');const {data,error}=await client.rpc('group_detail',{p_group_id:id}).abortSignal(signal);if(error)throw groupError(error);return parseGroup(data,id)},
 async create(name,members,request){ids(members,2);if(!isUuid(request))throw Error('Invalid attempt');const {data,error}=await client.rpc('group_create',{p_name:groupName(name)||null,p_members:members,p_request_id:request});if(error)throw groupError(error);const value=parseGroup(data);if(!value.creator_id||members.some(id=>!value.members.some(member=>member.student_id===id)))throw Error('Group creation could not be confirmed. Please retry.');return value},
 async add(id,members,request){ids(members,1);if(!isUuid(id)||!isUuid(request))throw Error('Invalid attempt');const {data,error}=await client.rpc('group_add_members',{p_group_id:id,p_members:members,p_request_id:request});if(error)throw groupError(error);const value=parseGroup(data,id);if(members.some(id=>!value.members.some(member=>member.student_id===id)))throw Error('Group addition could not be confirmed. Please retry.');return value},
 async remove(id,member){if(!isUuid(id)||!isUuid(member))throw Error('Invalid group member');const {data,error}=await client.rpc('group_remove_member',{p_group_id:id,p_member_id:member});if(error)throw groupError(error);const value=parseGroup(data,id);if(value.members.some(row=>row.student_id===member))throw Error('Removal could not be confirmed. Please retry.');return value},
 async history(id,signal,before,after){if(!isUuid(id)||(before!==undefined&&(!integer(before)||before===0))||(after!==undefined&&!integer(after))||(before!==undefined&&after!==undefined))throw Error('Invalid group cursor');const {data,error}=await client.rpc('group_history',{p_group_id:id,p_before_sequence:before??null,p_after_sequence:after??null,p_limit:50}).abortSignal(signal);if(error)throw groupError(error);return page(data,row=>parseGroupMessage(row,id))},
 async send(id,body,request){if(!isUuid(id)||!isUuid(request))throw Error('Invalid attempt');validateMessage(body);const {data,error}=await client.rpc('group_send_message',{p_group_id:id,p_body:body,p_client_message_id:request});if(error)throw groupError(error);const row=parseGroupMessage(data,id);if(row.body!==body||row.client_message_id!==request)throw Error('Send could not be confirmed. Please retry.');return row},
}}
