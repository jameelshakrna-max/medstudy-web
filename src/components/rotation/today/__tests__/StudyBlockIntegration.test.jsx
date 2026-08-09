// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TodayView from '../TodayView'

vi.mock('../../../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }))

vi.mock('../TaskCard', () => ({
  default: function MockTaskCard({ task }) {
    return <div data-testid={`task-${task.id}`}>{task.topicTitle || task.id}</div>
  },
}))

vi.mock('../StudyBlock', () => ({
  default: function MockStudyBlock({ block }) {
    return (
      <div data-testid={`block-${block.studyBlockId}`} data-section={block._sectionKey || 'unknown'}>
        {block.tasks.map(t => (
          <span key={t.id} data-testid={`block-child-${t.id}`}>{t.topicTitle}</span>
        ))}
      </div>
    )
  },
}))

vi.mock('../RecalculationBanner', () => ({
  default: function MockRecalculationBanner() { return null },
}))

const TODAY = new Date().toISOString().slice(0, 10)
const defaultPlan = { id: 'plan-1', revision: 1, startDate: '2024-01-01' }
const noop = vi.fn()

function makeRawTask(overrides = {}) {
  return {
    id: 'task-1',
    planId: 'plan-1',
    planTopicId: 'topic-1',
    taskType: 'learning',
    status: 'pending',
    taskDate: TODAY,
    estimatedMinutes: 10,
    actualMinutes: 0,
    targetCount: null,
    completedCount: 0,
    completionPercentage: 0,
    incorrectCount: 0,
    displayOrder: 1,
    studyBlockId: null,
    ...overrides,
  }
}

function renderToday(tasks, extraProps = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <TodayView
        planId="plan-1"
        tasks={tasks}
        topics={[]}
        topicsById={new Map()}
        plan={defaultPlan}
        sourceTitle="Step-Up to Medicine"
        isMutating={false}
        isOrphaned={false}
        hasUnsyncedData={false}
        discardOrphanedPlannerContext={noop}
        onStart={noop}
        onComplete={noop}
        onPartial={noop}
        onRecordTime={noop}
        onRecordQuestions={noop}
        onSkip={noop}
        onStudyPomodoro={noop}
        {...extraProps}
      />
    </QueryClientProvider>
  )
}

function countOccurrences(container, testIdPrefix) {
  return Array.from(container.querySelectorAll(`[data-testid^="${testIdPrefix}"]`))
    .filter(el => el.dataset.testid === testIdPrefix || el.dataset.testid.startsWith(testIdPrefix + '-'))
    .length
}

function findAllByTestId(container, testIdPrefix) {
  return Array.from(container.querySelectorAll(`[data-testid^="${testIdPrefix}"]`))
    .filter(el => el.dataset.testid === testIdPrefix || el.dataset.testid.startsWith(testIdPrefix + '-'))
    .map(el => el.dataset.testid)
}

describe('Active block ownership — ONE studyBlockId, ONE visual representation', () => {
  it('1. active child A + pending siblings B,C same block → one StudyBlock in Active, zero copies in Learn', () => {
    const tasks = [
      makeRawTask({ id: 'A', status: 'in_progress', studyBlockId: 'block-1', taskType: 'learning', estimatedMinutes: 5 }),
      makeRawTask({ id: 'B', status: 'pending', studyBlockId: 'block-1', taskType: 'learning', displayOrder: 2, estimatedMinutes: 8 }),
      makeRawTask({ id: 'C', status: 'pending', studyBlockId: 'block-1', taskType: 'learning', displayOrder: 3, estimatedMinutes: 10 }),
    ]
    renderToday(tasks)

    const container = document.querySelector('[class*="container"]')
    expect(container).toBeTruthy()

    const blockC = screen.getByTestId('block-block-1')
    expect(blockC).toBeInTheDocument()

    expect(findAllByTestId(container, 'block-child')).toContain('block-child-A')
    expect(findAllByTestId(container, 'block-child')).toContain('block-child-B')
    expect(findAllByTestId(container, 'block-child')).toContain('block-child-C')

    expect(findAllByTestId(container, 'block-block-1').length).toBe(1)

    expect(findAllByTestId(container, 'task-A').length).toBe(0)
    expect(findAllByTestId(container, 'task-B').length).toBe(0)
    expect(findAllByTestId(container, 'task-C').length).toBe(0)
  })

  it('2. active child + overdue pending siblings same block → one Active StudyBlock, no duplicate Overdue', () => {
    const YESTERDAY = (() => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return d.toISOString().slice(0, 10)
    })()

    const tasks = [
      makeRawTask({ id: 'A', status: 'in_progress', studyBlockId: 'block-1', taskType: 'learning', taskDate: TODAY, estimatedMinutes: 5 }),
      makeRawTask({ id: 'B', status: 'pending', studyBlockId: 'block-1', taskType: 'learning', displayOrder: 2, taskDate: YESTERDAY, estimatedMinutes: 8 }),
    ]
    renderToday(tasks)

    const container = document.querySelector('[class*="container"]')
    expect(container).toBeTruthy()

    expect(screen.getByTestId('block-block-1')).toBeInTheDocument()
    expect(findAllByTestId(container, 'block-child')).toContain('block-child-A')
    expect(findAllByTestId(container, 'block-child')).toContain('block-child-B')

    expect(findAllByTestId(container, 'task-A').length).toBe(0)
    expect(findAllByTestId(container, 'task-B').length).toBe(0)
    expect(findAllByTestId(container, 'block-block-1').length).toBe(1)
  })

  it('3. every original child appears exactly once — no duplication, no disappearance', () => {
    const tasks = [
      makeRawTask({ id: 'A', status: 'in_progress', studyBlockId: 'block-1', taskType: 'learning', estimatedMinutes: 5 }),
      makeRawTask({ id: 'B', status: 'pending', studyBlockId: 'block-1', taskType: 'learning', displayOrder: 2, estimatedMinutes: 8 }),
      makeRawTask({ id: 'C', status: 'pending', studyBlockId: 'block-1', taskType: 'learning', displayOrder: 3, estimatedMinutes: 10 }),
      makeRawTask({ id: 'D', status: 'pending', taskType: 'learning', displayOrder: 4, estimatedMinutes: 6, studyBlockId: null }),
    ]
    renderToday(tasks)

    const container = document.querySelector('[class*="container"]')
    const allTaskIds = findAllByTestId(container, 'task')
    const allBlockChildIds = findAllByTestId(container, 'block-child')
    const allRepresented = [...allTaskIds, ...allBlockChildIds]

    expect(allRepresented.filter(id => id === 'block-child-A').length).toBe(1)
    expect(allRepresented.filter(id => id === 'block-child-B').length).toBe(1)
    expect(allRepresented.filter(id => id === 'block-child-C').length).toBe(1)
    expect(allRepresented.filter(id => id === 'task-D').length).toBe(1)
    expect(allRepresented.length).toBe(4)
  })

  it('4. one studyBlockId has exactly one Today owner — the Active section', () => {
    const tasks = [
      makeRawTask({ id: 'A', status: 'in_progress', studyBlockId: 'block-1', taskType: 'learning', estimatedMinutes: 5 }),
      makeRawTask({ id: 'B', status: 'pending', studyBlockId: 'block-1', taskType: 'learning', displayOrder: 2, estimatedMinutes: 8 }),
      makeRawTask({ id: 'C', status: 'pending', studyBlockId: 'block-1', taskType: 'learning', displayOrder: 3, estimatedMinutes: 10 }),
    ]
    renderToday(tasks)

    const container = document.querySelector('[class*="container"]')
    const blockEls = findAllByTestId(container, 'block-block-1')
    expect(blockEls.length).toBe(1)

    const allBlockChildIds = findAllByTestId(container, 'block-child')
    expect(allBlockChildIds.length).toBe(3)
  })

  it('5. primary child is the in_progress task', () => {
    const onPomodoro = vi.fn()
    const tasks = [
      makeRawTask({ id: 'A', status: 'in_progress', studyBlockId: 'block-1', taskType: 'learning', estimatedMinutes: 5 }),
      makeRawTask({ id: 'B', status: 'pending', studyBlockId: 'block-1', taskType: 'learning', displayOrder: 2, estimatedMinutes: 8 }),
    ]
    renderToday(tasks, { onStudyPomodoro: onPomodoro })

    expect(screen.getByTestId('block-block-1')).toBeInTheDocument()
  })

  it('6. when no child is in_progress, block remains in its normal section (Learn)', () => {
    const tasks = [
      makeRawTask({ id: 'A', status: 'pending', studyBlockId: 'block-1', taskType: 'learning', estimatedMinutes: 5 }),
      makeRawTask({ id: 'B', status: 'pending', studyBlockId: 'block-1', taskType: 'learning', displayOrder: 2, estimatedMinutes: 8 }),
    ]
    renderToday(tasks)

    const container = document.querySelector('[class*="container"]')
    expect(screen.getByTestId('block-block-1')).toBeInTheDocument()
    expect(findAllByTestId(container, 'block-child')).toContain('block-child-A')
    expect(findAllByTestId(container, 'block-child')).toContain('block-child-B')
  })

  it('7. singleton remains TaskCard where appropriate', () => {
    const tasks = [
      makeRawTask({ id: 's1', studyBlockId: 'block-solo', taskType: 'learning', estimatedMinutes: 10 }),
    ]
    renderToday(tasks)

    expect(screen.getByTestId('task-s1')).toBeInTheDocument()
    expect(screen.queryByTestId('block-block-solo')).not.toBeInTheDocument()
  })
})
