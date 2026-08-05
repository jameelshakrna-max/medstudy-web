// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import RotationSummary, { selectRotationSummaryPlan } from '../RotationSummary'

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    plans: [],
    plansPending: false,
  },
}))

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

vi.mock('../../../lib/api', () => ({
  apiGet: vi.fn(path => {
    if (path === '/rotation-planner/plans') {
      if (mockApi.plansPending) return new Promise(() => {})
      return Promise.resolve(mockApi.plans)
    }
    if (path === '/rotations/plans') return Promise.reject(new Error('legacy endpoint should never be requested'))
    return Promise.resolve({})
  }),
}))

import { apiGet } from '../../../lib/api'

const PLAN = {
  id: 'p1',
  displayName: 'Cardiology — January 2026',
  sourceTitle: 'Step-Up to Medicine',
  rotationId: 'cardiology',
  status: 'active',
  startDate: '2026-01-05',
  endDate: '2026-02-05',
  topicCount: 3,
  updatedAt: '2026-01-04T00:00:00Z',
}

function renderSummary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RotationSummary />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('RotationSummary', () => {
  beforeEach(() => {
    mockApi.plans = []
    mockApi.plansPending = false
    vi.clearAllMocks()
  })

  it('uses the V2 /rotation-planner/plans endpoint and renders displayName', async () => {
    mockApi.plans = [PLAN]
    renderSummary()

    expect(await screen.findByText('Cardiology — January 2026')).toBeInTheDocument()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/rotation-planner/plans'))
  })

  it('falls back to sourceTitle when displayName is absent', async () => {
    const { displayName, ...noDisplayName } = PLAN
    mockApi.plans = [{ ...noDisplayName }]
    renderSummary()

    expect(await screen.findByText('Step-Up to Medicine')).toBeInTheDocument()
  })

  it.each([
    ['active', 'Active'],
    ['draft', 'Draft'],
    ['paused', 'Paused'],
  ])('shows the %s badge for a %s plan', async (status, badge) => {
    mockApi.plans = [{ ...PLAN, status }]
    renderSummary()

    expect(await screen.findByText(badge)).toBeInTheDocument()
  })

  it('renders the empty state when no eligible plan exists', async () => {
    renderSummary()

    expect(await screen.findByText('No rotation plan yet')).toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('selects active over draft over paused and excludes other statuses', () => {
    const plans = [
      { ...PLAN, id: 'paused', status: 'paused' },
      { ...PLAN, id: 'draft', status: 'draft' },
      { ...PLAN, id: 'active', status: 'active' },
      { ...PLAN, id: 'completed', status: 'completed' },
      { ...PLAN, id: 'archived', status: 'archived' },
    ]
    expect(selectRotationSummaryPlan(plans).id).toBe('active')
    expect(selectRotationSummaryPlan([plans[0], plans[1]]).id).toBe('draft')
    expect(selectRotationSummaryPlan([plans[0]]).id).toBe('paused')
    expect(selectRotationSummaryPlan([plans[3], plans[4]])).toBeNull()
  })

  it('never requests the legacy V1 /rotations/plans endpoint', async () => {
    mockApi.plans = [PLAN]
    renderSummary()

    await screen.findByText('Cardiology — January 2026')
    const paths = apiGet.mock.calls.map(([path]) => path)
    expect(paths).toContain('/rotation-planner/plans')
    expect(paths.some(path => path === '/rotations/plans')).toBe(false)
  })
})
