// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Goals from '../Goals'

const { harness } = vi.hoisted(() => {
  const rows = {}
  const errors = {}
  const counts = {}

  function tableRows(table) {
    if (!rows[table]) rows[table] = []
    return rows[table]
  }

  function tableError(table) {
    return errors[table] || null
  }

  function makeChain(table) {
    let resolveFn = () => ({
      data: tableError(table) ? null : [...tableRows(table)],
      error: tableError(table),
    })

    const chain = {
      then(res, rej) {
        return Promise.resolve().then(resolveFn).then(res, rej)
      },
    }

    for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete', 'single']) {
      Object.defineProperty(chain, method, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: vi.fn((...args) => {
          counts[`${table}:${method}`] = (counts[`${table}:${method}`] || 0) + 1
          if (method === 'single') return Promise.resolve(resolveFn())
          if (method === 'insert') {
            const row = args[0] || {}
            const full = { ...row, id: row.id || `inserted-${table}` }
            tableRows(table).unshift(full)
            resolveFn = () => ({ data: [full], error: null })
            return chain
          }
          return chain
        }),
      })
    }

    return chain
  }

  const supabase = {
    from: vi.fn(table => makeChain(table)),
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  }

  return {
    harness: {
      supabase,
      setRows(table, list) { rows[table] = list },
      setError(table, err) { errors[table] = err || null },
      getCount(table, method) { return counts[`${table}:${method}`] || 0 },
      reset() {
        for (const key of Object.keys(rows)) delete rows[key]
        for (const key of Object.keys(errors)) delete errors[key]
        for (const key of Object.keys(counts)) delete counts[key]
      },
    },
  }
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(path => {
    if (path === '/rotation-planner/plans') return Promise.resolve([])
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
  default: ({ initial, onSubmit }) => (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ title: 'New Error Test Goal', goal_type: 'questions', target_value: 100, category: 'long_term' })
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

function renderPage(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Goals />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { ...utils, queryClient }
}

describe('Goals page — report query error states', () => {
  beforeEach(() => {
    harness.reset()
    vi.clearAllMocks()
  })

  it('renders the empty state when all report tables resolve with no goals', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Study Goals' })).toBeInTheDocument()
    expect(screen.getByText('No study goals yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Goal' })).toBeInTheDocument()
  })

  it('shows the full error state when two of the report tables fail, hiding the goals list', async () => {
    harness.setError('uworld_blocks', new Error('blocks down'))
    harness.setError('mrcp_topics', new Error('mrcp down'))
    renderPage()

    expect(await screen.findByTestId('query-error-state')).toBeInTheDocument()
    expect(screen.getByText("Couldn't load your study goals.")).toBeInTheDocument()
    expect(screen.getByTestId('query-error-retry')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Study Goals' })).not.toBeInTheDocument()
    expect(screen.queryByText('No study goals yet')).not.toBeInTheDocument()
  })

  it('Recovering the tables and clicking Retry refetches and renders goals', async () => {
    harness.setRows('goals', [GOAL_FIXTURE])
    harness.setError('uworld_blocks', new Error('blocks down'))
    harness.setError('mrcp_topics', new Error('mrcp down'))
    renderPage()

    expect(await screen.findByTestId('query-error-state')).toBeInTheDocument()

    harness.setError('uworld_blocks', null)
    harness.setError('mrcp_topics', null)
    const user = userEvent.setup()
    await user.click(screen.getByTestId('query-error-retry'))

    expect(await screen.findByRole('heading', { name: 'Study Goals' })).toBeInTheDocument()
    expect(screen.getByText('Finish UWorld Cardiology')).toBeInTheDocument()
    expect(screen.queryByTestId('query-error-state')).not.toBeInTheDocument()
  })

  it('shows the refetch warning while keeping goals rendered when a background refetch fails', async () => {
    harness.setRows('goals', [GOAL_FIXTURE])
    const { queryClient } = renderPage()

    expect(await screen.findByText('Finish UWorld Cardiology')).toBeInTheDocument()
    expect(screen.queryByTestId('refetch-warning')).not.toBeInTheDocument()

    harness.setError('uworld_blocks', new Error('blocks down'))
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['goals'] })
    })

    expect(screen.getByTestId('refetch-warning')).toBeInTheDocument()
    expect(screen.getByText('Finish UWorld Cardiology')).toBeInTheDocument()
    expect(screen.queryByTestId('query-error-state')).not.toBeInTheDocument()
  })

  it('creating a goal through the form invalidates the goals and tracking queries', async () => {
    const { queryClient } = renderPage()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const user = userEvent.setup()
    await screen.findByRole('button', { name: 'Add Goal' })
    await user.click(screen.getByRole('button', { name: 'Add Goal' }))
    await user.click(screen.getByRole('button', { name: 'Create Goal' }))

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled()
    })
    expect(invalidateSpy.mock.calls.some(call => JSON.stringify(call[0]?.queryKey) === JSON.stringify(['goals']))).toBe(true)
    expect(invalidateSpy.mock.calls.some(call => JSON.stringify(call[0]?.queryKey) === JSON.stringify(['tracking']))).toBe(true)
    expect(harness.getCount('goals', 'insert')).toBe(1)
  })
})
