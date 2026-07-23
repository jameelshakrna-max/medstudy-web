// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TodayView from '../TodayView'
import { TODAY_SECTIONS } from '../todayGrouping'

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

function renderTodayView(tasks = []) {
  return render(<TodayView planId="plan-1" tasks={tasks} plan={defaultPlan} />)
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
    expect(screen.getByText('Nothing due today')).toBeInTheDocument()
  })

  it('hides completed tasks from sections and shows all-done message', () => {
    renderTodayView([
      makeTask({ id: 't1', status: 'completed' }),
    ])
    expect(screen.queryByText('Nothing due today')).not.toBeInTheDocument()
    expect(screen.getByText('All done for today!')).toBeInTheDocument()
    expect(screen.getByText('1/1 tasks')).toBeInTheDocument()
  })
})
