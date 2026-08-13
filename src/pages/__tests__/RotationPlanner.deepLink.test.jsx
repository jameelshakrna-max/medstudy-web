// @vitest-environment jsdom
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
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
  apiDelete: vi.fn((path) => {
    const id = path.split('/').pop()
    mockApi.v1Plans = mockApi.v1Plans.filter((p) => p.id !== id)
    mockApi.v2Plans = mockApi.v2Plans.filter((p) => p.id !== id)
    return Promise.resolve({})
  }),
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
  const MockModal = ({ children, open }) => (open ? <div data-testid="mock-modal">{children}</div> : null)
  MockModal.Title = ({ children }) => <div>{children}</div>
  MockModal.Description = ({ children }) => <div>{children}</div>
  MockModal.Close = () => null
  MockModal.Trigger = () => null
  return { default: MockModal }
})

import RotationPlanner from '../RotationPlanner'
import { apiGet, apiDelete } from '../../lib/api'

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

let navigateRef = null

function LocationProbe() {
  navigateRef = useNavigate()
  const location = useLocation()
  return <div data-testid="location-probe">{location.search}</div>
}

function renderAt(initialEntry) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <RotationPlanner />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function currentSearch() {
  return screen.getByTestId('location-probe').textContent || ''
}

function goBack() {
  act(() => navigateRef(-1))
}

function goForward() {
  act(() => navigateRef(1))
}

describe('RotationPlanner deep linking (URL plan param)', () => {
  beforeEach(() => {
    mockApi.v1Plans = V1_PLANS
    mockApi.v2Plans = V2_PLANS
    mockApi.failAll = false
    navigateRef = null
    vi.clearAllMocks()
  })

  it('18. direct valid deep link opens detail', async () => {
    renderAt('/rotations?plan=p1')
    expect(await screen.findByRole('heading', { name: 'Cardiology' })).toBeInTheDocument()
  })

  it('19. invalid plan ID renders not-found; Back to plans returns to list', async () => {
    renderAt('/rotations?plan=does-not-exist')
    expect(await screen.findByText('Plan not found')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to plans/i }))
    await screen.findByRole('heading', { name: 'Rotation Planner' })
    expect(screen.getByRole('button', { name: /Cardiology plan/i })).toBeInTheDocument()
    expect(currentSearch()).not.toContain('plan')
  })

  it('19b. closing a plan clears both the plan and view params', async () => {
    renderAt('/rotations?plan=does-not-exist&view=week')
    fireEvent.click(await screen.findByRole('button', { name: /Back to plans/i }))
    await screen.findByRole('heading', { name: 'Rotation Planner' })
    expect(currentSearch()).toBe('')
  })

  it('20. closing detail removes only the plan param', async () => {
    renderAt('/rotations?plan=p1&tab=weekly')
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
    await screen.findByRole('heading', { name: 'Rotation Planner' })
    expect(currentSearch()).toBe('?tab=weekly')
  })

  it('21. browser Back returns to the list', async () => {
    renderAt('/rotations')
    fireEvent.click(await screen.findByRole('button', { name: /Cardiology plan/i }))
    await screen.findByRole('heading', { name: 'Cardiology' })
    goBack()
    expect(screen.getByRole('heading', { name: 'Rotation Planner' })).toBeInTheDocument()
    expect(currentSearch()).toBe('')
  })

  it('22. browser Forward restores the detail', async () => {
    renderAt('/rotations')
    fireEvent.click(await screen.findByRole('button', { name: /Cardiology plan/i }))
    await screen.findByRole('heading', { name: 'Cardiology' })
    goBack()
    expect(screen.getByRole('heading', { name: 'Rotation Planner' })).toBeInTheDocument()
    goForward()
    expect(await screen.findByRole('heading', { name: 'Cardiology' })).toBeInTheDocument()
    expect(currentSearch()).toBe('?plan=p1')
  })

  it('23. deleting the selected plan clears the URL', async () => {
    renderAt('/rotations?plan=p1')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const modal = screen.getByTestId('mock-modal')
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }))
    await screen.findByRole('heading', { name: 'Rotation Planner' })
    expect(currentSearch()).not.toContain('plan')
    expect(apiDelete).toHaveBeenCalledWith('/rotations/plans/p1')
  })

  it('24. deep-linked V2 plan never flashes the wrong view', async () => {
    renderAt('/rotations?plan=p3')
    expect(screen.getByTestId('loading-screen')).toBeInTheDocument()
    expect(screen.queryByText('No rotation plans yet')).not.toBeInTheDocument()
    expect(await screen.findByTestId('v2-plan-detail')).toBeInTheDocument()
    expect(currentSearch()).toBe('?plan=p3')
  })

  it('24b. deep-linked V2 plan does not fetch the legacy V1 detail endpoint', async () => {
    // Regression: before the plan lists resolve, `selectedVersion` falls back
    // to 'v1', which used to fire a V1 fetch for a V2 plan and cache its result
    // under the shared `queryKeys.rotations.plan` key — so V2PlanDetail read
    // stale V1 data instead of fetching its own endpoint.
    renderAt('/rotations?plan=p3')
    await screen.findByTestId('v2-plan-detail')
    expect(apiGet).not.toHaveBeenCalledWith('/rotations/plans/p3')
  })

  it('24c. deep-linked V1 plan still fetches the legacy detail endpoint', async () => {
    renderAt('/rotations?plan=p1')
    await screen.findByRole('heading', { name: 'Cardiology' })
    expect(apiGet).toHaveBeenCalledWith('/rotations/plans/p1')
  })

  it('12b. plan card click still opens detail and updates the URL', async () => {
    renderAt('/rotations')
    fireEvent.click(await screen.findByRole('button', { name: /Cardiology plan/i }))
    await screen.findByRole('heading', { name: 'Cardiology' })
    expect(currentSearch()).toBe('?plan=p1')
  })

  it('selecting a different plan updates the param', async () => {
    renderAt('/rotations')
    fireEvent.click(await screen.findByRole('button', { name: /Cardiology plan/i }))
    await screen.findByRole('heading', { name: 'Cardiology' })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByRole('heading', { name: 'Rotation Planner' })
    fireEvent.click(screen.getByRole('button', { name: /Renal plan/i }))
    expect(await screen.findByTestId('v2-plan-detail')).toBeInTheDocument()
    expect(currentSearch()).toBe('?plan=p3')
  })
})
