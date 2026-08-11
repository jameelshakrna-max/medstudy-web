// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    useQuery: { data: undefined, isLoading: false },
    useAuth: { profile: { full_name: 'Validation User' }, user: { id: 'u1', email: 'a@b.c' } },
    usePomodoro: { sessionPhase: 'setup', sessionOutcome: null },
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mocks.useQuery.data, isLoading: mocks.useQuery.isLoading }),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mocks.useAuth,
}))

vi.mock('../../context/PomodoroContext', () => ({
  usePomodoro: () => mocks.usePomodoro,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}))

vi.mock('../../components/LoadingScreen', () => ({
  default: () => <div data-testid="loading" />,
}))

vi.mock('../Dashboard.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => key }),
}))

import Dashboard from '../Dashboard'
import { sumDueCounts, getDashboardShortcuts } from '../../lib/dashboardShortcuts'

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  )
}

function statsWith(cardsdue) {
  return { stats: { sessions: 0, pomodoros: 0, topicsInProgress: 0, cardsdue }, goalSummaries: [] }
}

beforeEach(() => {
  mocks.useQuery.data = undefined
  mocks.useQuery.isLoading = false
  mocks.useAuth = { profile: { full_name: 'Validation User' }, user: { id: 'u1', email: 'a@b.c' } }
  mocks.usePomodoro = { sessionPhase: 'setup', sessionOutcome: null }
})

describe('sumDueCounts', () => {
  it('sums multiple deck counts', () => {
    expect(sumDueCounts([{ deck_name: 'A', count: 2 }, { deck_name: 'B', count: 3 }])).toBe(5)
  })

  it('handles numeric-string counts', () => {
    expect(sumDueCounts([{ deck_name: 'A', count: '4' }])).toBe(4)
  })

  it('returns 0 for an empty successful array', () => {
    expect(sumDueCounts([])).toBe(0)
  })

  it('never produces NaN or Infinity from malformed values', () => {
    const total = sumDueCounts([
      { deck_name: 'A', count: NaN },
      { deck_name: 'B', count: Infinity },
      { deck_name: 'C', count: 'x' },
      { deck_name: 'D', count: null },
      { deck_name: 'E' },
      { deck_name: 'F', count: -3 },
    ])
    expect(Number.isFinite(total)).toBe(true)
    expect(total).toBe(0)
  })

  it('returns null for a non-array (malformed / unavailable) response', () => {
    expect(sumDueCounts(null)).toBeNull()
    expect(sumDueCounts(undefined)).toBeNull()
    expect(sumDueCounts({ count: 5 })).toBeNull()
    expect(sumDueCounts('nope')).toBeNull()
  })
})

describe('getDashboardShortcuts', () => {
  it('Start Focus is always available', () => {
    expect(getDashboardShortcuts({ sessionPhase: 'setup', sessionOutcome: null, cardsDue: null }).startFocus).toBe(true)
    expect(getDashboardShortcuts({ sessionPhase: 'paused', sessionOutcome: null, cardsDue: 0 }).startFocus).toBe(true)
  })

  it('Continue Study only for a paused session with no outcome', () => {
    expect(getDashboardShortcuts({ sessionPhase: 'paused', sessionOutcome: null, cardsDue: 0 }).continueStudy).toBe(true)
  })

  it('hides Continue Study for running, setup, completed and failed states', () => {
    expect(getDashboardShortcuts({ sessionPhase: 'running', sessionOutcome: null, cardsDue: 0 }).continueStudy).toBe(false)
    expect(getDashboardShortcuts({ sessionPhase: 'setup', sessionOutcome: null, cardsDue: 0 }).continueStudy).toBe(false)
    expect(getDashboardShortcuts({ sessionPhase: 'paused', sessionOutcome: 'completed', cardsDue: 0 }).continueStudy).toBe(false)
    expect(getDashboardShortcuts({ sessionPhase: 'paused', sessionOutcome: 'failed', cardsDue: 0 }).continueStudy).toBe(false)
  })

  it('Review Anki only after a successful total greater than 0', () => {
    expect(getDashboardShortcuts({ sessionPhase: 'setup', sessionOutcome: null, cardsDue: 5 }).reviewAnki).toBe(true)
    expect(getDashboardShortcuts({ sessionPhase: 'setup', sessionOutcome: null, cardsDue: 0 }).reviewAnki).toBe(false)
    expect(getDashboardShortcuts({ sessionPhase: 'setup', sessionOutcome: null, cardsDue: null }).reviewAnki).toBe(false)
    expect(getDashboardShortcuts({ sessionPhase: 'setup', sessionOutcome: null, cardsDue: NaN }).reviewAnki).toBe(false)
  })
})

describe('Dashboard contextual shortcuts', () => {
  it('shows LoadingScreen while the dashboard query is loading', () => {
    mocks.useQuery.isLoading = true
    renderDashboard()
    expect(screen.getByTestId('loading')).toBeInTheDocument()
  })

  it('renders Start Focus always, hides Continue Study and Review Anki when nothing is eligible', () => {
    mocks.useQuery.data = statsWith(0)
    renderDashboard()
    expect(screen.getByRole('link', { name: 'Start Focus' })).toHaveAttribute('href', '/focus')
    expect(screen.queryByRole('link', { name: 'Continue Study' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Review Anki' })).not.toBeInTheDocument()
  })

  it('shows Continue Study when a paused resumable session exists', () => {
    mocks.useQuery.data = statsWith(0)
    mocks.usePomodoro = { sessionPhase: 'paused', sessionOutcome: null }
    renderDashboard()
    expect(screen.getByRole('link', { name: 'Continue Study' })).toHaveAttribute('href', '/focus')
  })

  it('hides Continue Study for completed, failed and expired (non-resumable) states', () => {
    mocks.useQuery.data = statsWith(0)
    for (const sessionOutcome of ['completed', 'failed']) {
      mocks.usePomodoro = { sessionPhase: 'paused', sessionOutcome }
      const { unmount } = renderDashboard()
      expect(screen.queryByRole('link', { name: 'Continue Study' })).not.toBeInTheDocument()
      unmount()
    }
    mocks.usePomodoro = { sessionPhase: 'setup', sessionOutcome: null } // expired storage is purged to setup
    renderDashboard()
    expect(screen.queryByRole('link', { name: 'Continue Study' })).not.toBeInTheDocument()
  })

  it('shows Review Anki only when cards are actually due', () => {
    mocks.useQuery.data = statsWith(7)
    renderDashboard()
    expect(screen.getByRole('link', { name: 'Review Anki' })).toHaveAttribute('href', '/anki')
  })

  it('shows an unavailable dash, never a fabricated zero, when the due-count request failed', () => {
    mocks.useQuery.data = statsWith(null)
    renderDashboard()
    expect(screen.queryByRole('link', { name: 'Review Anki' })).not.toBeInTheDocument()
    const card = screen.getByText('Anki Cards Due').parentElement
    expect(card).toHaveTextContent('–')
  })

  it('shows zero only after a successful zero response', () => {
    mocks.useQuery.data = statsWith(0)
    renderDashboard()
    const card = screen.getByText('Anki Cards Due').parentElement
    expect(card).toHaveTextContent('0')
    expect(card).not.toHaveTextContent('–')
  })
})
