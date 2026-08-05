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

function renderCard(task = baseTask, callbacks = {}, extra = {}) {
  const cbs = { ...defaultCallbacks(), ...callbacks }
  return {
    ...render(
      <TaskCard
        task={task}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        topicsById={extra.topicsById || new Map()}
        sourceTitle="Step-Up to Medicine"
        isMutating={false}
        canStudy={extra.canStudy ?? (task.status === 'pending' || task.status === 'in_progress')}
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

  it('does not render raw provider slug fragments as visible text', () => {
    renderCard()
    const body = document.body.textContent
    expect(body).not.toMatch(/\b(uworld|amboss|step-up-medicine-6e)\b/i)
  })

  it('renders sourceTitle prop instead of topicSource', () => {
    renderCard()
    expect(screen.getByText(/Step-Up to Medicine/)).toBeInTheDocument()
    expect(screen.queryByText('step-up-medicine-6e-2024')).not.toBeInTheDocument()
  })

  it('renders groupId as topicSection, not a parsed slug fragment', () => {
    renderCard()
    expect(screen.getByText(/cardiology/)).toBeInTheDocument()
    expect(screen.queryByText('step-up-medicine-6e-2024')).not.toBeInTheDocument()
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

  it('Complete calls onComplete', () => {
    const { cbs } = renderCard(uworldTask)
    fireEvent.click(screen.getByText('Complete'))
    expect(cbs.onComplete).toHaveBeenCalledWith(uworldTask)
  })

  it('Record Progress calls onPartial', () => {
    const { cbs } = renderCard(uworldTask)
    fireEvent.click(screen.getByText('Record Progress'))
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
    fireEvent.click(screen.getByText('Complete'))
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

  describe('uworld copy and lock state', () => {
    const pendingUworldTask = {
      ...baseTask,
      taskType: 'uworld_questions',
      status: 'pending',
      isActive: false,
      statusLabel: 'Pending',
    }

    it('renders the UWorld hint for unlocked uworld tasks', () => {
      renderCard(pendingUworldTask)
      expect(screen.getByText('Complete these questions in UWorld, then record your progress in MedStudy.')).toBeInTheDocument()
    })

    it('does not render the UWorld hint for locked uworld tasks', () => {
      const lockedTask = { ...pendingUworldTask, unlockCondition: 'learning_completed:topic-1' }
      renderCard(lockedTask, {}, { canStudy: false })
      expect(screen.queryByText('Complete these questions in UWorld, then record your progress in MedStudy.')).not.toBeInTheDocument()
    })

    it('renders count stats line for uworld tasks with a target', () => {
      renderCard({ ...uworldTask, targetCount: 10, completedCount: 2 })
      expect(screen.getByText('2 of 10 questions \u00b7 8 remaining')).toBeInTheDocument()
    })

    it('renders count stats line for incorrect_review tasks with a target', () => {
      renderCard({ ...uworldTask, taskType: 'incorrect_review', targetCount: 5, completedCount: 5 })
      expect(screen.getByText('5 of 5 questions \u00b7 0 remaining')).toBeInTheDocument()
    })

    it('does not render count stats when targetCount is absent', () => {
      renderCard(uworldTask)
      expect(screen.queryByText(/remaining/)).not.toBeInTheDocument()
    })

    it('shows Start, Record Progress, and Complete for pending uworld tasks', () => {
      renderCard(pendingUworldTask)
      expect(screen.getByText(/Start/)).toBeInTheDocument()
      expect(screen.getByText('Record Progress')).toBeInTheDocument()
      expect(screen.getByText('Complete')).toBeInTheDocument()
      expect(screen.queryByText('Done')).not.toBeInTheDocument()
      expect(screen.queryByText('Partial')).not.toBeInTheDocument()
    })

    it('keeps Done/Partial labels for non-question task types', () => {
      renderCard(baseTask)
      expect(screen.getByText('Done')).toBeInTheDocument()
      expect(screen.getByText('Partial')).toBeInTheDocument()
      expect(screen.queryByText('Complete')).not.toBeInTheDocument()
      expect(screen.queryByText('Record Progress')).not.toBeInTheDocument()
    })

    it('Record Progress calls onPartial and Complete calls onComplete', () => {
      const { cbs } = renderCard(pendingUworldTask)
      fireEvent.click(screen.getByText('Record Progress'))
      expect(cbs.onPartial).toHaveBeenCalledWith(pendingUworldTask)
      fireEvent.click(screen.getByText('Complete'))
      expect(cbs.onComplete).toHaveBeenCalledWith(pendingUworldTask)
    })

    it('locked uworld renders lock badge, lock message, and no action buttons', () => {
      const topics = new Map([
        ['topic-1', { id: 'topic-1', canonicalTopicId: 'topic-1', topicTitle: 'Heart Failure', status: 'not_started' }],
      ])
      const lockedTask = { ...uworldTask, unlockCondition: 'learning_completed:topic-1' }
      const { container } = renderCard(lockedTask, {}, { topicsById: topics, canStudy: false })

      expect(screen.getByText('Locked')).toBeInTheDocument()
      expect(screen.getByText('Complete learning for Heart Failure to unlock these questions.')).toBeInTheDocument()
      expect(screen.queryByText('Start')).not.toBeInTheDocument()
      expect(screen.queryByText('Record Progress')).not.toBeInTheDocument()
      expect(screen.queryByText('Complete')).not.toBeInTheDocument()
      expect(screen.queryByText('Log Questions')).not.toBeInTheDocument()
      expect(container.firstChild).toHaveAttribute('aria-disabled', 'true')
    })

    it('locked uworld with missing prerequisite topic shows fallback message without leaking ids', () => {
      const lockedTask = { ...uworldTask, unlockCondition: 'uworld_completed:missing-topic' }
      const { container } = renderCard(lockedTask, {}, { canStudy: false })

      expect(screen.getByText("Complete this task's prerequisite first.")).toBeInTheDocument()
      expect(screen.queryByText('missing-topic')).not.toBeInTheDocument()
      expect(screen.queryByText('Start')).not.toBeInTheDocument()
      expect(container.firstChild).toHaveAttribute('aria-disabled', 'true')
    })

    it('regression: status locked with no unlockCondition stays locked with no actions', () => {
      const lockedTask = { ...baseTask, status: 'locked', isLocked: true, statusLabel: 'Locked' }
      const { container } = renderCard(lockedTask, {}, { canStudy: false })

      expect(screen.getByText('Locked')).toBeInTheDocument()
      expect(screen.queryByText('Start')).not.toBeInTheDocument()
      expect(screen.queryByText('Done')).not.toBeInTheDocument()
      expect(container.firstChild).toHaveAttribute('aria-disabled', 'true')
    })

    it('renders lock badge even when task already isLocked via status', () => {
      const topics = new Map([
        ['topic-1', { id: 'topic-1', canonicalTopicId: 'topic-1', topicTitle: 'Heart Failure', status: 'not_started' }],
      ])
      const lockedTask = {
        ...uworldTask,
        status: 'locked',
        isLocked: true,
        statusLabel: 'Locked',
        unlockCondition: 'learning_completed:topic-1',
      }
      renderCard(lockedTask, {}, { topicsById: topics, canStudy: false })
      expect(screen.getByText('Complete learning for Heart Failure to unlock these questions.')).toBeInTheDocument()
    })
  })
})
