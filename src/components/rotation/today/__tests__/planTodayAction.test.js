// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getPlanTodayAction, PLAN_TODAY_ACTION_LABELS } from '../planTodayAction'

const TODAY = '2026-08-13'

function makeTask(overrides = {}) {
  return {
    id: 't1',
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
  }
}

function makeTopic(overrides = {}) {
  return {
    id: 'topic-1',
    canonicalTopicId: 'cardiology.stable-angina-pectoris',
    topicTitle: 'Stable Angina',
    status: 'not_started',
    ...overrides,
  }
}

const baseArgs = {
  plan: { id: 'plan-1', status: 'active', startDate: '2026-08-01', endDate: '2026-09-30' },
  todayKey: TODAY,
  tasks: [makeTask()],
  topicsById: new Map([['topic-1', makeTopic()]]),
}

describe('getPlanTodayAction', () => {
  it('returns start for a pending unlocked startable task', () => {
    const result = getPlanTodayAction(baseArgs)
    expect(result).toEqual({ action: 'start', task: expect.objectContaining({ id: 't1', status: 'pending' }) })
  })

  it('returns resume for the hydrated paused session task even when pending tasks exist', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      tasks: [
        makeTask({ id: 'active', status: 'in_progress', displayOrder: 0 }),
        makeTask({ id: 'pending', status: 'pending', displayOrder: 1 }),
      ],
      pausedSession: { taskId: 'active', planId: 'plan-1' },
    })
    expect(result).toEqual({ action: 'resume', task: expect.objectContaining({ id: 'active' }) })
  })

  it('does not produce resume for an in_progress task with no paused session', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      tasks: [
        makeTask({ id: 'active', status: 'in_progress', displayOrder: 0 }),
        makeTask({ id: 'pending', status: 'pending', displayOrder: 1 }),
      ],
    })
    expect(result).toEqual({ action: 'start', task: expect.objectContaining({ id: 'pending' }) })
  })

  it('does not produce resume when only an in_progress task exists and no session', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      tasks: [makeTask({ id: 'active', status: 'in_progress' })],
    })
    expect(result).toBeNull()
  })

  it('ignores a paused session from another plan', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      tasks: [
        makeTask({ id: 'active', status: 'in_progress', displayOrder: 0 }),
        makeTask({ id: 'pending', status: 'pending', displayOrder: 1 }),
      ],
      pausedSession: { taskId: 'active', planId: 'other-plan' },
    })
    expect(result).toEqual({ action: 'start', task: expect.objectContaining({ id: 'pending' }) })
  })

  it('ignores a paused session whose task is not part of today\'s work', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      tasks: [makeTask({ id: 'active', status: 'in_progress' })],
      pausedSession: { taskId: 'ghost-task', planId: 'plan-1' },
    })
    expect(result).toBeNull()
  })

  it('does not resume a terminal session task', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      tasks: [makeTask({ id: 'done', status: 'completed' })],
      pausedSession: { taskId: 'done', planId: 'plan-1' },
    })
    expect(result).toBeNull()
  })

  it('picks the earliest displayOrder among startable tasks', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      tasks: [
        makeTask({ id: 'b', displayOrder: 2 }),
        makeTask({ id: 'a', displayOrder: 1 }),
      ],
    })
    expect(result.action).toBe('start')
    expect(result.task.id).toBe('a')
  })

  it('skips locked tasks and still starts the next unlocked one', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      tasks: [
        makeTask({ id: 'locked', status: 'locked', displayOrder: 1 }),
        makeTask({ id: 'open', status: 'pending', displayOrder: 2 }),
      ],
    })
    expect(result.action).toBe('start')
    expect(result.task.id).toBe('open')
  })

  it('skips prereq-locked pending tasks (unlockCondition) using the lock context', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      tasks: [
        makeTask({ id: 'group', taskType: 'uworld_questions', status: 'pending', unlockCondition: 'learning_group_completed:cardiology', displayOrder: 1 }),
        makeTask({ id: 'open', status: 'pending', displayOrder: 2 }),
      ],
      lockContext: {
        questionGroupStates: [
          { groupKey: 'cardiology', title: 'Cardiology', completedQuestions: 5, targetQuestions: 40 },
        ],
      },
    })
    expect(result.action).toBe('start')
    expect(result.task.id).toBe('open')
  })

  it('returns null when every task is locked via unlockCondition even though the plan is active', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      tasks: [
        makeTask({ id: 't1', status: 'pending', unlockCondition: 'learning_completed:cardiology.stable-angina-pectoris' }),
      ],
      topicsById: new Map(),
    })
    expect(result).toBeNull()
  })

  it('returns null when the plan is not active', () => {
    for (const status of ['draft', 'paused', 'completed']) {
      expect(getPlanTodayAction({ ...baseArgs, plan: { ...baseArgs.plan, status } })).toBeNull()
    }
  })

  it('returns null for a paused plan even when startable tasks exist', () => {
    const result = getPlanTodayAction({
      ...baseArgs,
      plan: { ...baseArgs.plan, status: 'paused' },
      pausedSession: { taskId: 't1', planId: 'plan-1' },
    })
    expect(result).toBeNull()
  })

  it('returns null before the plan start date', () => {
    expect(getPlanTodayAction({ ...baseArgs, todayKey: '2026-07-01' })).toBeNull()
  })

  it('returns null when there is no work today (only future tasks)', () => {
    expect(getPlanTodayAction({
      ...baseArgs,
      tasks: [makeTask({ taskDate: '2099-01-10', status: 'locked' })],
    })).toBeNull()
  })

  it('returns null when today is empty (no tasks)', () => {
    expect(getPlanTodayAction({ ...baseArgs, tasks: [] })).toBeNull()
  })

  it('returns null when all of today is done', () => {
    expect(getPlanTodayAction({
      ...baseArgs,
      tasks: [makeTask({ status: 'completed' })],
    })).toBeNull()
  })

  it('returns null when everything is locked', () => {
    expect(getPlanTodayAction({
      ...baseArgs,
      tasks: [makeTask({ status: 'locked' })],
    })).toBeNull()
  })

  it('does not treat flashcard reviews as a startable plan action', () => {
    expect(getPlanTodayAction({
      ...baseArgs,
      tasks: [makeTask({ taskType: 'flashcard_review', status: 'pending' })],
    })).toBeNull()
  })

  it('handles missing args safely', () => {
    expect(getPlanTodayAction()).toBeNull()
    expect(getPlanTodayAction({ plan: null, todayKey: TODAY, tasks: [] })).toBeNull()
  })
})

describe('PLAN_TODAY_ACTION_LABELS', () => {
  it('exposes start and resume labels', () => {
    expect(PLAN_TODAY_ACTION_LABELS.start).toBe("Start Today's Plan")
    expect(PLAN_TODAY_ACTION_LABELS.resume).toBe("Resume Today's Plan")
  })
})
