// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../lib/api', () => ({ apiGet: vi.fn() }))

vi.mock('../TaskCard', () => ({
  default: function MockTaskCard({ task }) {
    return <div data-testid={`taskcard-${task.id}`}>{task.topicTitle}</div>
  },
}))

import StudyBlock from '../StudyBlock'

const defaultCallbacks = () => ({
  onStart: vi.fn(),
  onComplete: vi.fn(),
  onPartial: vi.fn(),
  onRecordTime: vi.fn(),
  onRecordQuestions: vi.fn(),
  onSkip: vi.fn(),
  onStudyPomodoro: vi.fn(),
})

const makeTask = (overrides = {}) => ({
  id: 't1',
  taskType: 'learning',
  status: 'pending',
  estimatedMinutes: 5,
  completionPercentage: 0,
  topicTitle: 'Primary survey',
  topicSection: 'Abdominal Trauma',
  planTopicId: 'tp1',
  displayOrder: 1,
  ...overrides,
})

const makeBlock = (overrides = {}) => ({
  type: 'study_block',
  studyBlockId: 'block-1',
  tasks: [
    makeTask({ id: 't1', topicTitle: 'Primary survey' }),
    makeTask({ id: 't2', topicTitle: 'Airway assessment', estimatedMinutes: 8, displayOrder: 2, planTopicId: 'tp2' }),
  ],
  totalEstimatedMinutes: 13,
  progress: { percent: 0, completed: 0, partial: 0, inProgress: 0, skipped: 0, remaining: 2 },
  primaryTask: makeTask({ id: 't1' }),
  title: 'Abdominal Trauma Study Block',
  topicNames: ['Primary survey', 'Airway assessment'],
  hasMoreTopics: false,
  topicCount: 2,
  ...overrides,
})

function renderBlock(block = makeBlock(), callbacks = {}) {
  const cbs = { ...defaultCallbacks(), ...callbacks }
  return {
    ...render(
      <StudyBlock
        block={block}
        planId="plan-1"
        plan={{ id: 'plan-1', revision: 1 }}
        todayKey="2026-07-27"
        topicsById={{}}
        sourceTitle="Step-Up to Medicine"
        isMutating={false}
        {...cbs}
      />
    ),
    cbs,
  }
}

describe('StudyBlock', () => {
  it('renders summary when collapsed', () => {
    renderBlock()
    expect(screen.getByText('Abdominal Trauma Study Block')).toBeInTheDocument()
    expect(screen.getByText(/13m/)).toBeInTheDocument()
    expect(screen.getByText(/2 topics/)).toBeInTheDocument()
  })

  it('expands to show child TaskCards', () => {
    renderBlock()
    const expandBtn = screen.getByRole('button', { name: /Expand/ })
    fireEvent.click(expandBtn)
    expect(screen.getByTestId('taskcard-t1')).toBeInTheDocument()
    expect(screen.getByTestId('taskcard-t2')).toBeInTheDocument()
  })

  it('collapses to hide child cards', () => {
    renderBlock()
    const expandBtn = screen.getByRole('button', { name: /Expand/ })
    fireEvent.click(expandBtn)
    expect(screen.getByTestId('taskcard-t1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Collapse/ }))
    expect(screen.queryByTestId('taskcard-t1')).not.toBeInTheDocument()
  })

  it('updates aria-expanded on toggle', () => {
    renderBlock()
    const btn = screen.getByRole('button', { name: /Expand/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })

  it('block pomodoro button targets primary task', () => {
    const primary = makeTask({ id: 't-primary', status: 'in_progress' })
    const block = makeBlock({ primaryTask: primary })
    const { cbs } = renderBlock(block)
    fireEvent.click(screen.getByText(/Study with Pomodoro/))
    expect(cbs.onStudyPomodoro).toHaveBeenCalledWith(primary)
  })

  it('block pomodoro calls onStudyPomodoro not onStart', () => {
    const primary = makeTask({ id: 't-p', status: 'pending' })
    const { cbs } = renderBlock(makeBlock({ primaryTask: primary }))
    fireEvent.click(screen.getByText(/Study with Pomodoro/))
    expect(cbs.onStudyPomodoro).toHaveBeenCalledTimes(1)
    expect(cbs.onStart).not.toHaveBeenCalled()
  })

  it('progress summary shows correct counts', () => {
    const block = makeBlock({
      progress: { percent: 50, completed: 1, partial: 0, inProgress: 0, skipped: 1, remaining: 1 },
    })
    renderBlock(block)
    expect(screen.getByText('1 completed \u00b7 1 skipped \u00b7 1 remaining')).toBeInTheDocument()
  })

  it('progress summary omits zero counts', () => {
    renderBlock()
    expect(screen.getByText('2 remaining')).toBeInTheDocument()
  })

  it('applies active style when child is in_progress', () => {
    const block = makeBlock({
      tasks: [
        makeTask({ id: 't1', status: 'in_progress' }),
        makeTask({ id: 't2', topicTitle: 'Airway assessment' }),
      ],
      progress: { percent: 50, completed: 0, partial: 0, inProgress: 1, skipped: 0, remaining: 1 },
    })
    const { container } = renderBlock(block)
    expect(container.firstChild.className).toContain('active')
  })

  it('shows first 2-3 topic names and +N more', () => {
    const block = makeBlock({
      topicNames: ['A', 'B', 'C'],
      hasMoreTopics: true,
      topicCount: 5,
    })
    renderBlock(block)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('shows currently studying message when in_progress', () => {
    const block = makeBlock({
      tasks: [
        makeTask({ id: 't1', status: 'in_progress', topicTitle: 'Primary survey' }),
        makeTask({ id: 't2', topicTitle: 'Airway assessment' }),
      ],
      progress: { percent: 50, completed: 0, partial: 0, inProgress: 1, skipped: 0, remaining: 1 },
    })
    renderBlock(block)
    expect(screen.getByText(/Currently studying: Primary survey/)).toBeInTheDocument()
  })

  it('no pomodoro button when primaryTask is null', () => {
    renderBlock(makeBlock({ primaryTask: null }))
    expect(screen.queryByText(/Study with Pomodoro/)).not.toBeInTheDocument()
  })
})
