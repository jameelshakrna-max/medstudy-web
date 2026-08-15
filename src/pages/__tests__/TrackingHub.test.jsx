// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, createMemoryRouter, RouterProvider } from 'react-router-dom'
import TrackingHub from '../TrackingHub'

const { harness } = vi.hoisted(() => {
  const rows = {}
  const errors = {}
  const counts = {}
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
            tableRows(table).unshift(full)
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
      reset() {
        for (const k of Object.keys(rows)) delete rows[k]
        for (const k of Object.keys(errors)) delete errors[k]
        for (const k of Object.keys(counts)) delete counts[k]
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

vi.mock('../../components/LoadingScreen', () => ({
  default: () => <div data-testid="loading-screen" />,
}))

vi.mock('../Goals', () => ({ default: () => null }))
vi.mock('../UWorldView', () => ({ default: () => null }))
vi.mock('../MRCPView', () => ({ default: () => null }))
vi.mock('../LocalBoardView', () => ({ default: () => null }))
vi.mock('../../components/rotation/tracking/TrackingRotationSection', () => ({ default: () => null }))
vi.mock('../../components/ResourcesModal', () => ({ default: () => null }))

vi.mock('../../components/charts/TrendLineChart', () => ({ default: () => null }))
vi.mock('../../components/charts/SubjectBarChart', () => ({ default: () => null }))
vi.mock('../../components/charts/ActivityBarChart', () => ({ default: () => null }))
vi.mock('../../components/charts/DistributionDoughnut', () => ({ default: () => null }))
vi.mock('../../components/charts/CalendarHeatmap', () => ({ default: () => null }))
vi.mock('../../components/charts/DailyStatsBar', () => ({ default: () => null }))
vi.mock('../../components/charts/ChartCard', () => ({ default: () => null }))

const RealRequest = globalThis.Request
globalThis.Request = function (input, init) {
  if (init && init.signal) {
    const { signal, ...rest } = init
    const req = new RealRequest(input, rest)
    Object.defineProperty(req, 'signal', { configurable: true, value: signal })
    return req
  }
  return new RealRequest(input, init)
}
globalThis.Request.prototype = RealRequest.prototype

function UrlProbe() {
  const loc = useLocation()
  return <div data-testid="url">{loc.pathname + loc.search}</div>
}

function renderHub(initialEntries) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntries]}>
        <TrackingHub />
        <UrlProbe />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { client, view }
}

const BLOCK = {
  id: 'b1',
  user_id: 'u1',
  block_name: 'Cardio Block 1',
  total_questions: 40,
  correct: 30,
  percent_correct: 75,
  grade: 'Good',
  mode: 'Tutor',
  subject_id: 'cardiology',
  time_minutes: 60,
  notes: null,
  date_completed: '2026-08-01',
  created_at: '2026-08-01T10:00:00Z',
}

describe('TrackingHub', () => {
  beforeEach(() => {
    harness.reset()
  })

  it('renders 7 tabs in exact order and defaults to Overview on /progress', async () => {
    renderHub('/progress')

    await screen.findByTestId('tracking-tablist')

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(t => t.textContent)).toEqual([
      'Overview',
      'UWorld Tracker',
      'MRCP Progress',
      'Local Board Tracker',
      'Sessions',
      'Rotation',
      'Goals',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('resolves the active tab from the URL', async () => {
    const cases = [
      ['/progress', 'Overview'],
      ['/progress?tab=uworld', 'UWorld Tracker'],
      ['/progress?tab=mrcp', 'MRCP Progress'],
      ['/progress?tab=board', 'Local Board Tracker'],
      ['/progress?tab=sessions', 'Sessions'],
      ['/progress?tab=rotation', 'Rotation'],
      ['/progress?tab=goals', 'Goals'],
      ['/progress?tab=bogus', 'Overview'],
      ['/uworld', 'UWorld Tracker'],
      ['/uworld?tab=overview', 'Overview'],
      ['/uworld?tab=goals', 'Goals'],
    ]

    for (const [url, expected] of cases) {
      const { view } = renderHub(url)
      await screen.findByTestId('tracking-tablist')
      await waitFor(() => {
        expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(expected)
      })
      view.unmount()
    }
  })

  it('clicking a tab updates the URL with replacement semantics and preserves unrelated params', async () => {
    renderHub('/progress?source=card')
    await screen.findByTestId('tracking-tablist')

    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'MRCP Progress' }))
    await waitFor(() => {
      expect(screen.getByTestId('url').textContent).toBe('/progress?source=card&tab=mrcp')
    })

    await user.click(screen.getByRole('tab', { name: 'Sessions' }))
    await waitFor(() => {
      expect(screen.getByTestId('url').textContent).toBe('/progress?source=card&tab=sessions')
    })
  })

  it('browser navigation and direct URL changes drive the visible tab', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter(
      [{ path: '*', element: <><TrackingHub /><UrlProbe /></> }],
      { initialEntries: ['/progress'] }
    )

    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    await screen.findByTestId('tracking-tablist')

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')

    await act(async () => { await router.navigate('/progress?tab=goals') })
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Goals' })).toHaveAttribute('aria-selected', 'true')
    })

    await act(async () => { await router.navigate(-1) })
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    })

    await act(async () => { await router.navigate(1) })
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Goals' })).toHaveAttribute('aria-selected', 'true')
    })

    await act(async () => { await router.navigate('/progress?tab=uworld') })
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'UWorld Tracker' })).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('Overview summary card navigates to the UWorld tab', async () => {
    harness.setRows('uworld_blocks', [BLOCK])

    renderHub('/progress')
    await screen.findByTestId('tracking-tablist')

    const card = await screen.findByRole('button', { name: /UWorld Summary/ })
    await userEvent.click(card)

    await waitFor(() => {
      expect(screen.getByTestId('url').textContent).toBe('/progress?tab=uworld')
    })
    expect(screen.getByRole('tab', { name: 'UWorld Tracker' })).toHaveAttribute('aria-selected', 'true')
  })

  it('report query failure renders the error state, not a partial dashboard, and Retry recovers', async () => {
    harness.setError('goals', { message: 'boom' })

    renderHub('/progress')

    expect(await screen.findByTestId('query-error-state')).toBeInTheDocument()
    expect(screen.queryByTestId('tracking-tablist')).not.toBeInTheDocument()
    expect(screen.queryByText('No tracking data yet')).not.toBeInTheDocument()

    harness.setError('goals', null)
    await userEvent.click(screen.getByTestId('query-error-retry'))

    await screen.findByText('No tracking data yet')
    expect(screen.getByTestId('tracking-tablist')).toBeInTheDocument()
  })

  it('mounts SessionsView when the sessions tab is active', async () => {
    renderHub('/progress?tab=sessions')

    expect(await screen.findByTestId('sessions-view')).toBeInTheDocument()
  })
})
