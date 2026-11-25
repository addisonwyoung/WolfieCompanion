import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { compareOccupancy } from '../src/occupancyComparison'
import CrowdMeter from '../src/CrowdMeter'
import OccupancyChart from '../src/OccupancyChart'
import { libraryHistory, libraryReadings } from './libraryOccupancyFixtures'

const retrieval = Date.parse('2026-11-24T18:30:00Z') // 1:30 PM campus time
function fixture(livePercent = 32, historicalPercent = 48, time = retrieval, hour = 13) {
  const live = { ...libraryReadings(time)[0]!, capacity: 100, population: livePercent, percentage: Math.min(100, Math.round(livePercent)) }
  const history = { ...libraryHistory(time), capacity: 100 }
  const bucket = history.buckets.find(item => item.hour === hour)!
  bucket.count = historicalPercent; bucket.percentage = historicalPercent
  return { live, history }
}

test.each([
  [40, 50, 'Less busy than usual'], [60, 50, 'Busier than usual'],
  [40.001, 50, 'About as busy as usual'], [59.999, 50, 'About as busy as usual'],
  [50, 50, 'About as busy as usual'], [0, 0, 'About as busy as usual'],
  [0, 10, 'Less busy than usual'], [10, 0, 'Busier than usual'],
  [60.1, 50.1, 'Busier than usual'], [40.1, 50.1, 'Less busy than usual'],
])('compares actual %s against %s with inclusive ten-point boundaries', (livePercent, historicalPercent, label) => {
  const { live, history } = fixture(livePercent, historicalPercent)
  expect(compareOccupancy(live, history, retrieval)?.label).toBe(label)
})

test('comparison uses actual percentages above capacity rather than capped meter/bar values', () => {
  const busier = fixture(110, 95)
  expect(busier.live.percentage).toBe(100)
  expect(compareOccupancy(busier.live, busier.history, retrieval)).toMatchObject({ label: 'Busier than usual', historicalPercentage: 95 })
  expect(compareOccupancy(busier.live, busier.history, retrieval)?.livePercentage).toBeCloseTo(110)
  const less = fixture(115, 130)
  expect(compareOccupancy(less.live, less.history, retrieval)).toMatchObject({ label: 'Less busy than usual', historicalPercentage: 130 })
  expect(compareOccupancy(less.live, less.history, retrieval)?.livePercentage).toBeCloseTo(115)
})

test.each([
  ['2026-01-15T04:30:00Z', 23], // midnight boundary: previous campus date
  ['2026-01-15T05:30:00Z', 0],
  ['2026-07-15T04:30:00Z', 0], // daylight saving offset differs
  ['2026-11-01T05:30:00Z', 1],
  ['2026-11-01T06:30:00Z', 1],
])('matches campus hour for retrieval %s regardless of browser timezone', (timestamp, hour) => {
  const time = Date.parse(timestamp)
  const { live, history } = fixture(32, 48, time, hour)
  expect(compareOccupancy(live, history, time)).toMatchObject({ hour, label: 'Less busy than usual', historicalPercentage: 48 })
})

test('uses the retrieval hour even when the current campus clock advances into another hour', () => {
  const time = Date.parse('2026-11-24T18:59:00Z')
  const { live, history } = fixture(32, 48, time)
  expect(compareOccupancy(live, history, time + 120_000)).toMatchObject({ hour: 13, historicalPercentage: 48 })
})

test('only fresh readings qualify, and the exact freshness boundary hides comparison', () => {
  const { live, history } = fixture()
  expect(compareOccupancy(live, history, retrieval + 299_999)).not.toBeNull()
  expect(compareOccupancy(live, history, retrieval + 300_000)).toBeNull()
  expect(compareOccupancy(live, history, retrieval + 1_800_001)).toBeNull()
  expect(compareOccupancy({ ...live, status: 'stale' }, history, retrieval)).toBeNull()
  expect(compareOccupancy({ ...live, status: 'unavailable' }, history, retrieval)).toBeNull()
  expect(compareOccupancy({ ...live, retrievedAt: 'invalid' }, history, retrieval)).toBeNull()
  expect(compareOccupancy(live, history, retrieval - 1)).toBeNull()
})

test('missing, invalid or ambiguous matching buckets suppress comparison, while zero is valid', () => {
  const { live, history } = fixture()
  const bucket = history.buckets.find(item => item.hour === 13)!
  expect(compareOccupancy(undefined, history, retrieval)).toBeNull()
  expect(compareOccupancy(live, null, retrieval)).toBeNull()
  expect(compareOccupancy(live, { ...history, status: 'unavailable' }, retrieval)).toBeNull()
  expect(compareOccupancy(live, { ...history, id: 2 }, retrieval)).toBeNull()
  expect(compareOccupancy(live, { ...history, buckets: history.buckets.filter(item => item.hour !== 13) }, retrieval)).toBeNull()
  expect(compareOccupancy(live, { ...history, buckets: [...history.buckets, bucket] }, retrieval)).toBeNull()
  for (const percentage of [null, NaN, Infinity, -1]) {
    expect(compareOccupancy(live, { ...history, buckets: history.buckets.map(item => item.hour === 13 ? { ...item, percentage } : item) }, retrieval)).toBeNull()
  }
  bucket.count = null
  expect(compareOccupancy(live, history, retrieval)).toBeNull()
  expect(compareOccupancy({ ...live, population: null }, history, retrieval)).toBeNull()
})

test('detail-only subheading appears below chart heading, expires locally and sends no extra requests', async () => {
  vi.useFakeTimers(); vi.setSystemTime(retrieval)
  try {
    const { live, history } = fixture()
    const rows = libraryReadings(retrieval); rows[0] = live
    const fetcher = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(url === '/api/libraries' ? { libraries: rows } : history)))
    vi.stubGlobal('fetch', fetcher)
    render(<CrowdMeter />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.queryByRole('heading', { name: /busy.*usual/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^View North/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const title = screen.getByRole('heading', { name: 'Less busy than usual' })
    expect(title.parentElement?.previousElementSibling).toBe(screen.getByRole('heading', { name: 'Historical hourly occupancy' }))
    expect(title.parentElement).toHaveClass('history-comparison-less')
    expect(screen.queryByText(/Currently .*compared to/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 PM (next day): 48% occupancy')
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/libraries', '/api/libraries/1/history'])
    await act(async () => { await vi.advanceTimersByTimeAsync(300_000) })
    expect(screen.queryByRole('heading', { name: 'Less busy than usual' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Hourly historical occupancy/ })).toBeVisible()
    expect(fetcher).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('About this data'))
    expect(screen.getByText(/Comparisons use the corresponding campus hour/)).toBeVisible()
  } finally { vi.useRealTimers() }
})

test.each([
  [32, 48, 'Less busy than usual', 'less'],
  [48, 48, 'About as busy as usual', 'similar'],
  [64, 48, 'Busier than usual', 'busier'],
])('comparison %s versus %s retains compact text-only treatment', async (liveValue, historicalValue, label, tone) => {
  const { live, history } = fixture(liveValue as number, historicalValue as number)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(history))))
  render(<OccupancyChart libraryId={1} live={live} now={retrieval} />)
  const title = await screen.findByRole('heading', { name: label as string })
  expect(title.parentElement).toHaveClass(`history-comparison-${tone}`)
  expect(title.parentElement?.querySelector('p')).toBeNull()
  expect(screen.queryByText(/Currently .*compared to/)).not.toBeInTheDocument()
})
