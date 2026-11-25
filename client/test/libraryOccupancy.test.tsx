import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { StrictMode, useState } from 'react'
import CrowdMeter from '../src/CrowdMeter'
import { amenitiesSource, libraryDetails } from '../src/libraryDetails'
import { loadLibraryOccupancy, occupancyStatus } from '../src/libraryOccupancyApi'
import { useAppNavigation } from '../src/useAppNavigation'
import { libraryHistory, libraryReadings } from './libraryOccupancyFixtures'

const start = Date.parse('2026-11-24T12:00:00Z')
const result = (time = Date.now()) => ({ libraries: libraryReadings(time) })
function mockFetch(time = Date.now()) {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(result(time))))
  vi.stubGlobal('fetch', (url: RequestInfo | URL, init?: RequestInit) => String(url).endsWith('/history')
    ? Promise.resolve(new Response(JSON.stringify(libraryHistory(time, Number(String(url).split('/')[3]))))) : fetcher(url, init))
  return fetcher
}
afterEach(() => { vi.useRealTimers() })

test('five cards show source, accessible percentages and local photographs; details explain estimates and verified amenities', async () => {
  const fetcher = mockFetch()
  render(<CrowdMeter />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading')
  await screen.findByRole('button', { name: /^View North Reading Room: 50% full, Low/ })
  expect(screen.getAllByRole('button', { name: /^View / })).toHaveLength(5)
  expect(screen.getAllByRole('img')).toHaveLength(5)
  expect(document.querySelectorAll('.library-photo-credit')).toHaveLength(0)
  expect(screen.getByRole('button', { name: /^View Music Library: 0% full, Low/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /^View 3rd Floor: occupancy unavailable/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: /refresh|retry|submit/i })).not.toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/libraries')
  fireEvent.click(screen.getByRole('button', { name: /^View North Reading Room/ }))
  expect(screen.getByRole('heading', { name: 'North Reading Room' })).toHaveFocus()
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '50')
  const summary = screen.getByRole('region', { name: 'North Reading Room' })
  expect(within(summary).getByText('Current occupancy')).toBeVisible()
  expect(within(summary).getByText('Est. remaining capacity')).toBeVisible()
  expect(within(summary).getByText('Estimated capacity, not guaranteed available seats.')).toBeVisible()
  expect(within(summary).queryByText('Configured occupancy capacity')).not.toBeInTheDocument()
  expect(summary.querySelectorAll('.library-capacity > div')).toHaveLength(2)
  expect(summary.querySelector('.library-exact-time')).toBeNull()
  expect(screen.getByText('44')).toBeVisible()
  expect(screen.getByText('700+')).toBeVisible()
  expect(screen.getByText('12')).toBeVisible()
  expect(screen.getByRole('link', { name: /Facilities source/ })).toHaveAttribute('href', amenitiesSource)
  fireEvent.click(screen.getByRole('button', { name: /All study spaces/ }))
  expect(screen.getByRole('button', { name: /^View North Reading Room/ })).toHaveFocus()
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('all details keep amenities scoped and never infer the third-floor footprint', async () => {
  const fetcher = mockFetch()
  render(<CrowdMeter />)
  await screen.findByRole('button', { name: /^View Central/ })
  const entries = [
    ['Central Reading Room', ['46', '500+', '4', '6']],
    ['Health Sciences Library', ['22', '600+', '184']],
    ['Music Library', ['14', '5', '52']],
    ['3rd Floor', ['56', '199', '4', '276+']],
  ] as const
  for (const [name, values] of entries) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^View ${name}`) }))
    const facilities = screen.getByRole('region', { name: 'At this location' })
    for (const value of values) expect(within(facilities).getByText(value)).toBeVisible()
    if (name === 'Health Sciences Library') expect(within(facilities).getByText(/Library-wide facilities; sensor coverage may differ/)).toBeVisible()
    if (name === '3rd Floor') {
      expect(within(facilities).getByRole('heading', { name: 'Main Stacks' })).toBeVisible()
      expect(within(facilities).getByText(/Main Stacks facilities; sensor coverage may differ/)).toBeVisible()
      expect(screen.getByRole('heading', { name: '3rd Floor' })).toBeVisible()
      expect(screen.queryByText('Est. remaining capacity')).not.toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: /All study spaces/ }))
  }
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('display-only deadlines mark stale at five minutes and remove every current metric after thirty minutes', async () => {
  vi.useFakeTimers(); vi.setSystemTime(start)
  const fetcher = mockFetch(start)
  render(<CrowdMeter />)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  fireEvent.click(screen.getByRole('button', { name: /^View North/ }))
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000) })
  expect(screen.getByText(/Last retrieved/)).toBeVisible()
  expect(screen.queryByText(/Older reading/)).not.toBeInTheDocument()
  expect(screen.getByRole('meter')).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(1_500_001) })
  expect(screen.getByText('Current occupancy unavailable')).toBeVisible()
  expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  expect(screen.queryByText('Est. remaining capacity')).not.toBeInTheDocument()
  expect(screen.queryByText('Current occupancy', { exact: true })).not.toBeInTheDocument()
  expect(screen.queryByText('Configured occupancy capacity')).not.toBeInTheDocument()
  expect(screen.queryByText(/Last retrieval \(expired\)/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /All study spaces/ }))
  expect(screen.getAllByRole('button', { name: /occupancy unavailable/ })).toHaveLength(5)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('list uses subtle delayed-data fine print without a global warning or technical header', async () => {
  mockFetch(); render(<CrowdMeter />)
  await screen.findByRole('button', { name: /^View North/ })
  expect(screen.getByText('Occupancy readings are retrieved when Study Spot Finder is opened and may be delayed or temporarily unavailable.')).toBeVisible()
  expect(screen.queryByText(/Some readings are stale/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Retrieved on opening/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'SBU Libraries' })).toBeVisible()
})

test.each(['visibilitychange', 'focus', 'pageshow'])('resume via %s expires old metrics without fetching', async event => {
  vi.useFakeTimers(); vi.setSystemTime(start)
  const fetcher = mockFetch(start)
  render(<CrowdMeter />)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  vi.setSystemTime(start + 1_800_001) // simulate suspended/throttled timers
  fireEvent(event === 'visibilitychange' ? document : window, new Event(event))
  expect(screen.getAllByRole('button', { name: /occupancy unavailable/ })).toHaveLength(5)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('backend stale status and invalid/expired timestamps cannot revive current readings', () => {
  const row = libraryReadings(start)[0]!
  expect(occupancyStatus(row, start + 300_000)).toBe('stale')
  expect(occupancyStatus(row, start + 1_800_001)).toBe('unavailable')
  expect(occupancyStatus({ ...row, status: 'stale' }, start)).toBe('stale')
  expect(occupancyStatus(libraryReadings(start)[4]!, start)).toBe('unavailable')
})

test('existing spaces navigation requests on reopen only, retains query convention and supports keyboard activation', async () => {
  const fetcher = mockFetch()
  window.history.replaceState(null, '', '/?view=spaces')
  const user = userEvent.setup()
  function Workspace() {
    const [view, navigate] = useAppNavigation(() => {})
    return <><button onClick={() => navigate('dashboard')}>Dashboard</button><button onClick={() => navigate('spaces')}>Study spaces</button>{view === 'spaces' && <CrowdMeter />}</>
  }
  render(<Workspace />)
  const north = await screen.findByRole('button', { name: /^View North/ })
  north.focus(); await user.keyboard('{Enter}')
  expect(screen.getByRole('heading', { name: 'North Reading Room' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: /All study spaces/ }))
  expect(screen.getByRole('button', { name: /^View North/ })).toHaveFocus()
  expect(fetcher).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Dashboard' }))
  await user.click(screen.getByRole('button', { name: 'Study spaces' }))
  await screen.findByRole('button', { name: /^View North/ })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(window.location.search).toBe('?view=spaces')
})

test('unmount aborts pending request and an ignored late response cannot overwrite reopened content', async () => {
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
    .mockImplementation(async () => new Response(JSON.stringify(result())))
  vi.stubGlobal('fetch', fetcher)
  function Workspace() {
    const [open, setOpen] = useState(true)
    return <><button onClick={() => setOpen(value => !value)}>Toggle spaces</button>{open && <CrowdMeter />}</>
  }
  render(<Workspace />)
  fireEvent.click(screen.getByRole('button', { name: 'Toggle spaces' }))
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Toggle spaces' }))
  await screen.findByRole('button', { name: /^View North/ })
  const old = result(); old.libraries[0]!.name = 'Wrong stale location'
  await act(async () => { finish(new Response(JSON.stringify(old))) })
  expect(screen.queryByText('Wrong stale location')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^View North/ })).toBeVisible()
})

test('StrictMode ignored first response does not replace the active request', async () => {
  const fetcher = mockFetch()
  render(<StrictMode><CrowdMeter /></StrictMode>)
  await screen.findByRole('button', { name: /^View North/ })
  expect(fetcher.mock.calls[0]?.[1]?.signal.aborted).toBe(true)
  expect(screen.getAllByRole('button', { name: /^View / })).toHaveLength(5)
})

test.each(['network', 'http', 'malformed'])('request %s failure offers reopen guidance without report fallback', async mode => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (mode === 'network') throw new Error('offline')
    if (mode === 'http') return new Response('', { status: 503 })
    return new Response(JSON.stringify({ libraries: [{ id: 1 }] }))
  }))
  render(<CrowdMeter />)
  expect(await screen.findByRole('alert')).toHaveTextContent(/reopen it/)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

test('API adapter times out while reading the body and validates five unique records', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(new Error('aborted')))
  }) })))
  const pending = loadLibraryOccupancy(new AbortController().signal)
  const rejection = expect(pending).rejects.toThrow(/taking too long/)
  await vi.advanceTimersByTimeAsync(8000)
  await rejection
  const duplicate = result(); duplicate.libraries[4] = duplicate.libraries[0]!
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(duplicate))))
  await expect(loadLibraryOccupancy(new AbortController().signal)).rejects.toThrow(/unexpected response/)
})


test('all five production photos and detail source links match their location metadata', async () => {
  mockFetch(); render(<CrowdMeter />)
  await screen.findByRole('button', { name: /^View North/ })
  const filenames = ['north_reading_room', 'central_reading_room', 'health_sciences', 'music_library', 'third_floor']
  for (const [index, filename] of filenames.entries()) {
    const photo = libraryDetails[index + 1]!.photo!
    const card = screen.getAllByRole('button', { name: /^View / })[index]!
    expect(within(card).getByRole('img')).toHaveAttribute('src', `/images/library/${filename}.webp`)
    expect(within(card).queryByRole('link')).not.toBeInTheDocument()
    fireEvent.click(card)
    expect(screen.getByRole('img')).toHaveAttribute('alt', photo.alt)
    expect(screen.getByRole('link', { name: photo.credit })).toHaveAttribute('href', photo.sourceUrl)
    fireEvent.click(screen.getByRole('button', { name: /All study spaces/ }))
  }
  expect(libraryDetails[3]!.photo!.credit).toBe('LinkedIn')
  expect(libraryDetails[3]!.photo!.sourceUrl).toContain('linkedin.com/posts/william-wertheim-')
  expect(libraryDetails[5]!.photo!.alt).toMatch(/staircase/)
  expect(libraryDetails[5]!.photo!.alt).not.toMatch(/Main Stacks/)
})

test('failed image returns the named placeholder and removes the detail photo credit', async () => {
  const fetcher = mockFetch(); render(<CrowdMeter />)
  await screen.findByRole('button', { name: /^View North/ })
  fireEvent.error(screen.getAllByRole('img')[0]!)
  expect(screen.getByText(/North Reading Room .*Photo placeholder/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /^View North/ }))
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText(/North Reading Room .*Photo placeholder/)).toBeVisible()
  expect(document.querySelector('.library-photo-credit')).toBeNull()
  expect(screen.getByRole('meter')).toBeVisible()
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('absent photo metadata keeps the named placeholder in cards and details', async () => {
  const photo = libraryDetails[1]!.photo
  libraryDetails[1]!.photo = undefined
  try {
    mockFetch(); render(<CrowdMeter />)
    await screen.findByRole('button', { name: /^View North/ })
    expect(screen.getByText(/North Reading Room .*Photo placeholder/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /^View North/ }))
    expect(screen.getByText(/North Reading Room .*Photo placeholder/)).toBeVisible()
    expect(document.querySelector('.library-photo-credit')).toBeNull()
  } finally { libraryDetails[1]!.photo = photo }
})
