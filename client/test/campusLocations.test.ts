import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { campusLocationsApi, normalizeCampusLocation } from '../src/campusLocations'
import type { CampusLocation, CampusLocationInput } from '../src/campusLocations'

export const location: CampusLocation = {
  id: '10000000-0000-0000-0000-000000000031', name: 'Printer', category: 'printer',
  latitude: 40.91, longitude: -73.12, building: null, floor: null, directions: 'Second floor',
  description: null, access_note: null, source_url: null, source_note: 'Checked on site',
  verified_at: '2026-10-23T00:00:00Z', status: 'published', revision: 1,
  created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z',
}
test('normalizes optional description, keeps directions required and publication complete', () => {
  expect(normalizeCampusLocation({ ...location, name: ' Printer ', description: '  ' })).toMatchObject({ name: 'Printer', description: null })
  expect(normalizeCampusLocation({ ...location, status: 'draft', source_note: null, verified_at: null }).status).toBe('draft')
  for (const patch of [{ directions: ' ' }, { description: 'x'.repeat(2001) }, { latitude: NaN }, { longitude: Infinity }, { latitude: 91 }, { source_url: 'https://' }, { source_url: 'javascript:alert(1)' }, { category: 'bad' }, { source_note: null }, { verified_at: null }]) {
    expect(() => normalizeCampusLocation({ ...location, ...patch } as CampusLocationInput)).toThrow()
  }
  expect(normalizeCampusLocation({ ...location, latitude: -90, longitude: 180 }).latitude).toBe(-90)
})
function fake() {
  const single = vi.fn().mockResolvedValue({ data: { ...location, revision: 2 }, error: null })
  const query = { eq: vi.fn(), select: vi.fn(), single, order: vi.fn() }
  query.eq.mockReturnValue(query); query.select.mockReturnValue(query)
  query.order.mockReturnValueOnce(query).mockResolvedValue({ data: [location], error: null })
  const insert = vi.fn(() => query), update = vi.fn(() => query), remove = vi.fn(() => query)
  const from = vi.fn(() => ({ ...query, insert, update, delete: remove }))
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
  return { api: campusLocationsApi({ from, rpc } as unknown as SupabaseClient), query, single, insert, update, remove, rpc }
}
test('uses caller-only capability, strips generated fields and sends revision conditions', async () => {
  const f = fake()
  expect(await f.api.load()).toEqual([location])
  expect(await f.api.canManage()).toBe(true)
  expect(f.rpc).toHaveBeenCalledWith('campus_locations_can_manage')
  expect(await f.api.save(location)).toMatchObject({ revision: 2 })
  expect(f.insert.mock.calls[0]?.[0]).not.toHaveProperty('id')
  expect(f.insert.mock.calls[0]?.[0]).not.toHaveProperty('revision')
  await f.api.save(location, { id: location.id, revision: 1 })
  await f.api.remove(location.id, 1)
  expect(f.query.eq).toHaveBeenCalledWith('id', location.id)
  expect(f.query.eq).toHaveBeenCalledWith('revision', 1)
})
test('reports setup, permission and zero-row conflicts without backend detail', async () => {
  const f = fake()
  f.single.mockResolvedValue({ data: null, error: null } as never)
  await expect(f.api.remove(location.id, 1)).rejects.toMatchObject({ kind: 'conflict' })
  f.single.mockResolvedValue({ data: null, error: { code: '42501', message: 'secret detail' } } as never)
  await expect(f.api.save(location)).rejects.toMatchObject({ kind: 'permission' })
  f.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } } as never)
  await expect(f.api.canManage()).rejects.toMatchObject({ kind: 'setup' })
  f.rpc.mockResolvedValue({ data: 'true', error: null } as never)
  expect(await f.api.canManage()).toBe(false)
})
