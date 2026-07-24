// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskCard from '../TaskCard'

const defaultPlan = { id: 'plan-1', revision: 1 }

const baseTask = {
  id: 'task-1',
  planId: 'plan-1',
  planTopicId: 'topic-1',
  taskType: 'learning',
  status: 'pending',
  taskDate: '2026-07-23',
  estimatedMinutes: 60,
  actualMinutes: 0,
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

const uworldTask = {
  ...baseTask,
  taskType: 'uworld_questions',
  status: 'in_progress',
  isActive: true,
  statusLabel: 'In Progress',
}

const defaultCallbacks = () => ({
  onStart: vi.fn(),
  onComplete: vi.fn(),
  onPartial: vi.fn(),
  onRecordTime: vi.fn(),
  onRecordQuestions: vi.fn(),
  onSkip: vi.fn(),
  onStudyPomodoro: vi.fn(),
})

function renderCard(task = baseTask, callbacks = {}) {
  const cbs = { ...defaultCallbacks(), ...callbacks }
  return {
    ...render(
      <TaskCard
        task={task}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        sourceTitle="Step-Up to Medicine"
        isMutating={false}
        canStudy={task.status === 'pending' || task.status === 'in_progress'}
        {...cbs}
      />
    ),
    cbs,
  }
}

describe('TaskCard', () => {
  it('renders topic title when available', () => {
    renderCard()
    expect(screen.getByText('Stable Angina Pectoris')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders topic source from sourceTitle prop', () => {
    renderCard()
    expect(screen.getByText(/Step-Up to Medicine/)).toBeInTheDocument()
  })

  it('falls back to typeLabel when no topic', () => {
    renderCard(taskNoTopic)
    expect(screen.getAllByText('Learning').length).toBeGreaterThanOrEqual(1)
  })

  it('does not show normalizedTopicId as visible title', () => {
    renderCard()
    expect(screen.queryByText('step-up-medicine-6e-2024::cardiology.stable-angina-pectoris')).not.toBeInTheDocument()
  })

  it('Start button calls onStart', () => {
    const { cbs } = renderCard()
    fireEvent.click(screen.getByText(/Start/))
    expect(cbs.onStart).toHaveBeenCalledWith(baseTask)
  })

  it('shows Study with Pomodoro for pending tasks', () => {
    renderCard()
    expect(screen.getByText(/Study with Pomodoro/)).toBeInTheDocument()
  })

  it('shows Study with Pomodoro for in_progress tasks', () => {
    const activeTask = { ...baseTask, status: 'in_progress', isActive: true, statusLabel: 'In Progress' }
    renderCard(activeTask)
    expect(screen.getByText(/Study with Pomodoro/)).toBeInTheDocument()
  })

  it('does not show Study with Pomodoro for completed tasks', () => {
    const completedTask = { ...baseTask, status: 'completed', isTerminal: true, statusLabel: 'Completed' }
    renderCard(completedTask, { canStudy: false })
    expect(screen.queryByText(/Study with Pomodoro/)).not.toBeInTheDocument()
  })

  it('Study with Pomodoro calls onStudyPomodoro', () => {
    const { cbs } = renderCard()
    fireEvent.click(screen.getByText(/Study with Pomodoro/))
    expect(cbs.onStudyPomodoro).toHaveBeenCalledWith(baseTask)
  })

  it('Done calls onComplete', () => {
    const { cbs } = renderCard(uworldTask)
    fireEvent.click(screen.getByText('Done'))
    expect(cbs.onComplete).toHaveBeenCalledWith(uworldTask)
  })

  it('Partial calls onPartial', () => {
    const { cbs } = renderCard(uworldTask)
    fireEvent.click(screen.getByText('Partial'))
    expect(cbs.onPartial).toHaveBeenCalledWith(uworldTask)
  })

  it('Skip calls onSkip', () => {
    const { cbs } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
    expect(cbs.onSkip).toHaveBeenCalledWith(baseTask)
  })

  it('Log Time calls onRecordTime', () => {
    const { cbs } = renderCard(uworldTask)
    fireEvent.click(screen.getByText('Log Time'))
    expect(cbs.onRecordTime).toHaveBeenCalledWith(uworldTask)
  })

  it('Log Questions calls onRecordQuestions for uworld', () => {
    const { cbs } = renderCard(uworldTask)
    fireEvent.click(screen.getByText('Log Questions'))
    expect(cbs.onRecordQuestions).toHaveBeenCalledWith(uworldTask)
  })

  it('does not show Log Questions for learning tasks', () => {
    renderCard()
    expect(screen.queryByText('Log Questions')).not.toBeInTheDocument()
  })

  it('shows Log Time for in_progress tasks', () => {
    renderCard(uworldTask)
    expect(screen.getByText('Log Time')).toBeInTheDocument()
  })

  it('renders no action buttons for locked tasks', () => {
    const lockedTask = { ...baseTask, status: 'locked', isLocked: true, statusLabel: 'Locked' }
    renderCard(lockedTask, { canStudy: false })
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
        sourceTitle="Step-Up to Medicine"
        isMutating={false}
        canStudy={false}
        onStart={vi.fn()}
        onComplete={vi.fn()}
        onPartial={vi.fn()}
        onRecordTime={vi.fn()}
        onRecordQuestions={vi.fn()}
        onSkip={vi.fn()}
        onStudyPomodoro={vi.fn()}
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
        sourceTitle="Step-Up to Medicine"
        isMutating={false}
        canStudy={true}
        onStart={vi.fn()}
        onComplete={vi.fn()}
        onPartial={vi.fn()}
        onRecordTime={vi.fn()}
        onRecordQuestions={vi.fn()}
        onSkip={vi.fn()}
        onStudyPomodoro={vi.fn()}
      />
    )
    expect(container.firstChild.className).toContain('overdue')
  })

  it('renders time estimate', () => {
    renderCard()
    expect(screen.getByText('1h')).toBeInTheDocument()
  })

  it('renders progress label', () => {
    renderCard()
    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('disables buttons during mutation', () => {
    renderCard(baseTask, { isMutating: true })
    const startBtn = screen.getByText('Starting...')
    expect(startBtn).toBeDisabled()
  })

  it('buttons emit correct task object', () => {
    const { cbs } = renderCard(uworldTask)
    fireEvent.click(screen.getByText('Done'))
    expect(cbs.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', taskType: 'uworld_questions' })
    )
  })

  it('shows record_questions only for question-capable in_progress types', () => {
    renderCard(uworldTask)
    expect(screen.getByText('Log Questions')).toBeInTheDocument()
  })

  it('does not show record_questions for consolidation', () => {
    const consolidationTask = { ...baseTask, taskType: 'consolidation', status: 'in_progress', isActive: true, statusLabel: 'In Progress' }
    renderCard(consolidationTask)
    expect(screen.queryByText('Log Questions')).not.toBeInTheDocument()
  })
})
