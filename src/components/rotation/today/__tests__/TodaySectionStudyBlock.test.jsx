// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TodaySection from '../TodaySection'

vi.mock('../../../../lib/api', () => ({ apiGet: vi.fn() }))

vi.mock('../TaskCard', () => ({
  default: function MockTaskCard({ task }) {
    return <div data-testid={`task-${task.id}`}>{task.topicTitle || task.id}</div>
  },
}))

vi.mock('../StudyBlock', () => ({
  default: function MockStudyBlock({ block }) {
    return (
      <div data-testid={`block-${block.studyBlockId}`}>
        <span data-testid="block-title">{block.title}</span>
        <span data-testid="block-count">{block.topicCount}</span>
        <span data-testid="block-minutes">{block.totalEstimatedMinutes}</span>
        {block.tasks.map(t => (
          <span key={t.id} data-testid={`block-child-${t.id}`}>{t.topicTitle}</span>
        ))}
      </div>
    )
  },
}))

const TODAY = new Date().toISOString().slice(0, 10)
const defaultPlan = { id: 'plan-1', revision: 1 }
const noop = vi.fn()

function makeTask(overrides = {}) {
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
    topicTitle: 'Test Topic',
    topicSource: 'test-source',
    topicSection: 'Test Section',
    ...overrides,
  }
}

function renderSection(tasks, sectionOverrides = {}) {
  const section = {
    key: 'learn',
    label: 'Learn',
    tasks,
    ...sectionOverrides,
  }
  return render(
    <TodaySection
      section={section}
      planId="plan-1"
      plan={defaultPlan}
      todayKey={TODAY}
      topicsById={new Map()}
      sourceTitle="Test Source"
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
}

describe('TodaySection with StudyBlock grouping', () => {
  it('renders individual TaskCards for tasks without studyBlockId', () => {
    renderSection([
      makeTask({ id: 't1', studyBlockId: null }),
      makeTask({ id: 't2', studyBlockId: null }),
    ])
    expect(screen.getByTestId('task-t1')).toBeInTheDocument()
    expect(screen.getByTestId('task-t2')).toBeInTheDocument()
  })

  it('groups 2+ learning tasks with same studyBlockId into a StudyBlock', () => {
    renderSection([
      makeTask({ id: 't1', studyBlockId: 'block-1', topicTitle: 'Primary survey' }),
      makeTask({ id: 't2', studyBlockId: 'block-1', topicTitle: 'Airway assessment' }),
    ])
    expect(screen.getByTestId('block-block-1')).toBeInTheDocument()
    expect(screen.queryByTestId('task-t1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('task-t2')).not.toBeInTheDocument()
    expect(screen.getByTestId('block-child-t1')).toBeInTheDocument()
    expect(screen.getByTestId('block-child-t2')).toBeInTheDocument()
  })

  it('renders singleton studyBlockId as TaskCard', () => {
    renderSection([
      makeTask({ id: 't1', studyBlockId: 'block-1' }),
    ])
    expect(screen.getByTestId('task-t1')).toBeInTheDocument()
    expect(screen.queryByTestId('block-block-1')).not.toBeInTheDocument()
  })

  it('renders non-learning tasks as TaskCards even with studyBlockId', () => {
    renderSection([
      makeTask({ id: 't1', taskType: 'uworld_questions', studyBlockId: 'block-1' }),
      makeTask({ id: 't2', taskType: 'uworld_questions', studyBlockId: 'block-1' }),
    ])
    expect(screen.getByTestId('task-t1')).toBeInTheDocument()
    expect(screen.getByTestId('task-t2')).toBeInTheDocument()
    expect(screen.queryByTestId('block-block-1')).not.toBeInTheDocument()
  })

  it('renders two different study blocks separately', () => {
    renderSection([
      makeTask({ id: 't1', studyBlockId: 'block-a', topicTitle: 'Topic A1' }),
      makeTask({ id: 't2', studyBlockId: 'block-a', topicTitle: 'Topic A2' }),
      makeTask({ id: 't3', studyBlockId: 'block-b', topicTitle: 'Topic B1' }),
      makeTask({ id: 't4', studyBlockId: 'block-b', topicTitle: 'Topic B2' }),
    ])
    expect(screen.getByTestId('block-block-a')).toBeInTheDocument()
    expect(screen.getByTestId('block-block-b')).toBeInTheDocument()
  })

  it('preserves task order — block at position of first child', () => {
    const { container } = renderSection([
      makeTask({ id: 't1', studyBlockId: null, topicTitle: 'Solo task' }),
      makeTask({ id: 't2', studyBlockId: 'block-1', topicTitle: 'Block topic 1' }),
      makeTask({ id: 't3', studyBlockId: 'block-1', topicTitle: 'Block topic 2' }),
    ])
    const taskList = container.querySelector('[class*="taskList"]')
    const children = taskList.children
    expect(children[0]).toHaveAttribute('data-testid', 'task-t1')
    expect(children[1]).toHaveAttribute('data-testid', 'block-block-1')
  })

  it('every task is represented exactly once', () => {
    renderSection([
      makeTask({ id: 't1', studyBlockId: 'block-1' }),
      makeTask({ id: 't2', studyBlockId: 'block-1' }),
      makeTask({ id: 't3', studyBlockId: null }),
      makeTask({ id: 't4', taskType: 'uworld_questions', studyBlockId: 'block-2' }),
      makeTask({ id: 't5', taskType: 'uworld_questions', studyBlockId: 'block-2' }),
    ])
    const block = screen.getByTestId('block-block-1')
    expect(block).toBeInTheDocument()
    expect(screen.getByTestId('block-child-t1')).toBeInTheDocument()
    expect(screen.getByTestId('block-child-t2')).toBeInTheDocument()
    expect(screen.getByTestId('task-t3')).toBeInTheDocument()
    expect(screen.getByTestId('task-t4')).toBeInTheDocument()
    expect(screen.getByTestId('task-t5')).toBeInTheDocument()
    expect(screen.queryByTestId('block-block-2')).not.toBeInTheDocument()
  })

  it('old task with studyBlockId=null remains TaskCard', () => {
    renderSection([
      makeTask({ id: 't1', studyBlockId: undefined }),
    ])
    expect(screen.getByTestId('task-t1')).toBeInTheDocument()
    expect(screen.queryByTestId('block-')).not.toBeInTheDocument()
  })

  it('passes correct props to StudyBlock', () => {
    const onPomodoro = vi.fn()
    render(
      <TodaySection
        section={{
          key: 'learn',
          label: 'Learn',
          tasks: [
            makeTask({ id: 't1', studyBlockId: 'block-1', topicTitle: 'Topic A' }),
            makeTask({ id: 't2', studyBlockId: 'block-1', topicTitle: 'Topic B' }),
          ],
        }}
        planId="plan-1"
        plan={defaultPlan}
        todayKey={TODAY}
        topicsById={new Map()}
        sourceTitle="Test Source"
        isMutating={true}
        onStart={noop}
        onComplete={noop}
        onPartial={noop}
        onRecordTime={noop}
        onRecordQuestions={noop}
        onSkip={noop}
        onStudyPomodoro={onPomodoro}
      />
    )
    const block = screen.getByTestId('block-block-1')
    expect(block).toBeInTheDocument()
  })
})
