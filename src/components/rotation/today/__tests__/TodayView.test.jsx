// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TodayView from '../TodayView'

vi.mock('../../../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }))

import { apiPost } from '../../../../lib/api'
import { getTodayKey, getBrowserTimezone, getNextDateKey } from '../todayUtils'
import { toStartOfDayUTC } from '../../../../lib/dateUtils'

const TODAY = getTodayKey(new Date(), getBrowserTimezone())

const DEFAULT_WIZARD_AVAILABILITY = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  availableMinutes: weekday === 0 || weekday === 6 ? 0 : 120,
  isDayOff: weekday === 0 || weekday === 6,
}))

const makeTask = (overrides = {}) => ({
  id: 'task-1',
  planId: 'plan-1',
  planTopicId: 'topic-1',
  taskType: 'learning',
  status: 'pending',
  taskDate: TODAY,
  estimatedMinutes: 60,
  actualMinutes: 0,
  targetCount: null,
  completedCount: 0,
  completionPercentage: 0,
  incorrectCount: 0,
  displayOrder: 1,
  ...overrides,
})

const defaultPlan = { id: 'plan-1', revision: 1 }

const noop = vi.fn()

const defaultCallbacks = {
  onStart: noop,
  onComplete: noop,
  onPartial: noop,
  onRecordTime: noop,
  onRecordQuestions: noop,
  onSkip: noop,
  onStudyPomodoro: noop,
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrap(ui) {
  return <QueryClientProvider client={makeClient()}>{ui}</QueryClientProvider>
}

function renderTodayView(tasks = [], planOverrides = {}, extraProps = {}) {
  return render(wrap(
    <TodayView
      planId="plan-1"
      tasks={tasks}
      topicsById={new Map()}
      plan={{ ...defaultPlan, ...planOverrides }}
      isMutating={false}
      {...defaultCallbacks}
      {...extraProps}
    />
  ))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('TodayView', () => {
  it('renders daily progress header with task counts', () => {
    renderTodayView([
      makeTask({ id: 't1', status: 'completed' }),
      makeTask({ id: 't2', status: 'pending' }),
    ])
    expect(screen.getByText(/1 of 2 tasks completed/)).toBeInTheDocument()
  })

  it('renders sections with tasks', () => {
    renderTodayView([
      makeTask({ id: 't1', taskType: 'learning', status: 'pending' }),
      makeTask({ id: 't2', taskType: 'uworld_questions', status: 'pending' }),
    ])
    expect(screen.getByText('Learn')).toBeInTheDocument()
    expect(screen.getByText('UWorld')).toBeInTheDocument()
  })

  it('shows empty state when no tasks', () => {
    renderTodayView([])
    expect(screen.getByText('Nothing scheduled for today')).toBeInTheDocument()
  })

  it('hides completed tasks from sections and shows all-done message', () => {
    renderTodayView([
      makeTask({ id: 't1', status: 'completed' }),
    ])
    expect(screen.queryByText('Nothing scheduled for today')).not.toBeInTheDocument()
    expect(screen.getByText('All done for today!')).toBeInTheDocument()
    expect(screen.getByText(/1 of 1 task completed/)).toBeInTheDocument()
  })

  it('shows PRE_START state when plan has not started', () => {
    const futurePlan = { id: 'plan-1', revision: 1, startDate: '2099-01-10' }
    const futureTasks = [
      { id: 't1', taskDate: '2099-01-10', status: 'locked', taskType: 'learning', estimatedMinutes: 60 },
    ]
    render(wrap(<TodayView planId="plan-1" tasks={futureTasks} topicsById={new Map()} plan={futurePlan} isMutating={false} {...defaultCallbacks} />))
    expect(screen.getByText(/Your rotation starts/)).toBeInTheDocument()
    expect(screen.queryByText('All done for today!')).not.toBeInTheDocument()
    expect(screen.queryByText('1/1 tasks')).not.toBeInTheDocument()
  })

  it('shows task count in PRE_START state', () => {
    const futurePlan = { id: 'plan-1', revision: 1, startDate: '2099-01-10' }
    const futureTasks = [
      { id: 't1', taskDate: '2099-01-10', status: 'locked', taskType: 'learning', estimatedMinutes: 60 },
      { id: 't2', taskDate: '2099-01-11', status: 'locked', taskType: 'uworld_questions', estimatedMinutes: 30 },
    ]
    render(wrap(<TodayView planId="plan-1" tasks={futureTasks} topicsById={new Map()} plan={futurePlan} isMutating={false} {...defaultCallbacks} />))
    expect(screen.getByText('2 upcoming tasks')).toBeInTheDocument()
  })

  it('shows EMPTY_TODAY next-task reason when plan active but no tasks today', () => {
    const plan = { id: 'plan-1', revision: 1, startDate: '2026-07-20' }
    const futureTasks = [
      { id: 't1', taskDate: '2099-01-10', status: 'locked', taskType: 'learning', estimatedMinutes: 60 },
    ]
    render(wrap(<TodayView planId="plan-1" tasks={futureTasks} topicsById={new Map()} plan={plan} isMutating={false} {...defaultCallbacks} />))
    expect(screen.getByText('Nothing is scheduled for today.')).toBeInTheDocument()
    expect(screen.queryByText('All done for today!')).not.toBeInTheDocument()
  })

  it('progress header only counts today-relevant tasks', () => {
    const plan = { id: 'plan-1', revision: 1, startDate: '2026-07-20' }
    renderTodayView([
      makeTask({ id: 't1', status: 'completed', taskDate: TODAY, estimatedMinutes: 30 }),
      makeTask({ id: 't2', status: 'locked', taskDate: '2099-01-10', estimatedMinutes: 60 }),
    ], plan)
    expect(screen.getByText(/1 of 1 task completed/)).toBeInTheDocument()
  })

  it('shows the day-off reason for a Saturday day-off (Aug 8 2026) and the next study day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-08T12:00:00Z'))
    renderTodayView([], {
      startDate: '2026-08-08',
      endDate: '2026-09-30',
      status: 'active',
      settingsJson: {
        timezone: 'UTC',
        blockedDates: [],
        availability: DEFAULT_WIZARD_AVAILABILITY,
      },
    })
    expect(screen.getByText('No study time is scheduled for today.')).toBeInTheDocument()
    expect(screen.getByText('Next study day: Monday, Aug 10 2026')).toBeInTheDocument()
  })

  it('shows the day-off reason when availability is passed as a prop', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-08T12:00:00Z'))
    renderTodayView([], {
      startDate: '2026-08-08',
      endDate: '2026-09-30',
      status: 'active',
    }, { availability: DEFAULT_WIZARD_AVAILABILITY })
    expect(screen.getByText('No study time is scheduled for today.')).toBeInTheDocument()
    expect(screen.getByText('Next study day: Monday, Aug 10 2026')).toBeInTheDocument()
  })

  it('rolls the today view over at local midnight', () => {
    vi.useFakeTimers()
    const tz = getBrowserTimezone()
    const baseDate = '2026-08-13'
    const nextMidnightUtc = toStartOfDayUTC(getNextDateKey(baseDate), tz).getTime()
    vi.setSystemTime(new Date(nextMidnightUtc - 30_000))
    renderTodayView(
      [makeTask({ id: 't1', taskDate: baseDate, status: 'pending' })],
      { startDate: '2026-08-01', endDate: '2026-08-31', status: 'active' }
    )
    expect(screen.getByText('Learn')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(31_000))
    expect(screen.queryByText('Learn')).not.toBeInTheDocument()
  })

  it('shows the draft reason with an Activate action wired to the lifecycle endpoint', async () => {
    const user = userEvent.setup()
    apiPost.mockResolvedValue({ plan: { id: 'plan-1', status: 'active', revision: 2 } })
    renderTodayView([], { status: 'draft', revision: 1, startDate: '2026-08-01' })
    expect(screen.getByText("This rotation starts today, but it isn't active yet.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Activate plan/ }))
    expect(apiPost).toHaveBeenCalledWith(
      '/rotation-planner/plans/plan-1/status',
      expect.objectContaining({ action: 'activate', expectedRevision: 1 })
    )
  })

  describe('grouped UWorld tasks', () => {
    const questionGroups = [
      { id: 'group-1', groupKey: 'ischemic-heart-disease', title: 'Ischemic Heart Disease', targetQuestions: 40, displayOrder: 1 },
    ]

    const lockedState = { key: 'ischemic-heart-disease', title: 'Ischemic Heart Disease', completedQuestions: 10, targetQuestions: 40, status: 'in_progress' }

    function groupedTask(overrides = {}) {
      return makeTask({
        id: 't-group-1',
        taskType: 'uworld_questions',
        planQuestionGroupId: 'group-1',
        targetCount: 40,
        status: 'pending',
        unlockCondition: 'learning_group_completed:ischemic-heart-disease',
        ...overrides,
      })
    }

    it('renders grouped tasks with the group label and group title', () => {
      renderTodayView([groupedTask()], {}, {
        questionGroups,
        questionGroupStates: [lockedState],
      })
      expect(screen.getByText('UWorld')).toBeInTheDocument()
      expect(screen.getByText('UWorld review block · 40 questions')).toBeInTheDocument()
      expect(screen.getByText('Ischemic Heart Disease')).toBeInTheDocument()
      expect(screen.getByText('UWorld group Ischemic Heart Disease')).toBeInTheDocument()
    })

    it('shows the lock hint for a locked group task using the lock context', () => {
      renderTodayView([groupedTask()], {}, {
        questionGroups,
        questionGroupStates: [lockedState],
      })
      expect(screen.getByText('Complete learning for Ischemic Heart Disease to unlock these questions.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Start/ })).not.toBeInTheDocument()
    })

    it('does not show the lock hint once the group is complete', () => {
      renderTodayView([groupedTask()], {}, {
        questionGroups,
        questionGroupStates: [{ key: 'ischemic-heart-disease', title: 'Ischemic Heart Disease', completedQuestions: 40, targetQuestions: 40, status: 'completed' }],
      })
      expect(screen.queryByText(/Complete learning for Ischemic Heart Disease/)).not.toBeInTheDocument()
      expect(screen.getByText(/Complete these questions in UWorld/)).toBeInTheDocument()
    })

    it('keeps rendering identical for legacy non-grouped tasks', () => {
      const topic = { id: 'topic-1', canonicalTopicId: 'cardiology.stable-angina-pectoris', topicTitle: 'Stable Angina', status: 'completed' }
      renderTodayView([makeTask({ id: 't2', taskType: 'uworld_questions', status: 'pending' })], {}, {
        questionGroups,
        questionGroupStates: [],
        topicsById: new Map([['topic-1', topic]]),
      })
      expect(screen.getByText('UWorld Questions')).toBeInTheDocument()
      expect(screen.queryByText('UWorld review block · 40 questions')).not.toBeInTheDocument()
    })
  })

  describe('Start Today\'s Plan action', () => {
    const activePlan = { id: 'plan-1', revision: 1, status: 'active', startDate: '2026-08-01', endDate: '2026-09-30' }

    const actionButtons = (name) => screen.queryAllByRole('button', { name })

    it('renders desktop button and mobile shortcut when a startable task exists', async () => {
      const user = userEvent.setup()
      const onStudyPomodoro = vi.fn()
      renderTodayView([makeTask({ id: 't1', status: 'pending' })], activePlan, { onStudyPomodoro })

      expect(actionButtons("Start Today's Plan").length).toBeGreaterThanOrEqual(1)

      await user.click(actionButtons("Start Today's Plan")[0])
      expect(onStudyPomodoro).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', status: 'pending' }))
    })

    it('labels the action Resume Today\'s Plan when a hydrated paused session exists for this task', () => {
      renderTodayView([makeTask({ id: 't1', status: 'in_progress' })], activePlan, {
        pausedSession: { taskId: 't1', planId: 'plan-1' },
      })
      expect(actionButtons("Resume Today's Plan").length).toBeGreaterThanOrEqual(1)
      expect(actionButtons("Start Today's Plan")).toHaveLength(0)
    })

    it('does not offer Resume for an in_progress task without a paused session', () => {
      renderTodayView([
        makeTask({ id: 't1', status: 'in_progress', displayOrder: 0 }),
        makeTask({ id: 't2', status: 'pending', displayOrder: 1 }),
      ], activePlan)
      expect(actionButtons("Resume Today's Plan")).toHaveLength(0)
      expect(actionButtons("Start Today's Plan").length).toBeGreaterThanOrEqual(1)
    })

    it('ignores a paused session belonging to another plan', () => {
      renderTodayView([
        makeTask({ id: 't1', status: 'in_progress', displayOrder: 0 }),
        makeTask({ id: 't2', status: 'pending', displayOrder: 1 }),
      ], activePlan, {
        pausedSession: { taskId: 't1', planId: 'other-plan' },
      })
      expect(actionButtons("Resume Today's Plan")).toHaveLength(0)
      expect(actionButtons("Start Today's Plan").length).toBeGreaterThanOrEqual(1)
    })

    it('hides the action when all work for today is complete', () => {
      renderTodayView([makeTask({ id: 't1', status: 'completed' })], activePlan)
      expect(actionButtons("Start Today's Plan")).toHaveLength(0)
      expect(actionButtons("Resume Today's Plan")).toHaveLength(0)
    })

    it('hides the action when nothing is scheduled for today', () => {
      renderTodayView([makeTask({ id: 't1', taskDate: '2099-01-10', status: 'locked' })], activePlan)
      expect(actionButtons("Start Today's Plan")).toHaveLength(0)
      expect(actionButtons("Resume Today's Plan")).toHaveLength(0)
    })

    it('hides the action for a draft plan', () => {
      renderTodayView([], { status: 'draft', revision: 1, startDate: '2026-08-01' })
      expect(actionButtons("Start Today's Plan")).toHaveLength(0)
      expect(actionButtons("Resume Today's Plan")).toHaveLength(0)
    })

    it('hides the action for a locked-only day', () => {
      renderTodayView([makeTask({ id: 't1', status: 'locked' })], activePlan)
      expect(actionButtons("Start Today's Plan")).toHaveLength(0)
      expect(actionButtons("Resume Today's Plan")).toHaveLength(0)
    })

    it('does not offer a plan action for a flashcard-review-only day', () => {
      renderTodayView([makeTask({ id: 't1', taskType: 'flashcard_review', status: 'pending' })], activePlan)
      expect(actionButtons("Start Today's Plan")).toHaveLength(0)
    })
  })
})
