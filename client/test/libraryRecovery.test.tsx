import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import CrowdMeter from '../src/CrowdMeter'
import OccupancyChart from '../src/OccupancyChart'
import { loadLibraryHistory, loadLibraryOccupancy } from '../src/libraryOccupancyApi'
import { libraryHistory, libraryReadings } from './libraryOccupancyFixtures'

const start = Date.parse('2026-11-25T17:00:00Z')
const modes = ['live', 'history'] as const
type Mode = typeof modes[number]
function response(mode: Mode) {
  return new Response(JSON.stringify(mode === 'live' ? { libraries: libraryReadings(Date.now()) } : libraryHistory(Date.now())))
}
function view(mode: Mode) {
  return render(mode === 'live' ? <CrowdMeter /> : <OccupancyChart libraryId={1} live={libraryReadings(Date.now())[0]!} now={Date.now()} />)
}
function success(mode: Mode) {
  return mode === 'live' ? screen.getByRole('button', { name: /^View North/ }) : screen.getByRole('group', { name: /Hourly historical occupancy/ })
}
afterEach(() => { cleanup(); vi.useRealTimers() })

for (const mode of modes) {
  test.each([15000, 60000])(`${mode}: one slow request survives %i ms with delayed guidance and no retries`, async delay => {
    vi.useFakeTimers(); vi.setSystemTime(start)
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(response(mode)), delay)
      init!.signal!.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    }))
    vi.stubGlobal('fetch', fetcher)
    const mounted = view(mode)
    await act(async () => { await vi.advanceTimersByTimeAsync(4999) })
    expect(screen.getByRole('status')).not.toHaveTextContent(/longer than usual/)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(screen.getByRole('status')).toHaveTextContent(/longer than usual/)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(delay - 5000) })
    expect(success(mode)).toBeVisible()
    expect(screen.queryByText(/longer than usual/)).not.toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledTimes(1)
    mounted.unmount(); expect(vi.getTimerCount()).toBe(0)
  })

  test(`${mode}: 90-second deadline aborts, reports failure, and never retries automatically`, async () => {
    vi.useFakeTimers(); vi.setSystemTime(start)
    let signal!: AbortSignal
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init!.signal!
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetcher); const mounted = view(mode)
    await act(async () => { await vi.advanceTimersByTimeAsync(89999) })
    expect(signal.aborted).toBe(false); expect(screen.getByRole('status')).toBeVisible()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(signal.aborted).toBe(true); expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveAttribute('aria-disabled', 'false')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(180000) })
    expect(fetcher).toHaveBeenCalledTimes(1)
    mounted.unmount(); expect(vi.getTimerCount()).toBe(0)
  })

  test(`${mode}: deadline includes body reading, with no abort before 90 seconds`, async () => {
    vi.useFakeTimers()
    let signal!: AbortSignal
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
      signal = init.signal!
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }) })))
    const pending = mode === 'live' ? loadLibraryOccupancy(new AbortController().signal) : loadLibraryHistory(1, new AbortController().signal)
    const rejection = expect(pending).rejects.toThrow(/taking too long/)
    await vi.advanceTimersByTimeAsync(89999); expect(signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1); await rejection
    expect(vi.getTimerCount()).toBe(0)
  })

  test(`${mode}: leaving a slow request cleans timers, ignores late success, and reopening recovers`, async () => {
    vi.useFakeTimers(); vi.setSystemTime(start)
    let finish!: (value: Response) => void
    let signal!: AbortSignal
    const fetcher = vi.fn().mockImplementationOnce((_url, init: RequestInit) => {
      signal = init.signal!
      return new Promise<Response>(resolve => { finish = resolve }) // Deliberately ignores abort.
    }).mockImplementation(async () => response(mode))
    vi.stubGlobal('fetch', fetcher)
    const first = view(mode)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByRole('status')).toHaveTextContent(/longer than usual/)
    first.unmount(); expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0)
    const second = view(mode)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(success(mode)).toBeVisible()
    await act(async () => { finish(new Response('invalid late response')); await vi.advanceTimersByTimeAsync(90000) })
    expect(success(mode)).toBeVisible(); expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledTimes(2)
    second.unmount(); expect(vi.getTimerCount()).toBe(0)
  })

  test(`${mode}: keyboard retry is error-only, ignores repeated activation while pending and restores focus`, async () => {
    let finish!: (value: Response) => void
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetcher); view(mode)
    await screen.findByRole('alert')
    const retry = screen.getByRole('button', { name: 'Try again' })
    retry.focus(); await userEvent.setup().keyboard('{Enter}')
    expect(retry).toHaveAttribute('aria-disabled', 'true'); expect(retry).toHaveFocus()
    fireEvent.click(retry); fireEvent.click(retry)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await act(async () => { finish(response(mode)) })
    expect(success(mode)).toBeVisible()
    await waitFor(() => expect(screen.getByRole('heading', { name: mode === 'live' ? 'Find your study space.' : 'Historical hourly occupancy' })).toHaveFocus())
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  test.each([502, 503, 'html'])(`${mode}: early %s failure does not linger or retry automatically`, async failure => {
    const fetcher = vi.fn(async () => failure === 'html' ? new Response('<html>Starting</html>') : new Response('', { status: failure as number }))
    vi.stubGlobal('fetch', fetcher); view(mode)
    await screen.findByRole('alert')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(/longer than usual/)).not.toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
}

test('manual live recovery and historical recovery remain independent, including structured history unavailability', async () => {
  let liveCalls = 0, historyCalls = 0
  const fetcher = vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).endsWith('/history')) {
      historyCalls++
      return historyCalls === 1 ? new Response(JSON.stringify({ ...libraryHistory(Date.now()), status: 'unavailable', buckets: [], retrievedAt: null, expiresAt: null })) : response('history')
    }
    liveCalls++
    return liveCalls === 1 ? new Response('', { status: 503 }) : response('live')
  })
  vi.stubGlobal('fetch', fetcher); render(<CrowdMeter />)
  await screen.findByRole('alert'); expect(historyCalls).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  fireEvent.click(await screen.findByRole('button', { name: /^View North/ }))
  await screen.findByRole('alert')
  const retrieved = document.querySelector('time')!.dateTime
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '50')
  expect(screen.getByText('700+')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('group', { name: /Hourly historical occupancy/ })
  expect(liveCalls).toBe(2); expect(historyCalls).toBe(2)
  expect(document.querySelector('time')!.dateTime).toBe(retrieved)
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
})
