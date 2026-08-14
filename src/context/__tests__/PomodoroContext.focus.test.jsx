// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { PomodoroProvider, usePomodoro } from '../PomodoroContext'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  },
}))

vi.mock('../../components/rotation/today/todayUtils', () => ({
  secondsToPlannerMinutes: vi.fn((s) => Math.ceil(s / 60)),
}))

const FULLSCREEN_UNAVAILABLE_MESSAGE = 'Fullscreen isn\u2019t available in this browser \u2014 focus mode is still active.'

let fullscreenActive = false

Object.defineProperty(document, 'fullscreenElement', {
  configurable: true,
  get: () => (fullscreenActive ? document.documentElement : null),
})

function createWrapper() {
  return ({ children }) => React.createElement(PomodoroProvider, null, children)
}

function renderPomodoro() {
  return renderHook(() => usePomodoro(), { wrapper: createWrapper() })
}

function setFs(active) {
  fullscreenActive = active
  document.dispatchEvent(new Event('fullscreenchange'))
}

describe('PomodoroContext focus mode & fullscreen', () => {
  beforeEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    fullscreenActive = false
    delete document.documentElement.requestFullscreen
    document.exitFullscreen = vi.fn(() => Promise.resolve())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('enters focus mode when requestFullscreen is unavailable', () => {
    const { result } = renderPomodoro()
    act(() => { result.current.toggleFocusMode() })
    expect(result.current.focusMode).toBe(true)
    expect(result.current.fullscreenNote).toBe(FULLSCREEN_UNAVAILABLE_MESSAGE)
    expect(result.current.isFullscreen).toBe(false)
  })

  it('enters focus mode and tracks fullscreen when requestFullscreen resolves', async () => {
    document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve())
    const { result } = renderPomodoro()
    await act(async () => { result.current.toggleFocusMode() })
    await act(async () => {})
    expect(result.current.focusMode).toBe(true)
    expect(result.current.fullscreenNote).toBeNull()
    expect(result.current.isFullscreen).toBe(false)

    act(() => { setFs(true) })
    expect(result.current.isFullscreen).toBe(true)
    expect(result.current.focusMode).toBe(true)
  })

  it('sets the unavailable note when requestFullscreen rejects', async () => {
    document.documentElement.requestFullscreen = vi.fn(() => Promise.reject(new Error('denied')))
    const { result } = renderPomodoro()
    await act(async () => { result.current.toggleFocusMode() })
    await act(async () => {})
    expect(result.current.focusMode).toBe(true)
    expect(result.current.fullscreenNote).toBe(FULLSCREEN_UNAVAILABLE_MESSAGE)
    expect(result.current.isFullscreen).toBe(false)
  })

  it('sets the unavailable note when requestFullscreen throws synchronously', () => {
    document.documentElement.requestFullscreen = vi.fn(() => { throw new Error('boom') })
    const { result } = renderPomodoro()
    act(() => { result.current.toggleFocusMode() })
    expect(result.current.focusMode).toBe(true)
    expect(result.current.fullscreenNote).toBe(FULLSCREEN_UNAVAILABLE_MESSAGE)
    expect(result.current.isFullscreen).toBe(false)
  })

  it('exiting via toggleFocusMode exits fullscreen when fullscreenElement exists', async () => {
    document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve())
    const { result } = renderPomodoro()
    await act(async () => { result.current.toggleFocusMode() })
    await act(async () => {})
    act(() => { setFs(true) })
    expect(result.current.isFullscreen).toBe(true)

    act(() => { result.current.toggleFocusMode() })
    expect(result.current.focusMode).toBe(false)
    expect(document.exitFullscreen).toHaveBeenCalled()
    expect(result.current.fullscreenNote).toBeNull()
  })

  it('native fullscreenchange exit turns off focus mode and clears the note', async () => {
    document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve())
    const { result } = renderPomodoro()
    await act(async () => { result.current.toggleFocusMode() })
    await act(async () => {})
    expect(result.current.focusMode).toBe(true)

    act(() => { setFs(true) })
    expect(result.current.isFullscreen).toBe(true)
    expect(result.current.focusMode).toBe(true)

    act(() => { setFs(false) })
    expect(result.current.focusMode).toBe(false)
    expect(result.current.isFullscreen).toBe(false)
    expect(result.current.fullscreenNote).toBeNull()
  })

  it('exitFocusMode exits fullscreen when fullscreen is active', async () => {
    document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve())
    const { result } = renderPomodoro()
    await act(async () => { result.current.toggleFocusMode() })
    await act(async () => {})
    act(() => { setFs(true) })

    act(() => { result.current.exitFocusMode() })
    expect(result.current.focusMode).toBe(false)
    expect(document.exitFullscreen).toHaveBeenCalled()
  })

  it('exitFocusMode never touches the timer', () => {
    const { result } = renderPomodoro()
    act(() => { result.current.setRunning(true) })
    const modeBefore = result.current.mode
    const displayBefore = result.current.displayRemaining

    act(() => { result.current.exitFocusMode() })
    expect(result.current.running).toBe(true)
    expect(result.current.mode).toBe(modeBefore)
    expect(result.current.displayRemaining).toBe(displayBefore)
  })

  it('toggling twice with unavailable fullscreen leaves focusMode off and no stale note', () => {
    const { result } = renderPomodoro()
    act(() => { result.current.toggleFocusMode() })
    expect(result.current.focusMode).toBe(true)
    expect(result.current.fullscreenNote).toBe(FULLSCREEN_UNAVAILABLE_MESSAGE)

    act(() => { result.current.toggleFocusMode() })
    expect(result.current.focusMode).toBe(false)
    expect(result.current.fullscreenNote).toBeNull()
    expect(result.current.isFullscreen).toBe(false)
    expect(document.exitFullscreen).not.toHaveBeenCalled()
  })

  it('does not persist focusMode/fullscreenNote to pomodoro_state', async () => {
    const { result } = renderPomodoro()
    act(() => { result.current.toggleFocusMode() })
    expect(result.current.focusMode).toBe(true)

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)) })
    const saved = JSON.parse(localStorage.getItem('pomodoro_state'))
    expect(saved.focusMode).toBeUndefined()
    expect(saved.fullscreenNote).toBeUndefined()
  })
})
