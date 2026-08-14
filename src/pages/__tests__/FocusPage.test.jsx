// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import React from 'react'

const pomodoroMock = vi.hoisted(() => ({ lastActivePane: true }))

vi.mock('../Pomodoro', () => ({
  default: ({ activePane = true }) => {
    pomodoroMock.lastActivePane = activePane
    return <div data-testid="pomodoro-stub" />
  },
}))

vi.mock('../ForestPage', () => ({
  default: () => <div data-testid="forest-stub" />,
}))

import FocusPage from '../FocusPage'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname + location.search}</div>
}

function renderFocus(initialPath, { probe = false } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <FocusPage />
      {probe ? <LocationProbe /> : null}
    </MemoryRouter>
  )
}

function timerTrigger() {
  return screen.getByRole('tab', { name: 'Timer' })
}

function forestTrigger() {
  return screen.getByRole('tab', { name: 'Forest' })
}

function panelForTrigger(triggerName) {
  const trigger = screen.getByRole('tab', { name: triggerName })
  return document.getElementById(trigger.getAttribute('aria-controls'))
}

beforeEach(() => {
  pomodoroMock.lastActivePane = true
})

describe('FocusPage view tabs', () => {
  it('defaults to the Timer view', () => {
    renderFocus('/focus')
    expect(timerTrigger()).toHaveAttribute('aria-selected', 'true')
    expect(forestTrigger()).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('pomodoro-stub')).toBeInTheDocument()
    expect(screen.queryByTestId('forest-stub')).not.toBeInTheDocument()
  })

  it('renders the Forest view with the Timer still force-mounted and hidden', () => {
    renderFocus('/focus?view=forest')
    expect(forestTrigger()).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('forest-stub')).toBeInTheDocument()
    expect(screen.getByTestId('pomodoro-stub')).toBeInTheDocument()
    expect(panelForTrigger('Timer')).toHaveAttribute('hidden')
    expect(pomodoroMock.lastActivePane).toBe(false)
  })

  it('falls back to the Timer view for an unknown view param', () => {
    renderFocus('/focus?view=unknown')
    expect(timerTrigger()).toHaveAttribute('aria-selected', 'true')
    expect(forestTrigger()).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('pomodoro-stub')).toBeInTheDocument()
    expect(screen.queryByTestId('forest-stub')).not.toBeInTheDocument()
  })

  it('preserves unrelated query params when switching views', () => {
    renderFocus('/focus?view=timer&plan=abc', { probe: true })
    fireEvent.click(forestTrigger())
    expect(forestTrigger()).toHaveAttribute('aria-selected', 'true')
    expect(pomodoroMock.lastActivePane).toBe(false)
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/focus?view=forest&plan=abc')
  })

  it('keeps only the Timer force-mounted; Forest unmounts when inactive', () => {
    renderFocus('/focus')
    fireEvent.click(forestTrigger())
    expect(panelForTrigger('Forest')).not.toHaveAttribute('hidden')
    expect(screen.getByTestId('forest-stub')).toBeInTheDocument()

    fireEvent.click(timerTrigger())
    expect(screen.queryByTestId('forest-stub')).not.toBeInTheDocument()
    expect(screen.getByTestId('pomodoro-stub')).toBeInTheDocument()
  })

  it('wires the Timer tabpanel ARIA and hides it when Forest is active', () => {
    renderFocus('/focus')
    const trigger = timerTrigger()
    const panel = panelForTrigger('Timer')
    expect(panel).toHaveAttribute('aria-labelledby', trigger.id)
    expect(panel).not.toHaveAttribute('hidden')

    fireEvent.click(forestTrigger())
    expect(panelForTrigger('Timer')).toHaveAttribute('hidden')
    expect(panelForTrigger('Timer')).toHaveAttribute('tabindex', '-1')
  })

  it('keeps the hidden Timer panel out of the tab order', () => {
    renderFocus('/focus?view=forest')
    const panel = panelForTrigger('Timer')
    expect(panel).toHaveAttribute('hidden')
    expect(panel).toHaveAttribute('tabindex', '-1')
  })
})
