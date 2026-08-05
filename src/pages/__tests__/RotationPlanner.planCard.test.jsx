// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockApi } = vi.hoisted(() => ({
  mockApi: { v1Plans: [], v2Plans: [], failAll: false },
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn((path) => {
    if (mockApi.failAll) return Promise.reject(new Error('network down'))
    if (path === '/rotations/plans') return Promise.resolve(mockApi.v1Plans)
    if (path === '/rotation-planner/plans') return Promise.resolve(mockApi.v2Plans)
    if (path === '/rotations/flashcard-summary') return Promise.resolve({})
    if (path.startsWith('/rotations/plans/')) {
      const id = path.split('/').pop()
      const plan = mockApi.v1Plans.find((p) => p.id === id)
      return Promise.resolve({
        plan: plan ? { ...plan } : { id },
        schedule: [],
        progress: [],
        availability: [],
      })
    }
    return Promise.resolve({})
  }),
  apiPost: vi.fn(() => Promise.resolve({})),
  apiPut: vi.fn(() => Promise.resolve({})),
  apiDelete: vi.fn(() => Promise.resolve({})),
}))

vi.mock('../../components/LoadingScreen', () => ({
  default: () => <div data-testid="loading-screen" />,
}))

vi.mock('../../components/rotation/PlanCreationForm', () => ({
  default: () => <div data-testid="plan-creation-form" />,
}))

vi.mock('../../components/rotation/ScheduleView', () => ({
  default: () => <div data-testid="schedule-view" />,
}))

vi.mock('../../components/rotation/TopicProgressCard', () => ({
  default: () => <div data-testid="topic-progress-card" />,
}))

vi.mock('../../components/rotation/TodaySchedule', () => ({
  default: () => <div data-testid="today-schedule" />,
}))

vi.mock('../../components/rotation/V2PlanDetail', () => ({
  default: () => <div data-testid="v2-plan-detail" />,
}))

vi.mock('../../components/rotation/RotationHelpDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="rotation-help-dialog" /> : null),
}))

vi.mock('../../components/ui/Modal/Modal', () => {
  const MockModal = ({ children }) => <div data-testid="mock-modal">{children}</div>
  MockModal.Title = ({ children }) => <div>{children}</div>
  MockModal.Description = ({ children }) => <div>{children}</div>
  MockModal.Close = () => null
  MockModal.Trigger = () => null
  return { default: MockModal }
})

import RotationPlanner from '../RotationPlanner'
import { apiGet } from '../../lib/api'

const V1_PLANS = [
  {
    id: 'p1',
    name: 'Cardiology',
    rotation: 'Internal Medicine',
    status: 'active',
    start_date: '2026-01-05',
    end_date: '2026-01-30',
    total_entries: 20,
    completed_entries: 10,
    total_study_minutes: 600,
    total_uworld_questions: 40,
  },
  {
    id: 'p2',
    name: 'Pulmonary',
    rotation: 'Internal Medicine',
    status: 'paused',
    start_date: '2026-02-02',
    end_date: '2026-02-27',
  },
]

const V2_PLANS = [
  {
    id: 'p3',
    sourceTitle: 'Renal',
    status: 'draft',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    taskCount: 4,
    completedTaskCount: 1,
  },
]

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RotationPlanner />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function countDetailCalls() {
  return apiGet.mock.calls.filter(([path]) => path === '/rotations/plans/p1').length
}

describe('RotationPlanner plan cards (Finding E)', () => {
  beforeEach(() => {
    mockApi.v1Plans = V1_PLANS
    mockApi.v2Plans = V2_PLANS
    mockApi.failAll = false
    vi.clearAllMocks()
  })

  it('plan card primary action is a keyboard-focusable button', async () => {
    renderPage()
    const btn = await screen.findByRole('button', { name: /Cardiology plan/i })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveAttribute('type', 'button')
    btn.focus()
    expect(document.activeElement).toBe(btn)
  })

  it('pressing Enter on a focused plan card opens the plan exactly once', async () => {
    renderPage()
    const btn = await screen.findByRole('button', { name: /Cardiology plan/i })
    btn.focus()
    const user = userEvent.setup()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { name: 'Cardiology' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cardiology plan/i })).not.toBeInTheDocument()
    expect(countDetailCalls()).toBe(1)
  })

  it('pressing Space on a focused plan card opens the plan exactly once', async () => {
    renderPage()
    const btn = await screen.findByRole('button', { name: /Cardiology plan/i })
    btn.focus()
    const user = userEvent.setup()
    await user.keyboard(' ')

    expect(await screen.findByRole('heading', { name: 'Cardiology' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cardiology plan/i })).not.toBeInTheDocument()
    expect(countDetailCalls()).toBe(1)
  })

  it('clicking a plan card still opens the plan', async () => {
    renderPage()
    const btn = await screen.findByRole('button', { name: /Cardiology plan/i })
    fireEvent.click(btn)

    expect(await screen.findByRole('heading', { name: 'Cardiology' })).toBeInTheDocument()
    expect(countDetailCalls()).toBe(1)
  })

  it('accessible name identifies the plan meaningfully', async () => {
    renderPage()
    const cardiology = await screen.findByRole('button', { name: /Cardiology plan/i })
    expect(cardiology).toHaveAccessibleName(/Cardiology plan, Active, 50% complete/)

    const pulmonary = screen.getByRole('button', { name: /Pulmonary plan/i })
    expect(pulmonary).toHaveAccessibleName(/Pulmonary plan, Paused, 0% complete/)

    const renal = screen.getByRole('button', { name: /Renal plan/i })
    expect(renal).toHaveAccessibleName(/Renal plan, Live, 25% complete/)
  })

  it('plan card has no nested interactive descendants', async () => {
    renderPage()
    const btn = await screen.findByRole('button', { name: /Cardiology plan/i })
    expect(within(btn).queryByRole('button')).toBeNull()
    expect(within(btn).queryByRole('link')).toBeNull()
    expect(within(btn).queryByRole('input')).toBeNull()
    expect(within(btn).queryByRole('combobox')).toBeNull()
  })

  it('does not emit nested-interactive DOM nesting warnings', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      renderPage()
      const btn = await screen.findByRole('button', { name: /Cardiology plan/i })
      btn.focus()
      fireEvent.click(btn)
      await screen.findByRole('heading', { name: 'Cardiology' })

      const messages = errorSpy.mock.calls.map((args) => args.map(String).join(' '))
      expect(messages.some((m) => m.includes('validateDOMNesting'))).toBe(false)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('provides a visible focus-visible outline rule in the module stylesheet', async () => {
    const cssPath = path.resolve(process.cwd(), 'src/pages/RotationPlanner.module.css')
    const css = readFileSync(cssPath, 'utf8')
    expect(css).toMatch(/\.planCard:focus-visible\s*{/)
    expect(css).toContain('outline: 2px solid var(--blue)')
    expect(css).toContain('outline-offset: 2px')
  })

  it('preserves logical tab order across plan cards', async () => {
    renderPage()
    const cardiology = await screen.findByRole('button', { name: /Cardiology plan/i })
    const pulmonary = screen.getByRole('button', { name: /Pulmonary plan/i })
    const renal = screen.getByRole('button', { name: /Renal plan/i })

    const buttons = screen.getAllByRole('button')
    const indexOf = (el) => buttons.indexOf(el)
    expect(indexOf(cardiology)).toBeLessThan(indexOf(pulmonary))
    expect(indexOf(pulmonary)).toBeLessThan(indexOf(renal))

    cardiology.focus()
    expect(document.activeElement).toBe(cardiology)
    pulmonary.focus()
    expect(document.activeElement).toBe(pulmonary)
    renal.focus()
    expect(document.activeElement).toBe(renal)
  })

  it('renders the empty state unchanged when no plans exist', async () => {
    mockApi.v1Plans = []
    mockApi.v2Plans = []
    renderPage()

    expect(await screen.findByText('No rotation plans yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create Your First Plan/i })).toBeInTheDocument()
  })

  it('opens RotationHelpDialog from the header help button', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'How your rotation plan works' }))
    expect(screen.getByTestId('rotation-help-dialog')).toBeInTheDocument()
  })

  it('shows an error state with Retry when plan queries fail, then recovers on Retry', async () => {
    mockApi.v1Plans = []
    mockApi.v2Plans = []
    mockApi.failAll = true
    renderPage()

    expect(await screen.findByText(/Couldn't load your plans/i)).toBeInTheDocument()
    expect(screen.getByText(/We couldn't reach the server/i)).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: /Retry/i })
    expect(retryBtn).toBeInTheDocument()

    mockApi.failAll = false
    fireEvent.click(retryBtn)

    expect(await screen.findByText('No rotation plans yet')).toBeInTheDocument()
  })
})
