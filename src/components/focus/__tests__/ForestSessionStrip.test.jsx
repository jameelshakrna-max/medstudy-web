// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  usePomodoro: {},
}))

vi.mock('../../../context/PomodoroContext', () => ({
  usePomodoro: () => mocks.usePomodoro,
}))

import ForestSessionStrip from '../ForestSessionStrip'

function basePomodoro(overrides = {}) {
  return {
    mode: 'study',
    running: true,
    sessionPhase: 'running',
    displayRemaining: '24:59',
    togglePlay: vi.fn(),
    focusMode: false,
    exitFocusMode: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  mocks.usePomodoro = basePomodoro()
})

function renderStrip() {
  return render(
    <MemoryRouter initialEntries={['/somewhere']}>
      <ForestSessionStrip />
    </MemoryRouter>,
  )
}

describe('ForestSessionStrip', () => {
  it('shows remaining time and Pause when running', () => {
    renderStrip()
    expect(screen.getByText('24:59')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause timer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume timer' })).not.toBeInTheDocument()
  })

  it('shows Resume when paused', () => {
    mocks.usePomodoro = basePomodoro({ running: false, sessionPhase: 'paused' })
    renderStrip()
    expect(screen.getByRole('button', { name: 'Resume timer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause timer' })).not.toBeInTheDocument()
  })

  it('renders null during setup phase', () => {
    mocks.usePomodoro = basePomodoro({ running: false, sessionPhase: 'setup' })
    const { container } = renderStrip()
    expect(container.firstChild).toBeNull()
  })

  it('shows Focus label for study mode', () => {
    renderStrip()
    expect(screen.getByText('Focus')).toBeInTheDocument()
  })

  it('shows Short Break label for break mode', () => {
    mocks.usePomodoro = basePomodoro({ mode: 'break' })
    renderStrip()
    expect(screen.getByText('Short Break')).toBeInTheDocument()
  })

  it('shows Long Break label for long mode', () => {
    mocks.usePomodoro = basePomodoro({ mode: 'long' })
    renderStrip()
    expect(screen.getByText('Long Break')).toBeInTheDocument()
  })

  it('shows Exit Focus Mode and calls exitFocusMode on click', async () => {
    const user = userEvent.setup()
    mocks.usePomodoro = basePomodoro({ focusMode: true })
    renderStrip()
    const btn = screen.getByRole('button', { name: 'Exit Focus Mode' })
    await user.click(btn)
    expect(mocks.usePomodoro.exitFocusMode).toHaveBeenCalled()
  })

  it('hides Exit Focus Mode when not in focus mode', () => {
    renderStrip()
    expect(screen.queryByRole('button', { name: 'Exit Focus Mode' })).not.toBeInTheDocument()
  })

  it('Pause button calls togglePlay', async () => {
    const user = userEvent.setup()
    renderStrip()
    await user.click(screen.getByRole('button', { name: 'Pause timer' }))
    expect(mocks.usePomodoro.togglePlay).toHaveBeenCalled()
  })

  it('Return to Timer navigates to /focus?view=timer', async () => {
    const user = userEvent.setup()
    let location = null
    function LocationProbe() {
      location = useLocation()
      return null
    }
    render(
      <MemoryRouter initialEntries={['/somewhere']}>
        <ForestSessionStrip />
        <LocationProbe />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Return to Timer' }))
    expect(location.pathname).toBe('/focus')
    expect(location.search).toBe('?view=timer')
  })
})
