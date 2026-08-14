// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  isMobile: true,
  usePomodoro: {},
  usePomodoroSettings: {},
}))

vi.mock('../../../hooks/useMediaQuery', () => ({
  default: () => mocks.isMobile,
}))

vi.mock('../../../context/PomodoroContext', () => ({
  usePomodoro: () => mocks.usePomodoro,
  usePomodoroSettings: () => mocks.usePomodoroSettings,
}))

import FocusControlBar from '../FocusControlBar'

function basePomodoro(overrides = {}) {
  return {
    mode: 'study',
    running: true,
    sessionPhase: 'running',
    sessionOutcome: null,
    isActive: true,
    focusMode: false,
    togglePlay: vi.fn(),
    toggleFocusMode: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  mocks.isMobile = true
  mocks.usePomodoro = basePomodoro()
  mocks.usePomodoroSettings = { sessionPomodoros: 1 }
})

function renderBar(onFinish = vi.fn()) {
  return render(<FocusControlBar onFinish={onFinish} />)
}

describe('FocusControlBar action bar', () => {
  it('renders nothing when session is in setup on mobile', () => {
    mocks.usePomodoro = basePomodoro({ sessionPhase: 'setup', running: false, isActive: false })
    const { container } = renderBar()
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when not active on desktop', () => {
    mocks.isMobile = false
    mocks.usePomodoro = basePomodoro({ sessionPhase: 'running', isActive: true })
    const { container } = renderBar()
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when an outcome exists', () => {
    mocks.usePomodoro = basePomodoro({ sessionOutcome: 'completed', isActive: false })
    const { container } = renderBar()
    expect(container.firstChild).toBeNull()
  })

  it('shows Pause when running', () => {
    renderBar()
    expect(screen.getByRole('button', { name: 'Pause timer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume timer' })).not.toBeInTheDocument()
  })

  it('shows Resume when paused', () => {
    mocks.usePomodoro = basePomodoro({ running: false, sessionPhase: 'paused' })
    renderBar()
    expect(screen.getByRole('button', { name: 'Resume timer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause timer' })).not.toBeInTheDocument()
  })

  it('Pause calls togglePlay', async () => {
    const user = userEvent.setup()
    renderBar()
    await user.click(screen.getByRole('button', { name: 'Pause timer' }))
    expect(mocks.usePomodoro.togglePlay).toHaveBeenCalled()
  })

  it('Resume calls togglePlay', async () => {
    const user = userEvent.setup()
    mocks.usePomodoro = basePomodoro({ running: false, sessionPhase: 'paused' })
    renderBar()
    await user.click(screen.getByRole('button', { name: 'Resume timer' }))
    expect(mocks.usePomodoro.togglePlay).toHaveBeenCalled()
  })

  it('shows Finish for active study session with pomodoros remaining', () => {
    renderBar()
    expect(screen.getByRole('button', { name: 'Finish session' })).toBeInTheDocument()
  })

  it('hides Finish during a break', () => {
    mocks.usePomodoro = basePomodoro({ mode: 'break' })
    renderBar()
    expect(screen.queryByRole('button', { name: 'Finish session' })).not.toBeInTheDocument()
  })

  it('hides Finish when no pomodoros remain', () => {
    mocks.usePomodoroSettings = { sessionPomodoros: 0 }
    renderBar()
    expect(screen.queryByRole('button', { name: 'Finish session' })).not.toBeInTheDocument()
  })

  it('hides Finish when session completed', () => {
    mocks.usePomodoro = basePomodoro({ sessionOutcome: 'completed', isActive: false })
    const { container } = renderBar()
    expect(container.firstChild).toBeNull()
  })

  it('hides Finish when session failed', () => {
    mocks.usePomodoro = basePomodoro({ sessionOutcome: 'failed', isActive: false })
    const { container } = renderBar()
    expect(container.firstChild).toBeNull()
  })

  it('Finish calls onFinish', async () => {
    const user = userEvent.setup()
    const onFinish = vi.fn()
    renderBar(onFinish)
    await user.click(screen.getByRole('button', { name: 'Finish session' }))
    expect(onFinish).toHaveBeenCalled()
  })

  it('focus toggle reflects focusMode false and toggles on click', async () => {
    const user = userEvent.setup()
    renderBar()
    const toggle = screen.getByRole('button', { name: 'Enter focus mode' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Focus Mode')).toBeInTheDocument()
    await user.click(toggle)
    expect(mocks.usePomodoro.toggleFocusMode).toHaveBeenCalled()
  })
})

describe('FocusControlBar focus strip', () => {
  it('renders Exit Focus Mode when focusMode', async () => {
    const user = userEvent.setup()
    mocks.isMobile = false
    mocks.usePomodoro = basePomodoro({ focusMode: true })
    renderBar()
    const exit = screen.getByRole('button', { name: 'Exit focus mode' })
    await user.click(exit)
    expect(mocks.usePomodoro.toggleFocusMode).toHaveBeenCalled()
  })

  it('shows Pause in the strip when running and active', () => {
    mocks.usePomodoro = basePomodoro({ focusMode: true })
    renderBar()
    expect(screen.getByRole('button', { name: 'Pause timer' })).toBeInTheDocument()
  })

  it('shows Resume in the strip when paused and active', () => {
    mocks.usePomodoro = basePomodoro({ focusMode: true, running: false, sessionPhase: 'paused' })
    renderBar()
    expect(screen.getByRole('button', { name: 'Resume timer' })).toBeInTheDocument()
  })

  it('strip pause toggles play', async () => {
    const user = userEvent.setup()
    mocks.usePomodoro = basePomodoro({ focusMode: true })
    renderBar()
    await user.click(screen.getByRole('button', { name: 'Pause timer' }))
    expect(mocks.usePomodoro.togglePlay).toHaveBeenCalled()
  })

  it('strip renders only Exit Focus Mode when not active', () => {
    mocks.usePomodoro = basePomodoro({ focusMode: true, sessionPhase: 'setup', running: false, isActive: false })
    renderBar()
    expect(screen.getByRole('button', { name: 'Exit focus mode' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause timer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume timer' })).not.toBeInTheDocument()
  })
})
