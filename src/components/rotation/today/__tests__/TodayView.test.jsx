// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TodayView from '../TodayView'

vi.mock('../../../../lib/api', () => ({ apiGet: vi.fn() }))

import { getTodayKey, getBrowserTimezone } from '../todayUtils'

const TODAY = getTodayKey(new Date(), getBrowserTimezone())

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

function renderTodayView(tasks = [], planOverrides = {}, extraProps = {}) {
  return render(
    <TodayView
      planId="plan-1"
      tasks={tasks}
      topicsById={new Map()}
      plan={{ ...defaultPlan, ...planOverrides }}
      isMutating={false}
      {...defaultCallbacks}
      {...extraProps}
    />
  )
}

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
    render(<TodayView planId="plan-1" tasks={futureTasks} topicsById={new Map()} plan={futurePlan} isMutating={false} {...defaultCallbacks} />)
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
    render(<TodayView planId="plan-1" tasks={futureTasks} topicsById={new Map()} plan={futurePlan} isMutating={false} {...defaultCallbacks} />)
    expect(screen.getByText('2 upcoming tasks')).toBeInTheDocument()
  })

  it('shows EMPTY_TODAY when plan active but no tasks today', () => {
    const plan = { id: 'plan-1', revision: 1, startDate: '2026-07-20' }
    const futureTasks = [
      { id: 't1', taskDate: '2099-01-10', status: 'locked', taskType: 'learning', estimatedMinutes: 60 },
    ]
    render(<TodayView planId="plan-1" tasks={futureTasks} topicsById={new Map()} plan={plan} isMutating={false} {...defaultCallbacks} />)
    expect(screen.getByText('Nothing scheduled for today')).toBeInTheDocument()
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
})
