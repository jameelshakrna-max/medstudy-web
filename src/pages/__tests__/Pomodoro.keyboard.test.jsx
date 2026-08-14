// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const mocks = vi.hoisted(() => ({
  usePomodoro: {},
  usePomodoroSettings: {},
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}))

vi.mock('../../context/PomodoroContext', () => ({
  usePomodoro: () => mocks.usePomodoro,
  usePomodoroSettings: () => mocks.usePomodoroSettings,
}))

vi.mock('../../hooks/useForestAudio', () => ({
  useForestAudio: () => ({
    playBloom: vi.fn(),
    playWilt: vi.fn(),
    playStart: vi.fn(),
    playSnap: vi.fn(),
  }),
}))

vi.mock('../../components/TreePreview', () => ({ default: () => null }))
vi.mock('../../components/TreePicker', () => ({ default: () => null }))
vi.mock('../../components/ForestScene', () => ({ default: () => null }))
vi.mock('../../components/pomodoro/GrowingTreeRenderer', () => ({ default: () => null }))
vi.mock('../../components/ui/Modal/Modal', () => ({ default: () => null }))

import Pomodoro from '../Pomodoro'

function basePomodoro(overrides = {}) {
  return {
    mode: 'study',
    setMode: vi.fn(),
    running: false,
    done: 0,
    seconds: 25 * 60,
    totalSec: 25 * 60,
    displayRemaining: '25:00',
    progress: 0,
    togglePlay: vi.fn(),
    skipTimer: vi.fn(),
    finishTimer: vi.fn(),
    resetTimer: vi.fn(),
    resetSession: vi.fn(),
    cancelPushNotification: vi.fn(),
    treeStatus: 'IDLE',
    focusMode: false,
    isFullscreen: false,
    fullscreenNote: null,
    toggleFocusMode: vi.fn(),
    sessionPhase: 'setup',
    sessionOutcome: null,
    isSetup: true,
    isActive: false,
    setModeDuration: vi.fn(),
    advanceToNextMode: vi.fn(),
    sessionTreeId: null,
    setSessionTreeId: vi.fn(),
    ...overrides,
  }
}

function baseSettings(overrides = {}) {
  return {
    focusMins: 25,
    shortMins: 5,
    longMins: 15,
    selectedTopic: null,
    setSelectedTopic: vi.fn(),
    sessionPomodoros: 0,
    sessionLog: [],
    activeStudySeconds: 0,
    selectedTree: 'oak',
    setSelectedTree: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  mocks.usePomodoro = basePomodoro()
  mocks.usePomodoroSettings = baseSettings()
})

function renderPomodoro(activePane) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(MemoryRouter, null,
        React.createElement(Pomodoro, { activePane }),
      ),
    ),
  )
}

function pressKey(key) {
  fireEvent.keyDown(window, { key })
}

describe('Pomodoro keyboard shortcuts', () => {
  it('Space toggles play when pane is active', () => {
    renderPomodoro(true)
    pressKey(' ')
    expect(mocks.usePomodoro.togglePlay).toHaveBeenCalledTimes(1)
  })

  it('F toggles focus mode when pane is active', () => {
    renderPomodoro(true)
    pressKey('f')
    expect(mocks.usePomodoro.toggleFocusMode).toHaveBeenCalledTimes(1)
  })

  it('Escape toggles focus mode when active and focusMode on', () => {
    mocks.usePomodoro = basePomodoro({ focusMode: true })
    renderPomodoro(true)
    pressKey('Escape')
    expect(mocks.usePomodoro.toggleFocusMode).toHaveBeenCalledTimes(1)
  })

  it('Escape does nothing when focusMode off', () => {
    renderPomodoro(true)
    pressKey('Escape')
    expect(mocks.usePomodoro.toggleFocusMode).not.toHaveBeenCalled()
  })

  it('is inert for Space/F/Escape when pane is hidden', () => {
    renderPomodoro(false)
    pressKey(' ')
    pressKey('f')
    pressKey('Escape')
    expect(mocks.usePomodoro.togglePlay).not.toHaveBeenCalled()
    expect(mocks.usePomodoro.toggleFocusMode).not.toHaveBeenCalled()
  })
})
