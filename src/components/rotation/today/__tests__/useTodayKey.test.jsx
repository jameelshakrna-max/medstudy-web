// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useTodayKey } from '../useTodayKey'

function Probe({ timezone = 'UTC' }) {
  const todayKey = useTodayKey(timezone)
  return <div data-testid="today">{todayKey}</div>
}

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  })
})

describe('useTodayKey', () => {
  it('returns the current local-calendar date key', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00Z'))
    render(<Probe />)
    expect(screen.getByTestId('today').textContent).toBe('2026-08-13')
  })

  it('rolls over at local midnight and reschedules for the next midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T23:59:30Z'))
    render(<Probe />)
    expect(screen.getByTestId('today').textContent).toBe('2026-08-13')

    act(() => vi.advanceTimersByTime(31_000))
    expect(screen.getByTestId('today').textContent).toBe('2026-08-14')

    // The timer is rescheduled after firing, so the next rollover works too.
    act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1000))
    expect(screen.getByTestId('today').textContent).toBe('2026-08-15')
  })

  it('refreshes when the document becomes visible again', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T23:59:30Z'))
    render(<Probe />)
    expect(screen.getByTestId('today').textContent).toBe('2026-08-13')

    // Time passes while the tab is hidden (timers throttled, never advanced).
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    vi.setSystemTime(new Date('2026-08-14T00:05:00Z'))

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.getByTestId('today').textContent).toBe('2026-08-14')
  })

  it('does not fire state updates after unmount', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T23:59:30Z'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(<Probe />)
    unmount()
    act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1000))
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
