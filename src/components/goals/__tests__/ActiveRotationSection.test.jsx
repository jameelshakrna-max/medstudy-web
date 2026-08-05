// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ActiveRotationSection, { selectCurrentPlan } from '../ActiveRotationSection'

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    plans: [],
    detail: null,
    failPlans: false,
    failDetail: false,
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
      if (mockApi.failPlans) return Promise.reject(new Error('plans down'))
      return Promise.resolve(mockApi.plans)
    }
    if (path.startsWith('/rotation-planner/plans/')) {
      if (mockApi.failDetail) return Promise.reject(new Error('detail down'))
      return Promise.resolve(mockApi.detail)
    }
    return Promise.resolve({})
  }),
}))

import { apiGet } from '../../../lib/api'

const PLAN_ACTIVE = {
  id: 'p-active',
  sourceTitle: 'Cardiology Step 1',
  rotationId: 'cardiology',
  startDate: '2026-01-05',
  endDate: '2026-01-30',
  status: 'active',
  updatedAt: '2026-01-04T00:00:00Z',
}
const PLAN_DRAFT_A = {
  id: 'p-draft-a',
  sourceTitle: 'Draft A Plan',
  rotationId: 'cardiology',
  startDate: '2026-01-05',
  endDate: '2026-01-30',
  status: 'draft',
  updatedAt: '2026-01-03T00:00:00Z',
}
const PLAN_DRAFT_B = {
  id: 'p-draft-b',
  sourceTitle: 'Draft B Plan',
  rotationId: 'cardiology',
  startDate: '2026-01-05',
  endDate: '2026-01-30',
  status: 'draft',
  updatedAt: '2026-01-04T00:00:00Z',
}
const PLAN_PAUSED = {
  id: 'p-paused',
  sourceTitle: 'Paused Plan',
  rotationId: 'cardiology',
  startDate: '2026-01-05',
  endDate: '2026-01-30',
  status: 'paused',
  updatedAt: '2026-01-02T00:00:00Z',
}
const PLAN_COMPLETED = {
  id: 'p-completed',
  sourceTitle: 'Completed Plan',
  rotationId: 'cardiology',
  startDate: '2026-01-05',
  endDate: '2026-01-30',
  status: 'completed',
  updatedAt: '2026-01-01T00:00:00Z',
}
const PLAN_ARCHIVED = {
  id: 'p-archived',
  sourceTitle: 'Archived Plan',
  rotationId: 'cardiology',
  startDate: '2026-01-05',
  endDate: '2026-01-30',
  status: 'archived',
  updatedAt: '2026-01-01T00:00:00Z',
}

const DETAIL_READY = {
  plan: {
    id: 'p-active',
    sourceTitle: 'Cardiology Step 1',
    rotationId: 'cardiology',
    sourceId: 'step-up-medicine-6e-2024',
    sourceVersion: 2,
    startDate: '2026-01-05',
    endDate: '2026-01-30',
    status: 'active',
    updatedAt: '2026-01-04T00:00:00Z',
    lastRecalculatedAt: '2026-01-04T00:00:00Z',
    usesFlashcardCapacity: false,
    schedulingMode: 'sequential',
    revision: 1,
    taskCount: 4,
    completedTaskCount: 1,
  },
  topics: [
    {
      id: 't1',
      canonicalTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris',
      topicTitle: 'Stable Angina',
      status: 'completed',
      personalizedLearningMinutes: 60,
      totalUworldQuestions: 20,
      completedUworldQuestions: 15,
    },
    {
      id: 't2',
      canonicalTopicId: 'step-up-medicine-6e-2024::cardiology.acs',
      topicTitle: 'ACS',
      status: 'learning',
      personalizedLearningMinutes: 60,
      totalUworldQuestions: 10,
      completedUworldQuestions: 0,
    },
  ],
  tasks: [
    {
      id: 'task-completed',
      planTopicId: 't1',
      taskDate: '2026-01-01',
      taskType: 'learning',
      status: 'completed',
      displayOrder: 1,
      estimatedMinutes: 60,
      completedCount: 1,
    },
    {
      id: 'task-learn',
      planTopicId: 't2',
      taskDate: '2026-01-05',
      taskType: 'learning',
      status: 'pending',
      displayOrder: 1,
      estimatedMinutes: 60,
      completedCount: 0,
    },
    {
      id: 'task-uworld',
      planTopicId: 't2',
      taskDate: '2026-01-05',
      taskType: 'uworld_questions',
      status: 'locked',
      displayOrder: 2,
      estimatedMinutes: 30,
      completedCount: 0,
      unlockCondition: 'learning_completed:step-up-medicine-6e-2024::cardiology.acs',
    },
    {
      id: 'task-past',
      planTopicId: 't2',
      taskDate: '2026-01-03',
      taskType: 'learning',
      status: 'pending',
      displayOrder: 9,
      estimatedMinutes: 30,
      completedCount: 0,
    },
  ],
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ActiveRotationSection />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('selectCurrentPlan', () => {
  it('prioritizes active over draft over paused', () => {
    expect(selectCurrentPlan([PLAN_PAUSED, PLAN_DRAFT_A, PLAN_ACTIVE]).id).toBe('p-active')
    expect(selectCurrentPlan([PLAN_PAUSED, PLAN_DRAFT_A]).id).toBe('p-draft-a')
    expect(selectCurrentPlan([PLAN_PAUSED]).id).toBe('p-paused')
  })

  it('prefers the most recent updatedAt within a status and excludes completed/archived', () => {
    expect(selectCurrentPlan([PLAN_DRAFT_A, PLAN_DRAFT_B]).id).toBe('p-draft-b')
    expect(selectCurrentPlan([PLAN_ACTIVE, PLAN_COMPLETED, PLAN_ARCHIVED]).id).toBe('p-active')
    expect(selectCurrentPlan([PLAN_COMPLETED, PLAN_ARCHIVED])).toBeNull()
  })

  it('returns null for empty or non-array input', () => {
    expect(selectCurrentPlan([])).toBeNull()
    expect(selectCurrentPlan(undefined)).toBeNull()
    expect(selectCurrentPlan(null)).toBeNull()
  })
})

describe('ActiveRotationSection', () => {
  beforeEach(() => {
    mockApi.plans = [PLAN_ACTIVE]
    mockApi.detail = DETAIL_READY
    mockApi.failPlans = false
    mockApi.failDetail = false
    mockApi.plansPending = false
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('prefers the active plan and renders the Active Rotation heading', async () => {
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Active Rotation' })).toBeInTheDocument()
    expect(screen.getByText('Auto-managed by Rotation Planner')).toBeInTheDocument()
    expect(screen.getByText('Cardiology Step 1')).toBeInTheDocument()
  })

  it('shows the ready heading when only drafts exist', async () => {
    mockApi.plans = [PLAN_DRAFT_A]
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Rotation Plan Ready' })).toBeInTheDocument()
    expect(screen.getByText('Activate this plan to begin tracking your schedule.')).toBeInTheDocument()
  })

  it('selects the newest draft', async () => {
    mockApi.plans = [PLAN_DRAFT_A, PLAN_DRAFT_B]
    renderSection()

    expect(await screen.findByText('Draft B Plan')).toBeInTheDocument()
    expect(screen.queryByText('Draft A Plan')).not.toBeInTheDocument()
  })

  it('shows the paused heading when no active or draft exists', async () => {
    mockApi.plans = [PLAN_PAUSED, PLAN_COMPLETED, PLAN_ARCHIVED]
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Paused Rotation' })).toBeInTheDocument()
    expect(screen.getByText('Resume this plan to continue your schedule.')).toBeInTheDocument()
  })

  it('excludes completed and archived plans', async () => {
    mockApi.plans = [PLAN_ACTIVE, PLAN_COMPLETED, PLAN_ARCHIVED]
    renderSection()

    await screen.findByRole('heading', { name: 'Active Rotation' })
    expect(screen.queryByText('Completed Plan')).not.toBeInTheDocument()
    expect(screen.queryByText('Archived Plan')).not.toBeInTheDocument()
  })

  it('renders nothing when there is no current plan', async () => {
    mockApi.plans = [PLAN_COMPLETED, PLAN_ARCHIVED]
    renderSection()

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/rotation-planner/plans'))
    await waitFor(() => {
      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })
  })

  it('shows a busy skeleton while plans are loading', () => {
    mockApi.plansPending = true
    const { container } = renderSection()

    expect(container.querySelector('section[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('shows a compact error with Retry for the list, then recovers on Retry', async () => {
    mockApi.failPlans = true
    renderSection()

    expect(await screen.findByText("Couldn't load your rotation plans.")).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: 'Retry' })
    expect(retryBtn.tagName).toBe('BUTTON')

    const allCalls = apiGet.mock.calls.map(([path]) => path)
    expect(allCalls.every(p => p.startsWith('/rotation-planner/plans'))).toBe(true)

    mockApi.failPlans = false
    const user = userEvent.setup()
    await user.click(retryBtn)

    expect(await screen.findByRole('heading', { name: 'Active Rotation' })).toBeInTheDocument()
  })

  it('shows a compact detail failure while retaining the summary card, Retry refetches detail', async () => {
    mockApi.failDetail = true
    renderSection()

    expect(await screen.findByText('Cardiology Step 1')).toBeInTheDocument()
    expect(screen.getByText(/Jan 5 – Jan 30/)).toBeInTheDocument()
    expect(await screen.findByText("Couldn't load plan details.")).toBeInTheDocument()

    const retryBtn = screen.getByRole('button', { name: 'Retry' })
    const callsBefore = apiGet.mock.calls.length

    mockApi.failDetail = false
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(apiGet.mock.calls.length).toBeGreaterThan(callsBefore)
    })
    expect(apiGet).toHaveBeenCalledWith('/rotation-planner/plans/p-active')
    expect(await screen.findByText('Overall · 1/2 topics')).toBeInTheDocument()
  })

  it('renders the human-readable rotation label, not the slug', async () => {
    renderSection()

    expect(await screen.findByText('Cardiology Step 1')).toBeInTheDocument()
    expect(screen.getByText(/^Cardiology ·/)).toBeInTheDocument()
    expect(screen.queryByText('cardiology')).not.toBeInTheDocument()
  })

  it('prefers displayName over sourceTitle in the Goals title and link', async () => {
    mockApi.plans = [{ ...PLAN_ACTIVE, displayName: 'Cardiology — January 2026' }]
    renderSection()

    expect(await screen.findByText('Cardiology — January 2026')).toBeInTheDocument()
    expect(screen.queryByText('Cardiology Step 1')).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open Cardiology — January 2026 rotation plan' })
    expect(link).toHaveAttribute('href', '/rotations?plan=p-active')
  })

  it('renders overall, learning, and UWorld progress', async () => {
    renderSection()

    expect(await screen.findByText('Overall · 1/2 topics')).toBeInTheDocument()
    expect(screen.getByText('Learning · 60/120 min')).toBeInTheDocument()
    expect(screen.getByText('UWorld · 15/30 questions')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(3)
  })

  it('shows plan details unavailable with no progress bars when detail is missing', async () => {
    mockApi.detail = null
    renderSection()

    expect(await screen.findByText('Cardiology Step 1')).toBeInTheDocument()
    expect(await screen.findByText('Plan details unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows the locked UWorld prerequisite on the next task', async () => {
    mockApi.detail = {
      ...DETAIL_READY,
      tasks: [
        {
          id: 'task-completed',
          planTopicId: 't1',
          taskDate: '2026-01-01',
          taskType: 'learning',
          status: 'completed',
          displayOrder: 1,
          estimatedMinutes: 60,
          completedCount: 1,
        },
        {
          id: 'task-past',
          planTopicId: 't2',
          taskDate: '2026-01-03',
          taskType: 'learning',
          status: 'pending',
          displayOrder: 9,
          estimatedMinutes: 30,
          completedCount: 0,
        },
        {
          id: 'task-uworld',
          planTopicId: 't2',
          taskDate: '2026-01-10',
          taskType: 'uworld_questions',
          status: 'locked',
          displayOrder: 1,
          estimatedMinutes: 30,
          completedCount: 0,
          unlockCondition: 'learning_completed:step-up-medicine-6e-2024::cardiology.acs',
        },
      ],
    }
    renderSection()

    expect(await screen.findByText(/Complete learning for ACS first/)).toBeInTheDocument()
  })

  it('shows no upcoming task when all tasks are terminal or past', async () => {
    mockApi.detail = {
      ...DETAIL_READY,
      tasks: [
        {
          id: 'task-completed',
          planTopicId: 't1',
          taskDate: '2026-01-01',
          taskType: 'learning',
          status: 'completed',
          displayOrder: 1,
          estimatedMinutes: 60,
          completedCount: 1,
        },
        {
          id: 'task-past',
          planTopicId: 't2',
          taskDate: '2026-01-03',
          taskType: 'learning',
          status: 'pending',
          displayOrder: 9,
          estimatedMinutes: 30,
          completedCount: 0,
        },
      ],
    }
    renderSection()

    expect(await screen.findByText('No upcoming task scheduled.')).toBeInTheDocument()
  })

  it('flashcards with a positive due count render as due', async () => {
    mockApi.detail = {
      ...DETAIL_READY,
      topics: [],
      tasks: [
        {
          id: 'task-flash',
          planTopicId: null,
          taskDate: '2099-01-01',
          taskType: 'flashcard_review',
          status: 'pending',
          displayOrder: 1,
          estimatedMinutes: 10,
          metadataJson: { dueCardCount: 12 },
        },
      ],
    }
    renderSection()

    expect(await screen.findByText('Flashcards · 12 due')).toBeInTheDocument()
    expect(screen.queryByText(/reviewed/i)).not.toBeInTheDocument()
  })

  it('flashcards with a zero due count render as No cards due', async () => {
    mockApi.detail = {
      ...DETAIL_READY,
      topics: [],
      tasks: [
        {
          id: 'task-flash',
          planTopicId: null,
          taskDate: '2099-01-01',
          taskType: 'flashcard_review',
          status: 'pending',
          displayOrder: 1,
          estimatedMinutes: 10,
          metadataJson: { dueCardCount: 0 },
        },
      ],
    }
    renderSection()

    expect(await screen.findByText('Flashcards · No cards due')).toBeInTheDocument()
  })

  it('omits the flashcard metric when there is no trustworthy snapshot', async () => {
    mockApi.detail = {
      ...DETAIL_READY,
      tasks: [
        {
          id: 'task-flash',
          planTopicId: null,
          taskDate: '2099-01-01',
          taskType: 'flashcard_review',
          status: 'pending',
          displayOrder: 1,
          estimatedMinutes: 10,
          metadataJson: {},
        },
      ],
    }
    renderSection()

    await screen.findByText('Cardiology Step 1')
    expect(screen.queryByText(/Flashcards/i)).not.toBeInTheDocument()
  })

  it('never renders reviewed wording without real review data', async () => {
    renderSection()

    await screen.findByText('Cardiology Step 1')
    expect(screen.queryByText(/reviewed/i)).not.toBeInTheDocument()

    mockApi.detail = {
      ...DETAIL_READY,
      tasks: [
        ...DETAIL_READY.tasks,
        {
          id: 'task-flash',
          planTopicId: null,
          taskDate: '2099-01-01',
          taskType: 'flashcard_review',
          status: 'pending',
          displayOrder: 1,
          estimatedMinutes: 10,
          metadataJson: { dueCardCount: 5 },
        },
      ],
    }
    renderSection()

    expect(await screen.findByText('Flashcards · 5 due')).toBeInTheDocument()
    expect(screen.queryByText(/reviewed/i)).not.toBeInTheDocument()
  })

  it('renders the Open Rotation link to the plan route with an accessible name', async () => {
    renderSection()

    const link = await screen.findByRole('link', { name: 'Open Cardiology Step 1 rotation plan' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/rotations?plan=p-active')
  })

  it('mobile CSS stacks metrics and makes the open link full width', () => {
    const cssPath = path.resolve(process.cwd(), 'src/components/goals/ActiveRotationSection.module.css')
    const css = readFileSync(cssPath, 'utf8')

    expect(css).toMatch(/@media \(max-width: 768px\)/)
    expect(css).toContain('gap: var(--space-sm)')
    expect(css).toContain('width: 100%')
    expect(css).toContain('overflow-wrap: anywhere')
    expect(css).toContain('justify-content: center')
  })

  it('ties the section aria-labelledby to the h2 id and exposes keyboard-accessible controls', async () => {
    renderSection()

    const heading = await screen.findByRole('heading', { name: 'Active Rotation' })
    const section = heading.closest('section')
    expect(section).toHaveAttribute('aria-labelledby', heading.id)

    const link = screen.getByRole('link', { name: 'Open Cardiology Step 1 rotation plan' })
    expect(link).toHaveAccessibleName('Open Cardiology Step 1 rotation plan')
  })
})
