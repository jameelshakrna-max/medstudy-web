import { describe, it, expect } from 'vitest'
import {
  TERMINAL_TASK_STATUSES,
  isTerminalTaskStatus,
  selectNextTask,
  describeTaskPrerequisite,
} from '../nextTask'

const task = (overrides = {}) => ({
  id: 'task-1',
  planTopicId: 't1',
  taskDate: '2026-01-05',
  taskType: 'learning',
  status: 'pending',
  displayOrder: 1,
  estimatedMinutes: 60,
  ...overrides,
})

describe('TERMINAL_TASK_STATUSES / isTerminalTaskStatus', () => {
  it('exposes the terminal statuses', () => {
    expect(TERMINAL_TASK_STATUSES).toEqual(['completed', 'partial', 'skipped'])
  })

  it('returns true for terminal statuses and false otherwise', () => {
    expect(isTerminalTaskStatus('completed')).toBe(true)
    expect(isTerminalTaskStatus('partial')).toBe(true)
    expect(isTerminalTaskStatus('skipped')).toBe(true)
    expect(isTerminalTaskStatus('pending')).toBe(false)
    expect(isTerminalTaskStatus('locked')).toBe(false)
    expect(isTerminalTaskStatus('in_progress')).toBe(false)
    expect(isTerminalTaskStatus(undefined)).toBe(false)
  })
})

describe('selectNextTask', () => {
  it('excludes terminal tasks', () => {
    const tasks = [
      task({ id: 'a', status: 'completed', taskDate: '2026-01-05' }),
      task({ id: 'b', status: 'pending', taskDate: '2026-01-05' }),
    ]
    expect(selectNextTask(tasks, '2026-01-05').id).toBe('b')
  })

  it('excludes past tasks but keeps tasks without a date', () => {
    const tasks = [
      task({ id: 'past', taskDate: '2026-01-03' }),
      task({ id: 'today', taskDate: '2026-01-05' }),
      task({ id: 'nodate', taskDate: null }),
    ]
    const next = selectNextTask(tasks, '2026-01-05')
    expect(next.id).toBe('today')
  })

  it('sorts by taskDate ascending', () => {
    const tasks = [
      task({ id: 'later', taskDate: '2026-01-07' }),
      task({ id: 'earlier', taskDate: '2026-01-05' }),
      task({ id: 'middle', taskDate: '2026-01-06' }),
    ]
    expect(selectNextTask(tasks, '2026-01-01').id).toBe('earlier')
  })

  it('sorts by displayOrder within the same date', () => {
    const tasks = [
      task({ id: 'b', displayOrder: 2 }),
      task({ id: 'a', displayOrder: 1 }),
    ]
    expect(selectNextTask(tasks, '2026-01-01').id).toBe('a')
  })

  it('breaks ties by id with localeCompare', () => {
    const tasks = [
      task({ id: 'z' }),
      task({ id: 'a' }),
    ]
    expect(selectNextTask(tasks, '2026-01-01').id).toBe('a')
  })

  it('sorts tasks with missing taskDate last', () => {
    const tasks = [
      task({ id: 'nodate', taskDate: null }),
      task({ id: 'dated', taskDate: '2026-01-05' }),
    ]
    expect(selectNextTask(tasks, '2026-01-01').id).toBe('dated')
  })

  it('returns null when no task qualifies', () => {
    expect(selectNextTask([], '2026-01-05')).toBeNull()
    expect(selectNextTask([task({ status: 'completed' })], '2026-01-05')).toBeNull()
    expect(selectNextTask([task({ taskDate: '2026-01-03' })], '2026-01-05')).toBeNull()
    expect(selectNextTask(undefined, '2026-01-05')).toBeNull()
  })
})

describe('describeTaskPrerequisite', () => {
  const topics = [
    { id: 't1', canonicalTopicId: 'src::cardio.acs', topicTitle: 'ACS' },
    { id: 't2', canonicalTopicId: 'src::cardio.sa', topicTitle: 'Stable Angina' },
  ]

  it('returns null when there is no unlockCondition', () => {
    expect(describeTaskPrerequisite(task(), topics)).toBeNull()
    expect(describeTaskPrerequisite(task({ unlockCondition: null }), topics)).toBeNull()
  })

  it('describes a found learning prerequisite', () => {
    const result = describeTaskPrerequisite(
      task({ unlockCondition: 'learning_completed:src::cardio.acs' }),
      topics
    )
    expect(result).toBe('Complete learning for ACS first.')
  })

  it('resolves the human-readable topic title for learning', () => {
    const result = describeTaskPrerequisite(
      task({ unlockCondition: 'learning_completed:src::cardio.sa' }),
      topics
    )
    expect(result).toBe('Complete learning for Stable Angina first.')
    expect(result).not.toContain('src::cardio.sa')
  })

  it('falls back without leaking an internal ID when the learning topic is missing', () => {
    const result = describeTaskPrerequisite(
      task({ unlockCondition: 'learning_completed:src::missing' }),
      topics
    )
    expect(result).toBe("Complete this task's prerequisite first.")
    expect(result).not.toContain('missing')
    expect(result).not.toContain('::')
  })

  it('describes a found UWorld prerequisite', () => {
    const result = describeTaskPrerequisite(
      task({ unlockCondition: 'uworld_completed:src::cardio.sa' }),
      topics
    )
    expect(result).toBe('Complete the UWorld questions for Stable Angina first.')
    expect(result).not.toContain('src::cardio.sa')
  })

  it('falls back without leaking an internal ID when the UWorld topic is missing', () => {
    const result = describeTaskPrerequisite(
      task({ unlockCondition: 'uworld_completed:src::missing' }),
      topics
    )
    expect(result).toBe("Complete this task's prerequisite first.")
    expect(result).not.toContain('missing')
    expect(result).not.toContain('::')
  })

  it('falls back for an unknown prefix', () => {
    const result = describeTaskPrerequisite(task({ unlockCondition: 'something_else:x' }), topics)
    expect(result).toBe("Complete this task's prerequisite first.")
  })

  it('fails closed for a malformed condition', () => {
    expect(describeTaskPrerequisite(task({ unlockCondition: 'learning_completed' }), topics)).toBe(
      "Complete this task's prerequisite first."
    )
    expect(describeTaskPrerequisite(task({ unlockCondition: ':' }), topics)).toBe(
      "Complete this task's prerequisite first."
    )
  })
})
