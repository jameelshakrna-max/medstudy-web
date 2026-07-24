// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TodayView from '../TodayView'

vi.mock('../../../../lib/api', () => ({ apiGet: vi.fn() }))

const TODAY = new Date().toISOString().slice(0, 10)

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
    expect(screen.getByText('1/2 tasks')).toBeInTheDocument()
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
    expect(screen.getByText('1/1 tasks')).toBeInTheDocument()
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
    expect(screen.getByText('1/1 tasks')).toBeInTheDocument()
  })
})
