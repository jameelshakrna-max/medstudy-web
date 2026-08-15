// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import UWorldView from '../../pages/UWorldView'
import MRCPView from '../../pages/MRCPView'
import LocalBoardView from '../../pages/LocalBoardView'
import Goals from '../../pages/Goals'
import SessionsView from '../../components/sessions/SessionsView'

const { harness } = vi.hoisted(() => {
  const rows = {}
  const errors = {}
  const counts = {}
  const eqCalls = {}
  const inserts = {}
  let insertCounter = 0

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
          if (method === 'eq') {
            if (!eqCalls[table]) eqCalls[table] = []
            eqCalls[table].push(args)
          }
          if (method === 'single') return Promise.resolve(resolveFn())
          if (method === 'insert') {
            const row = args[0] || {}
            const full = { ...row, id: row.id || `inserted-${table}-${++insertCounter}` }
            tableRows(table).unshift(full)
            if (!inserts[table]) inserts[table] = []
            inserts[table].push(row)
            resolveFn = () => ({ data: [full], error: null })
            return chain
          }
          return chain
        }),
      })
    }

    Object.defineProperty(chain, 'data', { get: () => resolveFn().data, configurable: true })
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
      eqCalls,
      inserts,
      reset() {
        for (const k of Object.keys(rows)) delete rows[k]
        for (const k of Object.keys(errors)) delete errors[k]
        for (const k of Object.keys(counts)) delete counts[k]
        for (const k of Object.keys(eqCalls)) delete eqCalls[k]
        for (const k of Object.keys(inserts)) delete inserts[k]
      },
    },
  }
})

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: harness.supabase,
}))

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(() => Promise.resolve([])),
  apiPost: vi.fn(() => Promise.resolve({})),
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
        onSubmit({ title: 'Invalidation Goal', goal_type: 'questions', target_value: 100, category: 'long_term' })
      }}
    >
      <button type="submit">{initial ? 'Save Changes' : 'Create Goal'}</button>
    </form>
  ),
}))

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function spyClient(client) {
  return vi.spyOn(client, 'invalidateQueries')
}

describe('Phase 6 mutation -> invalidation contract', () => {
  beforeEach(() => {
    harness.reset()
    vi.clearAllMocks()
  })

  it('UWorldView add-block invalidates BOTH uworld and tracking prefixes', async () => {
    const client = createClient()
    const spy = spyClient(client)
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={client}>
        <UWorldView />
      </QueryClientProvider>
    )

    await screen.findByText('UWorld Tracker')
    await user.click(screen.getAllByRole('button', { name: '+ Log Block' })[0])
    await user.type(screen.getByPlaceholderText('e.g. Cardiology Block 1'), 'Cardio Block 1')
    await user.click(screen.getByRole('button', { name: /^Log Block$/ }))

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['uworld'] })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tracking'] })
    expect(harness.getCount('uworld_blocks', 'insert')).toBe(1)
  })

  it('MRCPView add-system invalidates BOTH mrcp and tracking prefixes', async () => {
    const client = createClient()
    const spy = spyClient(client)
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={client}>
        <MRCPView />
      </QueryClientProvider>
    )

    await screen.findByText('MRCP Progress')
    await user.click(screen.getByRole('button', { name: '+ Add' }))
    await user.type(screen.getByPlaceholderText('e.g. Cardiology'), 'Cardiology')
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0])

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['mrcp'] })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tracking'] })
    expect(harness.getCount('mrcp_syllabus', 'insert')).toBe(1)
  })

  it('MRCPView add-topic invalidates BOTH mrcp and tracking prefixes', async () => {
    harness.setRows('mrcp_syllabus', [
      { id: 'sys1', user_id: 'u1', name: 'Cardiology', status: 'Not Started' },
    ])
    const client = createClient()
    const spy = spyClient(client)
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={client}>
        <MRCPView />
      </QueryClientProvider>
    )

    await screen.findByText('MRCP Progress')
    await user.click(screen.getByRole('button', { name: '+ Add' }))
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'sys1')
    await user.type(screen.getByPlaceholderText('e.g. Heart Failure'), 'Heart Failure')
    await user.click(screen.getAllByRole('button', { name: 'Add' })[1])

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['mrcp'] })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tracking'] })
    expect(harness.getCount('mrcp_topics', 'insert')).toBe(1)
  })

  it('LocalBoardView add-case invalidates BOTH localBoard and tracking prefixes', async () => {
    const client = createClient()
    const spy = spyClient(client)
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={client}>
        <LocalBoardView />
      </QueryClientProvider>
    )

    await screen.findByText('Local Board Tracker')
    await user.click(screen.getAllByRole('button', { name: '+ Log Case' })[0])
    await user.type(screen.getByPlaceholderText('e.g. Acute Coronary Syndrome'), 'ACS Case')
    await user.click(screen.getByRole('button', { name: /^Log Case$/ }))

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['localBoard'] })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tracking'] })
    expect(harness.getCount('local_board_cases', 'insert')).toBe(1)
  })

  it('Goals create-goal invalidates BOTH goals and tracking prefixes', async () => {
    const client = createClient()
    const spy = spyClient(client)
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Goals />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await screen.findByRole('heading', { name: 'Study Goals' })
    await user.click(screen.getByRole('button', { name: 'Add Goal' }))
    await user.click(screen.getByRole('button', { name: 'Create Goal' }))

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['goals'] })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tracking'] })
    expect(harness.getCount('goals', 'insert')).toBe(1)
  })

  it('SessionsView add-session invalidates ONLY sessions and NEVER tracking', async () => {
    const client = createClient()
    const spy = spyClient(client)
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={client}>
        <SessionsView />
      </QueryClientProvider>
    )

    await screen.findByRole('heading', { name: 'Study Sessions' })
    await user.click(screen.getByRole('button', { name: '+ Log Session' }))
    await user.type(screen.getByPlaceholderText('e.g. Cardiology Morning Block'), 'Morning Block')
    await user.click(screen.getByRole('button', { name: /^Log Session$/ }))

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['sessions'] })
    })
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['tracking'] })
    expect(harness.getCount('study_sessions', 'insert')).toBe(1)
  })
})
