// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TodaySection from '../TodaySection'

vi.mock('../../../../lib/api', () => ({ apiGet: vi.fn() }))

const TODAY = new Date().toISOString().slice(0, 10)

const defaultPlan = { id: 'plan-1', revision: 1 }

const noop = vi.fn()

const mockSection = {
  key: 'learn',
  label: 'Learn',
  tasks: [
    {
      id: 'task-1',
      taskType: 'learning',
      status: 'pending',
      typeLabel: 'Learning',
      statusLabel: 'Pending',
      estimatedMinutes: 60,
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
    },
    {
      id: 'task-2',
      taskType: 'learning',
      status: 'completed',
      typeLabel: 'Learning',
      statusLabel: 'Completed',
      estimatedMinutes: 30,
      timeEstimate: '30m',
      timeActual: '25m',
      progressPercent: 100,
      progressLabel: '100%',
      isLocked: false,
      isActive: false,
      isCompleted: true,
      isTerminal: true,
      isOverdue: false,
      topicTitle: 'Heart Failure',
    },
  ],
}

describe('TodaySection', () => {
  it('renders section header with label and count', () => {
    render(
      <TodaySection
        section={mockSection}
        planId="plan-1"
        plan={defaultPlan}
        todayKey={TODAY}
        topicsById={new Map()}
        isMutating={false}
        onStart={noop}
        onComplete={noop}
        onPartial={noop}
        onRecordTime={noop}
        onRecordQuestions={noop}
        onSkip={noop}
        onStudyPomodoro={noop}
      />
    )
    expect(screen.getByText('Learn')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('renders TaskCards for each task', () => {
    render(
      <TodaySection
        section={mockSection}
        planId="plan-1"
        plan={defaultPlan}
        todayKey={TODAY}
        topicsById={new Map()}
        isMutating={false}
        onStart={noop}
        onComplete={noop}
        onPartial={noop}
        onRecordTime={noop}
        onRecordQuestions={noop}
        onSkip={noop}
        onStudyPomodoro={noop}
      />
    )
    expect(screen.getByText('Stable Angina Pectoris')).toBeInTheDocument()
    expect(screen.getByText('Heart Failure')).toBeInTheDocument()
  })
})
