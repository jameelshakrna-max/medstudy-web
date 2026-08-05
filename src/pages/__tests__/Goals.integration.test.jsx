// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Goals from '../Goals'
import { apiGet } from '../../lib/api'

const { harness } = vi.hoisted(() => {
  const config = { plans: [], plansPending: false, failPlans: false, detail: null }

  const rows = {
    goals: [],
    uworld_blocks: [],
    mrcp_topics: [],
    local_board_cases: [],
    study_activity: [],
  }

  const counts = {}

  function makeChain(table) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve({ data: rows[table][0] ?? null, error: null })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn(() => chain),
      delete: vi.fn(() => chain),
    }
    for (const method of ['select', 'eq', 'order', 'limit', 'single', 'insert', 'update', 'delete']) {
      const original = chain[method]
      chain[method] = vi.fn((...args) => {
        counts[`${table}:${method}`] = (counts[`${table}:${method}`] || 0) + 1
        return original(...args)
      })
    }
    Object.defineProperty(chain, 'data', { get: () => rows[table], configurable: true })
    chain.error = null
    return chain
  }

  const supabase = {
    from: vi.fn(table => makeChain(table)),
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  }

  return {
    harness: {
      config,
      rows,
      counts,
      supabase,
      setGoals: list => { rows.goals = list },
      reset() {
        config.plans = []
        config.plansPending = false
        config.failPlans = false
        config.detail = null
        for (const key of Object.keys(rows)) rows[key] = []
        for (const key of Object.keys(counts)) delete counts[key]
      },
      getCount: (table, method) => counts[`${table}:${method}`] || 0,
    },
  }
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(path => {
    if (path === '/rotation-planner/plans') {
      if (harness.config.plansPending) return new Promise(() => {})
      if (harness.config.failPlans) {
        harness.config.failPlans = false
        return Promise.reject(new Error('plans down'))
      }
      return Promise.resolve(harness.config.plans)
    }
    if (path.startsWith('/rotation-planner/plans/')) return Promise.resolve(harness.config.detail)
    if (path === '/rotations/flashcard-summary') return Promise.resolve({})
    return Promise.resolve({})
  }),
  apiPost: vi.fn(() => Promise.resolve({})),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: harness.supabase,
}))

vi.mock('../../components/LoadingScreen', () => ({
  default: () => <div data-testid="loading-screen" />,
}))

vi.mock('../../components/GoalTemplates', () => ({
  default: () => null,
}))

vi.mock('../../components/GoalCelebration', () => ({
  default: () => null,
}))

vi.mock('../../components/GoalForm', () => ({
  default: ({ initial, onSubmit, onCancel }) => (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ title: 'New Integration Goal', goal_type: 'questions', target_value: 100, category: 'long_term' })
      }}
    >
      <button type="submit">{initial ? 'Save Changes' : 'Create Goal'}</button>
    </form>
  ),
}))

const GOAL_FIXTURE = {
  id: 'g1',
  user_id: 'u1',
  title: 'Finish UWorld Cardiology',
  goal_type: 'questions',
  target_value: 500,
  category: 'long_term',
  status: 'active',
}

const PLAN_ACTIVE = {
  id: 'p-active',
  sourceTitle: 'Cardiology Step 1',
  rotationId: 'cardiology',
  startDate: '2026-01-05',
  endDate: '2026-01-30',
  status: 'active',
  updatedAt: '2026-01-04T00:00:00Z',
}

const DETAIL_READY = {
  plan: { ...PLAN_ACTIVE, taskCount: 1, completedTaskCount: 0 },
  topics: [
    {
      id: 't1',
      canonicalTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina',
      topicTitle: 'Stable Angina',
      status: 'learning',
      personalizedLearningMinutes: 60,
      totalUworldQuestions: 20,
      completedUworldQuestions: 10,
    },
  ],
  tasks: [
    {
      id: 'task-learn',
      planTopicId: 't1',
      taskDate: '2099-01-01',
      taskType: 'learning',
      status: 'pending',
      displayOrder: 1,
      estimatedMinutes: 60,
    },
  ],
  schedule: [],
  progress: { completedTasks: 0, totalTasks: 1 },
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Goals />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Goals page — Active Rotation integration', () => {
  beforeEach(() => {
    harness.reset()
    harness.setGoals([GOAL_FIXTURE])
    harness.config.plans = [PLAN_ACTIVE]
    harness.config.detail = DETAIL_READY
    vi.clearAllMocks()
  })

  it('planner loading does not block goals', async () => {
    harness.config.plansPending = true
    const { container } = renderPage()

    expect(await screen.findByRole('heading', { name: 'Study Goals' })).toBeInTheDocument()
    expect(screen.getByText('Finish UWorld Cardiology')).toBeInTheDocument()
    expect(container.querySelector('section[aria-busy="true"]')).toBeInTheDocument()
  })

  it('planner error does not hide goals', async () => {
    harness.config.failPlans = true
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Study Goals' })).toBeInTheDocument()
    expect(screen.getByText('Finish UWorld Cardiology')).toBeInTheDocument()
    expect(await screen.findByText("Couldn't load your rotation plans.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('Retry refetches planner only and leaves goals untouched', async () => {
    harness.config.failPlans = true
    renderPage()

    expect(await screen.findByText("Couldn't load your rotation plans.")).toBeInTheDocument()
    const goalsSelectBefore = harness.getCount('goals', 'select')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'Active Rotation' })).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your rotation plans.")).not.toBeInTheDocument()
    expect(harness.getCount('goals', 'select')).toBe(goalsSelectBefore)

    const plansCalls = apiGet.mock.calls.filter(([path]) => path === '/rotation-planner/plans')
    expect(plansCalls).toHaveLength(2)
  })

  it('existing goals CRUD is unchanged and the section does not write goals', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Study Goals' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Active Rotation' })).toBeInTheDocument()
    expect(screen.getByText('Finish UWorld Cardiology')).toBeInTheDocument()

    expect(harness.getCount('goals', 'insert')).toBe(0)
    expect(harness.getCount('goals', 'update')).toBe(0)
    expect(harness.getCount('goals', 'delete')).toBe(0)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Add Goal' }))
    await user.click(screen.getByRole('button', { name: 'Create Goal' }))

    await waitFor(() => {
      expect(harness.getCount('goals', 'insert')).toBe(1)
    })
    expect(harness.supabase.from).toHaveBeenCalledWith('goals')
  })
})
