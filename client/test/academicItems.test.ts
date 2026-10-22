import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { academicItemsApi, compareItems, itemGroup, normalizeItem } from '../src/academicItems'
import type { AcademicItem } from '../src/academicItems'
const item: AcademicItem = { id: 'item', user_course_id: '10000000-0000-0000-0000-000000000021', title: 'Homework', type: 'assignment', due_date: '2026-10-21', due_time: null, notes: null, location: null, completed_at: null }
test('date-only remains Today through the whole campus date, then overdue; timed and completed rules', () => {
  expect(itemGroup(item, new Date('2026-10-22T03:59:59Z'))).toBe('Today')
  expect(itemGroup(item, new Date('2026-10-22T04:00:00Z'))).toBe('Overdue')
  expect(itemGroup(item, new Date('2026-10-21T03:59:59Z'))).toBe('Upcoming')
  expect(itemGroup({ ...item, due_time: '14:00' }, new Date('2026-10-21T18:00:01Z'))).toBe('Overdue')
  expect(itemGroup({ ...item, due_time: '14:00' }, new Date('2026-10-21T18:00:00Z'))).toBe('Today')
  expect(itemGroup({ ...item, completed_at: '2026-10-21T18:00:00Z' }, new Date('2026-10-23T12:00Z'))).toBe('Completed')
  expect(itemGroup({ ...item, due_date: '2026-01-21' }, new Date('2026-01-22T04:59:00Z'))).toBe('Today')
  expect(compareItems({ ...item, due_time: '14:00' }, item)).toBeLessThan(0)
})
test('normalize optional time without midnight and reject invalid fields', () => {
  expect(normalizeItem({ ...item, title: ' Work ', due_time: '', notes: '  ' })).toMatchObject({ title: 'Work', due_time: null, notes: null })
  for (const patch of [{ title: ' ' }, { due_date: '2026-02-30' }, { due_time: '24:00' }, { user_course_id: 'cse-310' }, { notes: 'x'.repeat(5001) }, { location: 'x'.repeat(201) }, { type: 'bad' }]) {
    expect(() => normalizeItem({ ...item, ...patch } as AcademicItem)).toThrow()
  }
})
function fake() {
  const single = vi.fn().mockResolvedValue({ data: item, error: null })
  const eq = vi.fn(() => ({ select: () => ({ single }) }))
  const insert = vi.fn(() => ({ select: () => ({ single }) }))
  const update = vi.fn(() => ({ eq }))
  const remove = vi.fn(() => ({ eq }))
  const order = vi.fn().mockResolvedValue({ data: [item], error: null })
  const from = vi.fn(() => ({ select: () => ({ order }), insert, update, delete: remove }))
  return { api: academicItemsApi({ from } as unknown as SupabaseClient), single, eq, insert, update, remove, order, from }
}
test('adapter uses actual UUID, CRUD results, partial completion updates and confirmed deletion response', async () => {
  const f = fake()
  expect(await f.api.load()).toEqual([item])
  await f.api.save(item)
  expect(f.insert).toHaveBeenCalledWith(expect.objectContaining({ user_course_id: item.user_course_id, due_time: null }))
  await f.api.save({ ...item, title: 'Edited' }, item.id)
  expect(f.eq).toHaveBeenCalledWith('id', item.id)
  await f.api.complete(item.id, false)
  expect(f.update).toHaveBeenLastCalledWith({ completed_at: null })
  await f.api.remove(item.id)
  expect(f.remove).toHaveBeenCalledTimes(1)
  f.single.mockResolvedValue({ data: null, error: null } as never)
  await expect(f.api.remove(item.id)).rejects.toThrow('Unable to delete')
})
test('adapter explains missing storage and preserves errors without leaking backend detail', async () => {
  const f = fake()
  f.order.mockResolvedValue({ data: null, error: { code: '42P01' } } as never)
  await expect(f.api.load()).rejects.toThrow('manually apply')
  f.single.mockResolvedValue({ data: null, error: { code: 'offline' } } as never)
  await expect(f.api.save(item)).rejects.toThrow('retry')
  await expect(f.api.save({ ...item, user_course_id: 'cse-310' })).rejects.toThrow('saved course')
})
