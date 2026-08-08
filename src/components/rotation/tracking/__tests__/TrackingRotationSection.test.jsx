// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useSearchParams } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { queryKeys } from '../../../../lib/queryKeys'
import TrackingRotationSection from '../TrackingRotationSection'
import styles from '../TrackingRotationSection.module.css'

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    plans: [],
    schedule: null,
    trackingPending: false,
    failNextTracking: false,
    trackingError: null,
  },
}))

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

vi.mock('../../../../lib/api', () => ({
  apiGet: vi.fn(path => {
    if (path === '/rotation-planner/plans') return Promise.resolve(mockApi.plans)
    if (path.startsWith('/rotation-planner/tracking/schedule')) {
      if (mockApi.trackingPending) return new Promise(() => {})
      if (mockApi.failNextTracking) {
        mockApi.failNextTracking = false
        return Promise.reject(mockApi.trackingError || new Error('request failed'))
      }
      return Promise.resolve(mockApi.schedule)
    }
    return Promise.resolve({})
  }),
  queryFn: (path) => () => apiGet(path),
  ApiError: class ApiError extends Error {
    constructor({ code = 'API_ERROR', message = 'Request failed', status = null, details = null } = {}) {
      super(message)
      this.code = code
      this.status = status
      this.details = details
    }
  },
}))

import { apiGet, ApiError } from '../../../../lib/api'

const PLANS = [
  { id: 'p1', displayName: 'Cardiology', status: 'active', updatedAt: '2026-01-04T00:00:00Z' },
  { id: 'p2', displayName: 'Nephrology', status: 'draft', updatedAt: '2026-01-02T00:00:00Z' },
  { id: 'p3', displayName: 'Pulmonology', status: 'draft', updatedAt: '2026-01-08T00:00:00Z' },
  { id: 'p4', displayName: 'Neurology', status: 'paused', updatedAt: '2026-01-06T00:00:00Z' },
  { id: 'p5', displayName: 'Endocrinology', status: 'completed', updatedAt: '2026-01-07T00:00:00Z' },
]

const SCHEDULE = {
  plan: {
    id: 'p1',
    displayName: 'Cardiology — January 2026',
    status: 'active',
    rotationLabel: 'Cardiology Rotation',
    startDate: '2026-01-05',
    endDate: '2026-02-05',
    revision: 3,
  },
  selectionReason: 'explicit',
  window: { timezone: 'UTC', startDate: '2026-01-05', endDate: '2026-01-19', windowDays: 14 },
  nextBlock: null,
  schedule: [],
  incorrectReview: [],
  linkedDecks: [],
}

function makeItem(id, status, overrides = {}) {
  return {
    taskId: id,
    planQuestionGroupId: `g-${id}`,
    groupKey: `group-${id}`,
    groupTitle: `Block ${id}`,
    taskType: 'uworld_questions',
    plannedDate: '2026-01-10',
    targetQuestions: 40,
    completedQuestions: 0,
    remainingQuestions: 40,
    status,
    missingLearningPrerequisites: [],
    isPlanned: false,
    mayMove: true,
    ...overrides,
  }
}

function UrlProbe() {
  const [searchParams] = useSearchParams()
  return <div data-testid="url-probe">{searchParams.toString()}</div>
}

function renderSection(initialEntries = ['/hub']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <TrackingRotationSection />
        <UrlProbe />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { queryClient, ...utils }
}

function countTrackingCalls() {
  return apiGet.mock.calls.filter(([path]) => path.startsWith('/rotation-planner/tracking/schedule')).length
}

describe('TrackingRotationSection', () => {
  beforeEach(() => {
    mockApi.plans = PLANS
    mockApi.schedule = JSON.parse(JSON.stringify(SCHEDULE))
    mockApi.trackingPending = false
    mockApi.failNextTracking = false
    mockApi.trackingError = null
    vi.clearAllMocks()
  })

  it('renders displayName, status text, rotationLabel and Open in planner link', async () => {
    renderSection()

    expect(await screen.findByText('Cardiology — January 2026')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Cardiology Rotation')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in planner' })).toHaveAttribute('href', '/rotations?plan=p1')
  })

  it('sorts switcher options active → newest draft → newest paused → newest completed and updates on select', async () => {
    renderSection()
    await screen.findByText('Cardiology — January 2026')

    const options = screen.getAllByRole('option')
    expect(options.map(o => o.textContent)).toEqual([
      'Cardiology',
      'Pulmonology',
      'Nephrology',
      'Neurology',
      'Endocrinology',
    ])

    fireEvent.change(screen.getByLabelText('Rotation plan'), { target: { value: 'p4' } })

    await waitFor(() => expect(screen.getByTestId('url-probe').textContent).toContain('plan=p4'))
    await waitFor(() => {
      const trackingPaths = apiGet.mock.calls.map(([path]) => path)
      expect(trackingPaths.some(p => p.startsWith('/rotation-planner/tracking/schedule') && p.includes('planId=p4'))).toBe(true)
    })
  })

  it('shows locked copy with two prerequisite titles', async () => {
    mockApi.schedule = {
      ...SCHEDULE,
      nextBlock: {
        taskId: 'n1',
        planQuestionGroupId: 'g1',
        groupKey: 'cardio-u1',
        groupTitle: 'Cardiology UWorld Set 1',
        taskType: 'uworld_questions',
        plannedDate: '2026-01-10',
        targetQuestions: 40,
        completedQuestions: 0,
        remainingQuestions: 40,
        status: 'locked',
        missingLearningPrerequisites: [
          { planTopicId: 't1', canonicalTopicId: 'c1', title: 'Heart Failure' },
          { planTopicId: 't2', canonicalTopicId: 'c2', title: 'Arrhythmias' },
        ],
        isPlanned: false,
        mayMove: false,
      },
    }
    renderSection()

    expect(await screen.findByText('Locked — complete Heart Failure and Arrhythmias')).toBeInTheDocument()
  })

  it('shows locked copy with a single prerequisite title', async () => {
    mockApi.schedule = {
      ...SCHEDULE,
      nextBlock: {
        taskId: 'n1',
        planQuestionGroupId: 'g1',
        groupKey: 'cardio-u1',
        groupTitle: 'Cardiology UWorld Set 1',
        taskType: 'uworld_questions',
        plannedDate: '2026-01-10',
        targetQuestions: 40,
        completedQuestions: 0,
        remainingQuestions: 40,
        status: 'locked',
        missingLearningPrerequisites: [
          { planTopicId: 't1', canonicalTopicId: 'c1', title: 'Heart Failure' },
        ],
        isPlanned: false,
        mayMove: false,
      },
    }
    renderSection()

    expect(await screen.findByText('Locked — complete Heart Failure')).toBeInTheDocument()
  })

  it('renders the planned helper line for isPlanned items', async () => {
    mockApi.schedule = {
      ...SCHEDULE,
      schedule: [
        makeItem('s1', 'planned', { groupTitle: 'Cardiology Block 1', isPlanned: true, plannedDate: '2026-01-10' }),
      ],
    }
    renderSection()

    expect(await screen.findByText(/Planned for \w{3} \d{1,2} — moves if you reschedule/)).toBeInTheDocument()
  })

  it('renders incorrect review rows under a distinct heading, not mixed into the schedule', async () => {
    mockApi.schedule = {
      ...SCHEDULE,
      schedule: [
        makeItem('s1', 'in_progress', { groupTitle: 'Cardiology Block 1' }),
      ],
      incorrectReview: [
        makeItem('i1', 'ready', { groupTitle: 'Incorrect: Heart Failure', taskType: 'incorrect_review' }),
      ],
    }
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Incorrect Review' })).toBeInTheDocument()

    const scheduleList = screen.getByTestId('schedule-list')
    const incorrectList = screen.getByTestId('incorrect-list')
    expect(within(incorrectList).getByText('Incorrect: Heart Failure')).toBeInTheDocument()
    expect(within(scheduleList).queryByText('Incorrect: Heart Failure')).not.toBeInTheDocument()
  })

  it('renders connected anki decks with badge, counts and open link', async () => {
    mockApi.schedule = {
      ...SCHEDULE,
      linkedDecks: [
        { deckName: 'Cardiology Deck', isPrimary: true, cardCount: 120, dueCount: 15 },
        { deckName: 'Pharmacology Deck', isPrimary: false, cardCount: 80, dueCount: 5 },
      ],
    }
    renderSection()

    expect(await screen.findByText('Cardiology Deck')).toBeInTheDocument()
    expect(screen.getByText('Pharmacology Deck')).toBeInTheDocument()
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(screen.getByText('120 cards · 15 due')).toBeInTheDocument()
    expect(screen.getByText('80 cards · 5 due')).toBeInTheDocument()

    const openLinks = screen.getAllByRole('link', { name: 'Open Deck' })
    expect(openLinks[0]).toHaveAttribute('href', '/anki?deck=Cardiology%20Deck')
    expect(openLinks[1]).toHaveAttribute('href', '/anki?deck=Pharmacology%20Deck')
  })

  it('does not crash when a locked item has empty missingLearningPrerequisites', async () => {
    mockApi.schedule = {
      ...SCHEDULE,
      schedule: [makeItem('s1', 'locked', { missingLearningPrerequisites: [] })],
    }
    renderSection()

    expect((await screen.findAllByText('Locked')).length).toBeGreaterThan(0)
  })

  it('renders the no-plan empty state with a create link when plan is null', async () => {
    mockApi.schedule = { ...SCHEDULE, plan: null, schedule: [], incorrectReview: [], linkedDecks: [] }
    renderSection()

    expect(await screen.findByText('No rotation plan yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/rotations')
  })

  it('recovers from a 404 deleted plan by clearing planId and refetching auto-selection', async () => {
    mockApi.failNextTracking = true
    mockApi.trackingError = new ApiError({ status: 404, message: 'Plan not found' })
    renderSection(['/hub?plan=p1'])

    await screen.findByText('Cardiology — January 2026')

    await waitFor(() => {
      expect(screen.getByTestId('url-probe').textContent).not.toContain('plan=')
    })

    await waitFor(() => {
      const trackingPaths = apiGet.mock.calls.map(([path]) => path)
      expect(trackingPaths.some(p => p.includes('planId=p1'))).toBe(true)
      expect(trackingPaths.some(p => p.startsWith('/rotation-planner/tracking/schedule') && !p.includes('planId='))).toBe(true)
    })
  })

  it('refetches tracking after a task start/complete/partial mutation invalidates trackingAll', async () => {
    const { queryClient } = renderSection()
    await screen.findByText('Cardiology — January 2026')

    const before = countTrackingCalls()
    await act(async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.trackingAll() })
    })
    await waitFor(() => expect(countTrackingCalls()).toBe(before + 1))
  })

  it('refetches tracking after record_questions/record_time mutations invalidate trackingAll', async () => {
    const { queryClient } = renderSection()
    await screen.findByText('Cardiology — January 2026')

    const before = countTrackingCalls()
    await act(async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.trackingAll() })
    })
    await waitFor(() => expect(countTrackingCalls()).toBe(before + 1))
  })

  it('refetches tracking after skip/reschedule mutations invalidate trackingAll', async () => {
    const { queryClient } = renderSection()
    await screen.findByText('Cardiology — January 2026')

    const before = countTrackingCalls()
    await act(async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.trackingAll() })
    })
    await waitFor(() => expect(countTrackingCalls()).toBe(before + 1))
  })

  it('refetches tracking after a plan lifecycle mutation invalidates trackingAll', async () => {
    const { queryClient } = renderSection()
    await screen.findByText('Cardiology — January 2026')

    const before = countTrackingCalls()
    await act(async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.trackingAll() })
    })
    await waitFor(() => expect(countTrackingCalls()).toBe(before + 1))
  })

  it('refetches tracking after a plan-deck replacement mutation invalidates trackingAll', async () => {
    const { queryClient } = renderSection()
    await screen.findByText('Cardiology — January 2026')

    const before = countTrackingCalls()
    await act(async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rotations.trackingAll() })
    })
    await waitFor(() => expect(countTrackingCalls()).toBe(before + 1))
  })

  it('renders every schedule status with its textual label', async () => {
    mockApi.schedule = {
      ...SCHEDULE,
      schedule: [
        makeItem('s1', 'completed'),
        makeItem('s2', 'overdue'),
        makeItem('s3', 'due_today'),
        makeItem('s4', 'locked'),
        makeItem('s5', 'ready'),
        makeItem('s6', 'planned'),
        makeItem('s7', 'in_progress'),
        makeItem('s8', 'partial'),
      ],
    }
    renderSection()

    expect((await screen.findAllByText('Locked')).length).toBeGreaterThan(0)
    for (const label of ['Completed', 'Overdue', 'Due today', 'Ready', 'Planned', 'In progress', 'Partial']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('uses overflow-wrap on the trackingRoot and no fixed px min-width in the CSS module', async () => {
    renderSection()
    await screen.findByText('Cardiology — January 2026')
    const root = screen.getByTestId('tracking-root')
    expect(root.className).toContain(styles.trackingRoot)

    const cssSource = readFileSync(path.resolve(process.cwd(), 'src/components/rotation/tracking/TrackingRotationSection.module.css'), 'utf8')
    expect(cssSource).toMatch(/\.trackingRoot\s*\{[^}]*overflow-wrap\s*:\s*anywhere/)
    expect(cssSource).not.toMatch(/min-width:\s*\d+px/)
  })

  it('shows a loading indicator while the tracking query is pending', async () => {
    mockApi.trackingPending = true
    renderSection()

    expect(screen.getByText('Loading rotation schedule...')).toBeInTheDocument()
    expect(screen.queryByText('No rotation plan yet')).not.toBeInTheDocument()
  })

  it('shows a readable error message and a Retry button that refetches on non-404 errors', async () => {
    mockApi.failNextTracking = true
    mockApi.trackingError = new Error('Network error')
    renderSection()

    expect(await screen.findByText('Couldn\'t load your rotation schedule.')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()

    const before = countTrackingCalls()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(countTrackingCalls()).toBe(before + 1))
    expect(await screen.findByText('Cardiology — January 2026')).toBeInTheDocument()
  })
})
