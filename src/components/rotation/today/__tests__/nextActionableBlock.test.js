import { describe, it, expect } from 'vitest'
import { getNextActionableBlock } from '../nextActionableBlock'

const TOPICS_BY_ID = new Map([
  ['topic-a', { id: 'topic-a', topicTitle: 'Heart Failure' }],
])

const TASK = (overrides = {}) => ({
  id: 't1',
  planTopicId: 'topic-a',
  taskDate: '2026-08-14',
  status: 'pending',
  displayOrder: 1,
  taskType: 'learning',
  estimatedMinutes: 90,
  targetCount: null,
  ...overrides,
})

function run(tasks, todayKey = '2026-08-13') {
  return getNextActionableBlock({ tasks, todayKey, topicsById: TOPICS_BY_ID })
}

describe('getNextActionableBlock', () => {
  it('returns null when there are no tasks', () => {
    expect(run([])).toBeNull()
    expect(run(null)).toBeNull()
  })

  it('chooses the earliest actionable block', () => {
    const result = run([
      TASK({ id: 'later', taskDate: '2026-08-16' }),
      TASK({ id: 'earliest', taskDate: '2026-08-14' }),
      TASK({ id: 'middle', taskDate: '2026-08-15' }),
    ])
    expect(result.taskId).toBe('earliest')
    expect(result.dateKey).toBe('2026-08-14')
  })

  it('includes a block scheduled today when it is eligible', () => {
    const result = run([
      TASK({ id: 'later', taskDate: '2026-08-15' }),
      TASK({ id: 'today', taskDate: '2026-08-13' }),
    ])
    expect(result.taskId).toBe('today')
    expect(result.dateKey).toBe('2026-08-13')
  })

  it('ignores completed blocks', () => {
    const result = run([
      TASK({ id: 'done', taskDate: '2026-08-13', status: 'completed' }),
      TASK({ id: 'next', taskDate: '2026-08-14' }),
    ])
    expect(result.taskId).toBe('next')
  })

  it('ignores individually locked and non-startable blocks', () => {
    const result = run([
      TASK({ id: 'locked', taskDate: '2026-08-13', status: 'locked' }),
      TASK({ id: 'skipped', taskDate: '2026-08-13', status: 'skipped' }),
      TASK({ id: 'partial', taskDate: '2026-08-13', status: 'partial' }),
      TASK({ id: 'startable', taskDate: '2026-08-15' }),
    ])
    expect(result.taskId).toBe('startable')
  })

  it('treats an in-progress block as actionable', () => {
    const result = run([TASK({ id: 'active', taskDate: '2026-08-13', status: 'in_progress' })])
    expect(result.taskId).toBe('active')
  })

  it('uses schedule order (displayOrder) as the deterministic tie-breaker', () => {
    const result = run([
      TASK({ id: 'second', taskDate: '2026-08-14', displayOrder: 5 }),
      TASK({ id: 'first', taskDate: '2026-08-14', displayOrder: 1 }),
    ])
    expect(result.taskId).toBe('first')
  })

  it('returns null when no eligible block exists', () => {
    expect(run([
      TASK({ taskDate: '2026-08-12' }),
      TASK({ status: 'completed' }),
      TASK({ status: 'locked' }),
    ])).toBeNull()
  })

  it('ignores tasks without a scheduled date', () => {
    const result = run([
      TASK({ id: 'nodate', taskDate: null }),
      TASK({ id: 'real', taskDate: '2026-08-14' }),
    ])
    expect(result.taskId).toBe('real')
  })

  it('handles month boundaries with local date keys, never UTC slicing', () => {
    const result = getNextActionableBlock({
      tasks: [
        TASK({ id: 'sep-2', taskDate: '2026-09-02' }),
        TASK({ id: 'sep-1', taskDate: '2026-09-01' }),
        TASK({ id: 'aug-31', taskDate: '2026-08-31' }),
      ],
      todayKey: '2026-08-31',
      topicsById: TOPICS_BY_ID,
    })
    expect(result.taskId).toBe('aug-31')
    expect(result.dateKey).toBe('2026-08-31')

    const next = getNextActionableBlock({
      tasks: [TASK({ id: 'sep-1', taskDate: '2026-09-01' })],
      todayKey: '2026-08-31',
      topicsById: TOPICS_BY_ID,
    })
    expect(next.taskId).toBe('sep-1')
    expect(next.dateKey).toBe('2026-09-01')
  })

  it('returns only real available display fields', () => {
    const result = run([
      TASK({ id: 'learn', taskDate: '2026-08-13', estimatedMinutes: 120, targetCount: null }),
    ])
    expect(result).toEqual({
      taskId: 'learn',
      title: 'Heart Failure',
      dateKey: '2026-08-13',
      typeLabel: 'Learning',
      mode: null,
      provider: null,
      estimatedMinutes: 120,
      questionCount: null,
    })
  })

  it('reports the question count for UWorld-style blocks', () => {
    const result = run([
      TASK({ id: 'uw', taskType: 'uworld_questions', targetCount: 30 }),
    ])
    expect(result.questionCount).toBe(30)
    expect(result.typeLabel).toBe('UWorld Questions')
  })
})
