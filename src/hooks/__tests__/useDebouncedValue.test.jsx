// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from '../useDebouncedValue'

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 300))
    expect(result.current).toBe('initial')
  })

  it('does not emit rapid intermediate values — only the settled value', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: '' },
    })

    act(() => rerender({ v: 'c' }))
    act(() => rerender({ v: 'ca' }))
    act(() => rerender({ v: 'car' }))
    act(() => rerender({ v: 'card' }))

    expect(result.current).toBe('')

    act(() => { vi.advanceTimersByTime(299) })
    expect(result.current).toBe('')

    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe('card')
  })

  it('propagates a cleared value immediately without waiting for the delay', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'card' },
    })

    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('card')

    act(() => rerender({ v: '' }))
    expect(result.current).toBe('')
  })

  it('resets the timer when the value changes before the delay elapses', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: '' },
    })

    act(() => rerender({ v: 'a' }))
    act(() => { vi.advanceTimersByTime(200) })
    act(() => rerender({ v: 'ab' }))
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe('')

    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe('ab')
  })
})
