import type { SupabaseClient } from '@supabase/supabase-js'

export const campusCategories = ['microwave', 'outdoor_lounge', 'study_spot', 'printer', 'drinking_water'] as const
export type CampusCategory = typeof campusCategories[number]
export interface CampusLocationInput {
  name: string; category: CampusCategory; latitude: number; longitude: number
  building: string | null; floor: string | null; directions: string; description: string | null
  access_note: string | null; source_url: string | null; source_note: string | null
  verified_at: string | null; status: 'draft' | 'published'
}
export interface CampusLocation extends CampusLocationInput {
  id: string; created_at: string; updated_at: string; revision: number
}
export type CampusFailure = 'setup' | 'permission' | 'conflict' | 'request'
export class CampusLocationError extends Error {
  readonly kind: CampusFailure
  constructor(kind: CampusFailure, message: string) { super(message); this.kind = kind }
}
const columns = 'id,name,category,latitude,longitude,building,floor,directions,description,access_note,source_url,source_note,verified_at,status,created_at,updated_at,revision'
function text(value: string | null, max: number, label: string, required = false) {
  const normalized = value?.trim() || null
  if ((required && !normalized) || (normalized?.length ?? 0) > max) throw new Error(`${label}: ${required ? 'enter 1 to' : 'use at most'} ${max} characters.`)
  return normalized
}
export function normalizeCampusLocation(input: CampusLocationInput): CampusLocationInput {
  if (!campusCategories.includes(input.category)) throw new Error('Choose a listed resource category.')
  if (!['draft', 'published'].includes(input.status)) throw new Error('Choose draft or published.')
  if (!Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90 || !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) throw new Error('Choose valid geographic coordinates.')
  const source = text(input.source_url, 2000, 'Source URL')
  if (source) {
    let url: URL
    try { url = new URL(source) } catch { throw new Error('Use a valid HTTPS source URL.') }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || /\s/.test(source)) throw new Error('Use a valid HTTPS source URL.')
  }
  const verified = input.verified_at || null
  if (verified && !Number.isFinite(Date.parse(verified))) throw new Error('Enter a valid verification timestamp.')
  const result: CampusLocationInput = {
    name: text(input.name, 160, 'Name', true)!, category: input.category,
    latitude: input.latitude, longitude: input.longitude,
    building: text(input.building, 160, 'Building'), floor: text(input.floor, 40, 'Floor'),
    directions: text(input.directions, 1000, 'Directions', true)!, description: text(input.description, 2000, 'Description'),
    access_note: text(input.access_note, 500, 'Access note'), source_url: source,
    source_note: text(input.source_note, 1000, 'Source note'), verified_at: verified, status: input.status,
  }
  if (result.status === 'published' && (!verified || (!source && !result.source_note))) throw new Error('Publication requires a source and verification timestamp.')
  return result
}
function failure(error: { code?: string } | null, mutation = false) {
  if (['42P01', 'PGRST205', '42883', 'PGRST202'].includes(error?.code ?? '')) return new CampusLocationError('setup', 'Campus location storage is not set up. The owner must manually apply the reviewed migration; retry afterward.')
  if (['42501', 'PGRST301', 'PGRST302'].includes(error?.code ?? '')) return new CampusLocationError('permission', 'Location editing is not authorized. Refresh your permissions before trying again.')
  if (mutation && (!error || error.code === 'PGRST116')) return new CampusLocationError('conflict', 'This location changed, was removed, or is no longer editable. Reload before retrying; keep your draft.')
  return new CampusLocationError('request', 'Unable to access campus locations. Please retry.')
}
function revisionTarget(id: string, revision: number) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isSafeInteger(revision) || revision < 1) throw new Error('Choose a saved location and its current revision.')
}
export function campusLocationsApi(client: SupabaseClient) {
  return {
    async load(): Promise<CampusLocation[]> {
      // RLS determines visibility, including drafts for authorized editors only.
      const { data, error } = await client.from('campus_locations').select(columns).order('name').order('id')
      if (error) throw failure(error)
      return data ?? []
    },
    async canManage(): Promise<boolean> {
      const { data, error } = await client.rpc('campus_locations_can_manage')
      if (error) throw failure(error)
      return data === true
    },
    async save(input: CampusLocationInput, target?: { id: string; revision: number }): Promise<CampusLocation> {
      const value = normalizeCampusLocation(input)
      if (target) revisionTarget(target.id, target.revision)
      const table = client.from('campus_locations')
      const query = target ? table.update(value).eq('id', target.id).eq('revision', target.revision) : table.insert(value)
      const { data, error } = await query.select(columns).single()
      if (error || !data) throw failure(error, true)
      return data as CampusLocation
    },
    async remove(id: string, revision: number): Promise<void> {
      revisionTarget(id, revision)
      const { data, error } = await client.from('campus_locations').delete().eq('id', id).eq('revision', revision).select('id').single()
      if (error || !data) throw failure(error, true)
    },
  }
}
export type CampusLocationsApi = ReturnType<typeof campusLocationsApi>
