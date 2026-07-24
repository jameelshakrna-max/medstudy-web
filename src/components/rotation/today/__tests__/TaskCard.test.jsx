// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskCard from '../TaskCard'

vi.mock('../../../../lib/api', () => ({ apiGet: vi.fn() }))

const defaultPlan = { id: 'plan-1', revision: 1 }

const makeMutations = (overrides = {}) => ({
  startTask: vi.fn().mockResolvedValue({ result: { revision: 2 } }),
  completeTask: vi.fn().mockResolvedValue({}),
  partialTask: vi.fn().mockResolvedValue({}),
  skipTask: vi.fn().mockResolvedValue({}),
  isPending: false,
  ...overrides,
})

const makeTaskAttachment = (overrides = {}) => ({
  handlePlay: vi.fn(),
  handleDetach: vi.fn(),
  isAttached: false,
  ...overrides,
})

const baseTask = {
  id: 'task-1',
  planId: 'plan-1',
  taskType: 'learning',
  status: 'pending',
  taskDate: '2026-07-23',
  estimatedMinutes: 60,
  typeLabel: 'Learning',
  statusLabel: 'Pending',
  timeEstimate: '1h',
  timeActual: '',
  progressPercent: 0,
  progressLabel: 'Not started',
  isLocked: false,
  isActive: false,
  isCompleted: false,
  isTerminal: false,
  isOverdue: false,
  topicTitle: 'Stable Angina Pectoris',
  topicSource: 'step-up-medicine-6e-2024',
  topicSection: 'cardiology',
}

const taskNoTopic = {
  ...baseTask,
  topicTitle: null,
  topicSource: null,
  topicSection: null,
}

describe('TaskCard', () => {
  it('renders topic title when available', () => {
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.getByText('Stable Angina Pectoris')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders topic source and section', () => {
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.getByText(/step-up-medicine-6e-2024/)).toBeInTheDocument()
  })

  it('renders sourceTitle when provided', () => {
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
        sourceTitle="Step-Up Medicine 6e"
      />
    )
    expect(screen.getByText(/Step-Up Medicine 6e/)).toBeInTheDocument()
    expect(screen.queryByText(/step-up-medicine-6e-2024/)).not.toBeInTheDocument()
  })

  it('falls back to topicSource when sourceTitle is not provided', () => {
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.getByText(/step-up-medicine-6e-2024/)).toBeInTheDocument()
  })

  it('falls back to typeLabel when no topic', () => {
    render(
      <TaskCard
        task={taskNoTopic}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.getAllByText('Learning').length).toBeGreaterThanOrEqual(1)
  })

  it('does not show normalizedTopicId as visible title', () => {
    const taskWithNormId = {
      ...baseTask,
      topicTitle: 'Stable Angina Pectoris',
    }
    render(
      <TaskCard
        task={taskWithNormId}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.queryByText('step-up-medicine-6e-2024::cardiology.stable-angina-pectoris')).not.toBeInTheDocument()
  })

  it('Start button calls startTask', () => {
    const mutations = makeMutations()
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={mutations}
        taskAttachment={makeTaskAttachment()}
      />
    )
    fireEvent.click(screen.getByText(/Start/))
    expect(mutations.startTask).toHaveBeenCalledWith('task-1')
  })

  it('shows Study with Pomodoro for pending tasks', () => {
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.getByText(/Study with Pomodoro/)).toBeInTheDocument()
  })

  it('shows Study with Pomodoro for in_progress tasks', () => {
    const activeTask = { ...baseTask, status: 'in_progress', isActive: true, statusLabel: 'In Progress' }
    render(
      <TaskCard
        task={activeTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.getByText(/Study with Pomodoro/)).toBeInTheDocument()
  })

  it('does not show Study with Pomodoro for completed tasks', () => {
    const completedTask = { ...baseTask, status: 'completed', isTerminal: true, statusLabel: 'Completed' }
    render(
      <TaskCard
        task={completedTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.queryByText(/Study with Pomodoro/)).not.toBeInTheDocument()
  })

  it('Study with Pomodoro calls taskAttachment.handlePlay', () => {
    const attachment = makeTaskAttachment()
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={attachment}
      />
    )
    fireEvent.click(screen.getByText(/Study with Pomodoro/))
    expect(attachment.handlePlay).toHaveBeenCalledWith(baseTask)
  })

  it('shows action buttons for in_progress tasks', () => {
    const activeTask = { ...baseTask, status: 'in_progress', isActive: true, statusLabel: 'In Progress' }
    render(
      <TaskCard
        task={activeTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Partial')).toBeInTheDocument()
  })

  it('Done opens completion dialog', () => {
    const activeTask = { ...baseTask, status: 'in_progress', isActive: true, statusLabel: 'In Progress' }
    render(
      <TaskCard
        task={activeTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    fireEvent.click(screen.getByText('Done'))
    expect(screen.getByText('Mark as Complete')).toBeInTheDocument()
  })

  it('Skip opens confirmation dialog', () => {
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
    expect(screen.getByRole('heading', { name: 'Skip Task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip Task' })).toBeInTheDocument()
  })

  it('Skip dialog calls skipTask on confirm', () => {
    const mutations = makeMutations()
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={mutations}
        taskAttachment={makeTaskAttachment()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip Task' }))
    expect(mutations.skipTask).toHaveBeenCalledWith('task-1')
  })

  it('renders no action buttons for locked tasks', () => {
    const lockedTask = { ...baseTask, status: 'locked', isLocked: true, statusLabel: 'Locked' }
    render(
      <TaskCard
        task={lockedTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
  })

  it('applies aria-disabled for locked tasks', () => {
    const lockedTask = { ...baseTask, status: 'locked', isLocked: true, statusLabel: 'Locked' }
    const { container } = render(
      <TaskCard
        task={lockedTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(container.firstChild).toHaveAttribute('aria-disabled', 'true')
  })

  it('renders overdue style for overdue tasks', () => {
    const overdueTask = { ...baseTask, isOverdue: true }
    const { container } = render(
      <TaskCard
        task={overdueTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(container.firstChild.className).toContain('overdue')
  })

  it('renders time estimate', () => {
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.getByText('1h')).toBeInTheDocument()
  })

  it('renders progress label', () => {
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={makeMutations()}
        taskAttachment={makeTaskAttachment()}
      />
    )
    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('disables buttons during mutation', () => {
    const mutations = makeMutations({ isPending: true })
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        mutations={mutations}
        taskAttachment={makeTaskAttachment()}
      />
    )
    const startBtn = screen.getByText('Starting...')
    expect(startBtn).toBeDisabled()
  })
})
