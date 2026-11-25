import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import CrowdMeter from '../src/CrowdMeter'
import OccupancyChart from '../src/OccupancyChart'
import { loadLibraryHistory } from '../src/libraryOccupancyApi'
import { libraryHistory, libraryReadings } from './libraryOccupancyFixtures'

function requests() {
  const fetcher = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url) === '/api/libraries'
    ? { libraries: libraryReadings(Date.now()) } : libraryHistory(Date.now(), Number(String(url).split('/')[3])))))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

test('history loads only on detail entry, remains below amenities and leaves live requests independent', async () => {
  const fetcher = requests(); render(<CrowdMeter />)
  const north = await screen.findByRole('button', { name: /^View North/ })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Historical hourly occupancy')).not.toBeInTheDocument()
  fireEvent.click(north)
  const chart = await screen.findByRole('group', { name: /Hourly historical occupancy/ })
  expect(within(chart).getAllByRole('button')).toHaveLength(24)
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/libraries', '/api/libraries/1/history'])
  const history = screen.getByRole('region', { name: 'Historical hourly occupancy' })
  expect(history.previousElementSibling).toBe(screen.getByRole('region', { name: 'At this location' }))
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '50')
  fireEvent.click(screen.getByRole('button', { name: /All study spaces/ }))
  fireEvent.click(screen.getByRole('button', { name: /^View Music/ }))
  await screen.findByRole('group', { name: /Hourly historical occupancy/ })
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/libraries', '/api/libraries/1/history', '/api/libraries/4/history'])
  expect(screen.getByRole('heading', { name: 'Music Library' })).toBeVisible()
})

test('bars preserve midnight order, distinguish zero/gaps and cap height while disclosing above 100%', async () => {
  requests(); render(<OccupancyChart libraryId={1} />)
  const chart = await screen.findByRole('group', { name: /Hourly historical occupancy/ })
  const bars = within(chart).getAllByRole('button')
  expect(bars[0]).toHaveAccessibleName('4 PM: 0% occupancy')
  expect(bars[1]).toHaveAccessibleName('5 PM: No data')
  expect(bars[2]).toHaveAccessibleName('6 PM: 112% occupancy (above configured capacity)')
  expect(bars[8]).toHaveAccessibleName('12 AM (next day): 58% occupancy')
  expect(bars[23]).toHaveAccessibleName('3 PM (next day): 13% occupancy')
  expect(bars[0]!.querySelector('.history-zero')).not.toBeNull()
  expect(bars[1]!.querySelector('.history-bar')).toBeNull()
  expect(bars[1]!.querySelector('.history-missing')).not.toBeNull()
  expect(bars[2]!.querySelector('.history-bar')).toHaveStyle({ height: '100%' })
  expect(screen.getByText(/4 PM → 3 PM next day/)).not.toBeVisible()
  expect(screen.getByText('100%')).toBeVisible()
  fireEvent.click(screen.getByText('About this data'))
  expect(screen.getByText(/The dashed line marks midnight/)).toBeVisible()
  expect(screen.queryByText(/Typical Monday|Today/)).not.toBeInTheDocument()
})

test('hover, tap and roving keyboard inspection expose all hourly values accessibly', async () => {
  requests(); const user = userEvent.setup(); render(<OccupancyChart libraryId={1} />)
  const chart = await screen.findByRole('group', { name: /Hourly historical occupancy/ })
  const bars = within(chart).getAllByRole('button')
  fireEvent.pointerEnter(bars[1]!)
  expect(screen.getByRole('status')).toHaveTextContent('5 PM: No data')
  fireEvent.click(bars[2]!)
  expect(screen.getByRole('status')).toHaveTextContent('112% occupancy (above configured capacity)')
  bars[2]!.focus(); await user.keyboard('{ArrowRight}')
  expect(bars[3]).toHaveFocus()
  await user.keyboard('{End}')
  expect(bars[23]).toHaveFocus()
  expect(screen.getByRole('status')).toHaveTextContent('3 PM (next day)')
  await user.keyboard('{Home}')
  expect(bars[0]).toHaveFocus()
  expect(bars.filter(bar => bar.tabIndex === 0)).toHaveLength(1)
})

test.each(['http', 'unavailable', 'invalid'])('history %s failure leaves current occupancy and facilities usable', async mode => {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    if (String(url) === '/api/libraries') return new Response(JSON.stringify({ libraries: libraryReadings(Date.now()) }))
    if (mode === 'http') return new Response('', { status: 503 })
    const history = libraryHistory(Date.now());
    return new Response(JSON.stringify(mode === 'invalid' ? { ...history, id: 2 }
      : { ...history, status: 'unavailable', buckets: [], retrievedAt: null, expiresAt: null }))
  }))
  render(<CrowdMeter />)
  fireEvent.click(await screen.findByRole('button', { name: /^View North/ }))
  expect(await screen.findByText(/Historical data is unavailable/)).toBeVisible()
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '50')
  expect(screen.getByText('700+')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Source: SBU Libraries.' })).toBeVisible()
})

test('aborted late history cannot appear in another library after back/select', async () => {
  let finish!: (response: Response) => void
  let firstSignal: AbortSignal | null = null
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (url === '/api/libraries') return new Response(JSON.stringify({ libraries: libraryReadings(Date.now()) }))
    if (url === '/api/libraries/1/history') {
      firstSignal = init!.signal as AbortSignal
      return new Promise<Response>(resolve => { finish = resolve })
    }
    return new Response(JSON.stringify(libraryHistory(Date.now(), 4)))
  })
  vi.stubGlobal('fetch', fetcher); render(<CrowdMeter />)
  fireEvent.click(await screen.findByRole('button', { name: /^View North/ }))
  fireEvent.click(screen.getByRole('button', { name: /All study spaces/ }))
  expect(firstSignal!.aborted).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /^View Music/ }))
  await screen.findByRole('group', { name: /Hourly historical occupancy/ })
  const old = libraryHistory(Date.now()); old.buckets[0]!.percentage = 77
  await act(async () => { finish(new Response(JSON.stringify(old))) })
  expect(screen.queryByRole('button', { name: '4 PM: 77% occupancy' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Music Library' })).toBeVisible()
})

test('history adapter rejects unsupported IDs and unordered response without sorting', async () => {
  const fetcher = requests()
  await expect(loadLibraryHistory(99, new AbortController().signal)).rejects.toThrow(/Unknown library/)
  expect(fetcher).not.toHaveBeenCalled()
  const history = libraryHistory(Date.now()); history.buckets.reverse()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(history))))
  await expect(loadLibraryHistory(1, new AbortController().signal)).rejects.toThrow(/Invalid historical buckets/)
})

test('history request timeout covers a stalled response body without starting retries', async () => {
  vi.useFakeTimers()
  try {
    const fetcher = vi.fn(async (_url, init: RequestInit) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new Error('timeout')))
    }) }))
    vi.stubGlobal('fetch', fetcher)
    const pending = loadLibraryHistory(1, new AbortController().signal)
    const rejection = expect(pending).rejects.toThrow(/timeout/)
    await vi.advanceTimersByTimeAsync(8000)
    await rejection
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
  } finally { vi.useRealTimers() }
})

test.each([1, 2, 3, 4, 5])('adapter accepts official metadata for room %s and rejects another selection', async id => {
  const value = libraryHistory(Date.now(), id)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(value))))
  expect((await loadLibraryHistory(id, new AbortController().signal)).weeks).toBe(id <= 3 ? '52' : id === 4 ? '48,49,50' : '49,50,51')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...value, weeks: '1,2,3,4' }))))
  await expect(loadLibraryHistory(id, new AbortController().signal)).rejects.toThrow(/Invalid history response/)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...value, weeks: id <= 3 ? '48,49,50' : '52' }))))
  await expect(loadLibraryHistory(id, new AbortController().signal)).rejects.toThrow(/Invalid history response/)
})

test('concise copy keeps technical detail collapsed until About this data is opened', async () => {
  requests(); const user = userEvent.setup(); render(<OccupancyChart libraryId={4} />)
  await screen.findByRole('group', { name: /Hourly historical occupancy/ })
  expect(screen.getByText('Historical reference data, not a forecast.')).toBeVisible()
  expect(screen.queryByText(/previous four|four contributing/i)).not.toBeInTheDocument()
  const summary = screen.getByText('About this data')
  expect(summary.parentElement).not.toHaveAttribute('open')
  expect(screen.queryByText(/Reference-week selection:|Reference timestamps:|America\/New_York|Exact sampling/)).not.toBeInTheDocument()
  const selection = screen.getByText(/Historical occupancy follows SBU Libraries’ selected reference weeks/)
  expect(selection).not.toBeVisible()
  await user.click(summary)
  expect(selection).toBeVisible()
  expect(screen.getByText(/× means no data; a baseline mark means 0%/)).toBeVisible()
  expect(screen.getByText(/Hourly window:/)).toBeVisible()
})

test('initial selection follows the retrieval hour and student inspection survives later renders without requests', async () => {
  const time = Date.parse('2026-11-24T18:30:00Z') // 1 PM campus time, index 21 in the returned sequence
  const history = libraryHistory(time)
  const fetcher = vi.fn(async () => new Response(JSON.stringify(history)))
  vi.stubGlobal('fetch', fetcher)
  const live = libraryReadings(time)[0]!
  const { rerender } = render(<OccupancyChart libraryId={1} live={live} now={time} />)
  const chart = await screen.findByRole('group', { name: /Hourly historical occupancy/ })
  const bars = within(chart).getAllByRole('button')
  expect(bars[21]).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('1 PM (next day): 19% occupancy')
  fireEvent.click(bars[3]!)
  rerender(<OccupancyChart libraryId={1} live={{ ...live, status: 'stale' }} now={time + 300_000} />)
  expect(bars[3]).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('7 PM: 73% occupancy')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('missing retrieval-hour value retains first-bucket fallback selection', async () => {
  const time = Date.parse('2026-11-24T18:30:00Z')
  const history = libraryHistory(time)
  history.buckets[21]!.percentage = null; history.buckets[21]!.count = null
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(history))))
  render(<OccupancyChart libraryId={1} live={libraryReadings(time)[0]} now={time} />)
  const chart = await screen.findByRole('group', { name: /Hourly historical occupancy/ })
  expect(within(chart).getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('4 PM: 0% occupancy')
})
