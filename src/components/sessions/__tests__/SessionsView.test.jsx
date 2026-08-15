// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SessionsView from '../SessionsView'

const { harness } = vi.hoisted(() => {
  const rows = {}
  const errors = {}
  const counts = {}
  const inserted = []
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
          if (method === 'single') return Promise.resolve(resolveFn())
          if (method === 'insert') {
            const row = args[0] || {}
            const full = { ...row, id: row.id || `inserted-${table}-${++insertCounter}` }
            inserted.push({ table, row: full })
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
      counts,
      inserted,
      reset() {
        for (const k of Object.keys(rows)) delete rows[k]
        for (const k of Object.keys(errors)) delete errors[k]
        for (const k of Object.keys(counts)) delete counts[k]
        inserted.length = 0
      },
    },
  }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: harness.supabase,
}))

vi.mock('../../LoadingScreen', () => ({
  default: ({ message }) => <div data-testid="loading-screen">{message}</div>,
}))

function renderWithClient(initialRows) {
  if (initialRows) harness.setRows('study_sessions', initialRows)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <SessionsView />
    </QueryClientProvider>
  )
  return { client, view }
}

const today = new Date().toISOString().split('T')[0]
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().split('T')[0]

const SESSIONS = [
  { id: 's1', user_id: 'u1', label: 'Cardio Morning Block', date: today, duration_min: 60, session_type: 'Study', energy_level: 'High', focus_quality: 'Deep focus', goals_met: true, notes: null },
  { id: 's2', user_id: 'u1', label: 'Anki Reviews', date: daysAgo(3), duration_min: 90, session_type: 'Anki', energy_level: 'Medium', focus_quality: 'Moderate', goals_met: false, notes: 'decks', created_at: '2026-08-01T10:00:00Z' },
]

describe('SessionsView', () => {
  beforeEach(() => {
    harness.reset()
  })

  it('shows a loading state, then the heading and stats grid on success', async () => {
    renderWithClient(SESSIONS)

    expect(screen.getByTestId('loading-screen')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'Study Sessions' })).toBeInTheDocument()
    expect(screen.getByTestId('session-stats')).toBeInTheDocument()
    expect(screen.getByTestId('session-list')).toBeInTheDocument()
    expect(screen.queryByTestId('loading-screen')).not.toBeInTheDocument()
  })

  it('renders the empty state when there are no sessions', async () => {
    renderWithClient([])

    await screen.findByRole('heading', { name: 'Study Sessions' })
    expect(screen.getByText('No sessions found for this period.')).toBeInTheDocument()
  })

  it('renders the error state on initial failure and recovers on Retry', async () => {
    harness.setError('study_sessions', { message: 'boom' })

    renderWithClient()

    expect(await screen.findByTestId('query-error-state')).toBeInTheDocument()
    expect(screen.getByText("Couldn't load your study sessions.")).toBeInTheDocument()
    expect(screen.queryByTestId('sessions-view')).not.toBeInTheDocument()

    harness.setError('study_sessions', null)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'Study Sessions' })).toBeInTheDocument()
    expect(screen.getByText('No sessions found for this period.')).toBeInTheDocument()
  })

  it('keeps cached rows and shows a non-blocking warning when a background refetch fails', async () => {
    const { client } = renderWithClient(SESSIONS)
    await screen.findByText('Cardio Morning Block')

    harness.setError('study_sessions', { message: 'boom' })
    await act(async () => {
      client.invalidateQueries({ queryKey: ['sessions'] })
    })

    expect(await screen.findByTestId('refetch-warning')).toBeInTheDocument()
    expect(screen.getByText('Cardio Morning Block')).toBeInTheDocument()
    expect(screen.getByTestId('session-stats')).toBeInTheDocument()
  })

  it('logs a session and invalidates the sessions query so a fresh refetch includes it', async () => {
    const { client } = renderWithClient([])
    await screen.findByRole('heading', { name: 'Study Sessions' })

    const spy = vi.spyOn(client, 'invalidateQueries')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '+ Log Session' }))
    await user.type(screen.getByPlaceholderText('e.g. Cardiology Morning Block'), 'Morning Cardiology Block')
    await user.click(screen.getByRole('button', { name: 'Log Session' }))

    await waitFor(() => {
      expect(harness.inserted).toHaveLength(1)
    })
    const [call] = harness.inserted
    expect(call.table).toBe('study_sessions')
    expect(call.row.user_id).toBe('u1')
    expect(call.row.label).toBe('Morning Cardiology Block')
    expect(call.row.goals_met).toBe(false)
    expect(call.row.date).toBe(today)

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['sessions'] })
    })
    expect(await screen.findByText('Morning Cardiology Block')).toBeInTheDocument()
  })

  it('deletes a session only after confirm, then invalidates sessions', async () => {
    const { client } = renderWithClient(SESSIONS)
    await screen.findByText('Cardio Morning Block')

    const spy = vi.spyOn(client, 'invalidateQueries')
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)

    const user = userEvent.setup()
    await user.click(screen.getAllByLabelText('Delete session')[0])

    expect(confirmSpy).toHaveBeenCalledWith('Delete this session?')
    expect(spy).not.toHaveBeenCalled()
    expect(harness.counts['study_sessions:delete']).toBeUndefined()

    confirmSpy.mockReturnValue(true)
    await user.click(screen.getAllByLabelText('Delete session')[0])

    expect(harness.counts['study_sessions:delete']).toBe(1)
    expect(harness.supabase.from).toHaveBeenCalledWith('study_sessions')
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['sessions'] })
    })
    vi.unstubAllGlobals()
  })

  it('filters by date range: default week excludes old sessions, All Time includes them', async () => {
    const old = { ...SESSIONS[1], id: 's3', label: 'Old Review Block', date: daysAgo(45), duration_min: 120 }
    renderWithClient([...SESSIONS, old])

    await screen.findByText('Cardio Morning Block')

    expect(screen.getByText('Anki Reviews')).toBeInTheDocument()
    expect(screen.queryByText('Old Review Block')).not.toBeInTheDocument()

    const stats = screen.getByTestId('session-stats')
    expect(stats).toHaveTextContent('2.5')
    expect(stats).toHaveTextContent('Sessions')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'All Time' }))

    expect(screen.getByText('Old Review Block')).toBeInTheDocument()
    expect(screen.getByTestId('session-stats')).toHaveTextContent('4.5')
  })

  it('shares one query between multiple mounted instances via the canonical key', async () => {
    harness.setRows('study_sessions', SESSIONS)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SessionsView />
        <SessionsView />
      </QueryClientProvider>
    )

    const views = await screen.findAllByTestId('sessions-view')
    expect(views).toHaveLength(2)
    expect(await screen.findAllByText('Cardio Morning Block')).toHaveLength(2)
    expect(harness.counts['study_sessions:select']).toBe(1)
  })

  it('keeps responsive grid layout out of inline styles and in module CSS media queries', async () => {
    renderWithClient(SESSIONS)
    await screen.findByRole('heading', { name: 'Study Sessions' })

    const stats = screen.getByTestId('session-stats')
    expect(stats.className).toBeTruthy()
    expect(stats.style.gridTemplateColumns).toBe('')

    const cssPath = path.resolve(process.cwd(), 'src/components/sessions/SessionsView.module.css')
    const css = readFileSync(cssPath, 'utf8')

    expect(css).toMatch(/@media \(max-width: 680px\)/)
    expect(css).toMatch(/@media \(max-width: 400px\)/)
    const mobileBlock = css.match(/@media \(max-width: 680px\)\s*\{([^}]*)\}/)?.[1] || ''
    const narrowBlock = css.match(/@media \(max-width: 400px\)\s*\{([^}]*)\}/)?.[1] || ''
    expect(mobileBlock).toContain('repeat(2, 1fr)')
    expect(narrowBlock).toContain('1fr')
  })
})
