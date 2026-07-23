// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskCard from '../TaskCard'

vi.mock('../../../../lib/api', () => ({ apiGet: vi.fn() }))

const defaultPlan = { id: 'plan-1', revision: 1 }

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
}

describe('TaskCard', () => {
  it('renders task type and status', () => {
    render(<TaskCard task={baseTask} planId="plan-1" plan={defaultPlan} todayKey="2026-07-23" />)
    expect(screen.getByText('Learning')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders Start button for pending tasks', () => {
    render(<TaskCard task={baseTask} planId="plan-1" plan={defaultPlan} todayKey="2026-07-23" />)
    expect(screen.getByText('Start')).toBeInTheDocument()
  })

  it('calls onPlay when Start is clicked', () => {
    const onPlay = vi.fn()
    render(
      <TaskCard
        task={baseTask}
        planId="plan-1"
        plan={defaultPlan}
        todayKey="2026-07-23"
        onPlay={onPlay}
      />
    )
    fireEvent.click(screen.getByText('Start'))
    expect(onPlay).toHaveBeenCalledWith(baseTask)
  })

  it('shows action buttons for in_progress tasks', () => {
    const activeTask = { ...baseTask, status: 'in_progress', isActive: true, statusLabel: 'In Progress' }
    render(<TaskCard task={activeTask} planId="plan-1" plan={defaultPlan} todayKey="2026-07-23" />)
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Partial')).toBeInTheDocument()
  })

  it('renders no action buttons for locked tasks', () => {
    const lockedTask = { ...baseTask, status: 'locked', isLocked: true, statusLabel: 'Locked' }
    render(<TaskCard task={lockedTask} planId="plan-1" plan={defaultPlan} todayKey="2026-07-23" />)
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
  })

  it('applies aria-disabled for locked tasks', () => {
    const lockedTask = { ...baseTask, status: 'locked', isLocked: true, statusLabel: 'Locked' }
    const { container } = render(
      <TaskCard task={lockedTask} planId="plan-1" plan={defaultPlan} todayKey="2026-07-23" />
    )
    expect(container.firstChild).toHaveAttribute('aria-disabled', 'true')
  })

  it('renders overdue style for overdue tasks', () => {
    const overdueTask = { ...baseTask, isOverdue: true }
    const { container } = render(
      <TaskCard task={overdueTask} planId="plan-1" plan={defaultPlan} todayKey="2026-07-23" />
    )
    expect(container.firstChild.className).toContain('overdue')
  })

  it('renders time estimate', () => {
    render(<TaskCard task={baseTask} planId="plan-1" plan={defaultPlan} todayKey="2026-07-23" />)
    expect(screen.getByText('1h')).toBeInTheDocument()
  })

  it('renders progress label', () => {
    render(<TaskCard task={baseTask} planId="plan-1" plan={defaultPlan} todayKey="2026-07-23" />)
    expect(screen.getByText('Not started')).toBeInTheDocument()
  })
})
