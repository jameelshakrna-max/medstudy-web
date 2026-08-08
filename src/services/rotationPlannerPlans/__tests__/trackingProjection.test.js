import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveTaskStatus, buildTrackingProjection, selectTrackingPlan } from '../trackingProjection.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const NOW_ISO = '2026-01-05T12:00:00.000Z'
const TODAY_KEY = '2026-01-05'

function statusFor(overrides, contextState) {
  const task = {
    id: 't1',
    taskType: 'uworld_questions',
    taskDate: '2026-01-05',
    status: 'pending',
    targetCount: 10,
    completedCount: 0,
    unlockCondition: null,
    planQuestionGroupId: null,
    planTopicId: null,
    displayOrder: 0,
    ...overrides,
  }
  return deriveTaskStatus(task, contextState, TODAY_KEY)
}

function project(tasks, opts = {}) {
  return buildTrackingProjection({
    plan: null,
    topics: opts.topics || [],
    tasks,
    questionGroups: opts.questionGroups || [],
    topicStates: opts.topicStates || [],
    groupStates: opts.groupStates || [],
    nowIso: NOW_ISO,
    timezone: opts.timezone || 'UTC',
    windowDays: opts.windowDays ?? 14,
  })
}

describe('deriveTaskStatus', () => {
  it('maps each input to the correct status (precedence matrix)', () => {
    expect(statusFor({}, { excluded: true })).toBe('excluded')
    expect(statusFor({ status: 'completed' })).toBe('completed')
    expect(statusFor({ status: 'skipped' })).toBe('completed')
    expect(statusFor({ status: 'partial', targetCount: 10, completedCount: 5 })).toBe('partial')
    expect(statusFor({ status: 'in_progress' })).toBe('in_progress')
    expect(statusFor({ taskDate: '2026-01-04' })).toBe('overdue')
    expect(statusFor({ taskDate: '2026-01-05' })).toBe('due_today')
    expect(statusFor({ unlockCondition: 'learning_completed:topic-1' }, { remainingLearningMinutes: 100 })).toBe('locked')
    expect(statusFor({ unlockCondition: 'uworld_completed:topic-1' }, { totalUworldQuestions: 20, completedUworldQuestions: 5 })).toBe('locked')
    expect(statusFor({ unlockCondition: 'learning_group_completed:grp-1' }, { requiredLearningCompleted: false })).toBe('locked')
    expect(statusFor({ unlockCondition: 'uworld_group_completed:grp-1' }, { remainingQuestions: 10 })).toBe('locked')
    expect(statusFor({ status: 'locked', unlockCondition: 'learning_completed:topic-1' }, { remainingLearningMinutes: 0 })).toBe('ready')
    expect(statusFor({ taskDate: '2026-01-06' })).toBe('planned')
  })

  it('fails closed for unknown unlock-condition types', () => {
    expect(statusFor({ unlockCondition: 'mystery:foo' }, {})).toBe('locked')
  })

  it('treats a task with an unlock condition but no context state as locked (fail closed)', () => {
    expect(statusFor({ unlockCondition: 'learning_completed:topic-1' }, undefined)).toBe('locked')
    expect(statusFor({ unlockCondition: 'learning_group_completed:grp-1' }, undefined)).toBe('locked')
  })

  it('treats a task with no unlock condition as unlocked even without context state', () => {
    expect(statusFor({ taskDate: '2026-01-04' }, undefined)).toBe('overdue')
    expect(statusFor({ taskDate: '2026-01-05' }, undefined)).toBe('due_today')
    expect(statusFor({ taskDate: '2026-01-06' }, undefined)).toBe('planned')
  })

  it('locked supersedes overdue/due_today for pending tasks', () => {
    expect(statusFor({ taskDate: '2026-01-04', unlockCondition: 'learning_completed:topic-1' }, { remainingLearningMinutes: 100 })).toBe('locked')
    expect(statusFor({ taskDate: '2026-01-05', unlockCondition: 'learning_completed:topic-1' }, { remainingLearningMinutes: 100 })).toBe('locked')
  })
})

describe('missingLearningPrerequisites', () => {
  const topics = [
    { id: 'p1', canonicalTopicId: 'c1', sourceTopicId: 'src-1', topicTitle: 'Topic A' },
    { id: 'p2', canonicalTopicId: 'c2', sourceTopicId: 'src-2', topicTitle: 'Topic B' },
  ]
  const questionGroups = [{ id: 'g1', groupKey: 'grp-1', title: 'Group One', targetQuestions: 30, excluded: false, displayOrder: 0 }]
  const groupStates = [{ id: 'g1', key: 'grp-1', targetQuestions: 30, completedQuestions: 10, requiredLearningCompleted: false, unfinishedRequiredTopics: ['src-2', 'src-1'], excluded: false }]

  it('returns ordered readable titles for a locked learning_group_completed task', () => {
    const tasks = [{
      id: 't1', taskType: 'uworld_questions', taskDate: '2026-01-06', status: 'pending',
      targetCount: 10, completedCount: 0, unlockCondition: 'learning_group_completed:grp-1',
      planQuestionGroupId: 'g1', planTopicId: null, displayOrder: 0,
    }]
    const { schedule } = project(tasks, { topics, questionGroups, groupStates })
    expect(schedule[0].status).toBe('locked')
    expect(schedule[0].missingLearningPrerequisites).toEqual([
      { planTopicId: 'p2', canonicalTopicId: 'c2', title: 'Topic B' },
      { planTopicId: 'p1', canonicalTopicId: 'c1', title: 'Topic A' },
    ])
  })

  it('returns the topic title for a locked learning_completed task', () => {
    const tasks = [{
      id: 't2', taskType: 'uworld_questions', taskDate: '2026-01-06', status: 'pending',
      targetCount: 10, completedCount: 0, unlockCondition: 'learning_completed:c1',
      planQuestionGroupId: null, planTopicId: 'p1', displayOrder: 0,
    }]
    const topicStates = [{ planTopicId: 'p1', canonicalTopicId: 'c1', remainingLearningMinutes: 100 }]
    const { schedule } = project(tasks, { topics, topicStates })
    expect(schedule[0].status).toBe('locked')
    expect(schedule[0].missingLearningPrerequisites).toEqual([{ planTopicId: 'p1', canonicalTopicId: 'c1', title: 'Topic A' }])
  })

  it('returns the topic title for a locked uworld_completed task', () => {
    const tasks = [{
      id: 't2b', taskType: 'uworld_questions', taskDate: '2026-01-06', status: 'pending',
      targetCount: 10, completedCount: 0, unlockCondition: 'uworld_completed:c2',
      planQuestionGroupId: null, planTopicId: 'p2', displayOrder: 0,
    }]
    const topicStates = [{ planTopicId: 'p2', canonicalTopicId: 'c2', totalUworldQuestions: 20, completedUworldQuestions: 5 }]
    const { schedule } = project(tasks, { topics, topicStates })
    expect(schedule[0].status).toBe('locked')
    expect(schedule[0].missingLearningPrerequisites).toEqual([{ planTopicId: 'p2', canonicalTopicId: 'c2', title: 'Topic B' }])
  })

  it('returns an empty array for unknown unlock-condition types while staying locked', () => {
    const tasks = [{
      id: 't3', taskType: 'uworld_questions', taskDate: '2026-01-06', status: 'pending',
      targetCount: 10, completedCount: 0, unlockCondition: 'weird:whatever',
      planQuestionGroupId: null, planTopicId: null, displayOrder: 0,
    }]
    const { schedule } = project(tasks)
    expect(schedule[0].status).toBe('locked')
    expect(schedule[0].missingLearningPrerequisites).toEqual([])
  })

  it('returns an empty array for non-locked tasks', () => {
    const tasks = [{
      id: 't4', taskType: 'uworld_questions', taskDate: '2026-01-05', status: 'pending',
      targetCount: 10, completedCount: 0, unlockCondition: null,
      planQuestionGroupId: null, planTopicId: null, displayOrder: 0,
    }]
    const { schedule } = project(tasks)
    expect(schedule[0].status).toBe('due_today')
    expect(schedule[0].missingLearningPrerequisites).toEqual([])
  })

  it('is null-safe when topics or groups are missing', () => {
    const unknownTopic = [{
      id: 't5', taskType: 'uworld_questions', taskDate: '2026-01-06', status: 'pending',
      targetCount: 10, completedCount: 0, unlockCondition: 'learning_completed:no-such-topic',
      planQuestionGroupId: null, planTopicId: null, displayOrder: 0,
    }]
    expect(project(unknownTopic).schedule[0].missingLearningPrerequisites).toEqual([])

    const unknownGroup = [{
      id: 't6', taskType: 'uworld_questions', taskDate: '2026-01-06', status: 'pending',
      targetCount: 10, completedCount: 0, unlockCondition: 'learning_group_completed:no-such-group',
      planQuestionGroupId: 'g1', planTopicId: null, displayOrder: 0,
    }]
    expect(project(unknownGroup, { questionGroups, groupStates }).schedule[0].missingLearningPrerequisites).toEqual([])

    const unresolvedSources = [{
      id: 't7', taskType: 'uworld_questions', taskDate: '2026-01-06', status: 'pending',
      targetCount: 10, completedCount: 0, unlockCondition: 'learning_group_completed:grp-1',
      planQuestionGroupId: 'g1', planTopicId: null, displayOrder: 0,
    }]
    const staleGroupStates = [{ id: 'g1', key: 'grp-1', requiredLearningCompleted: false, unfinishedRequiredTopics: ['src-99'] }]
    expect(project(unresolvedSources, { questionGroups, groupStates: staleGroupStates }).schedule[0].missingLearningPrerequisites).toEqual([])
  })
})

describe('nextBlock', () => {
  it('returns null when no candidate tasks exist', () => {
    const tasks = [
      { id: 'c1', taskType: 'uworld_questions', taskDate: '2026-01-05', status: 'completed', targetCount: 10, completedCount: 10, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
      { id: 'e1', taskType: 'uworld_questions', taskDate: '2026-01-05', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: 'g-ex', planTopicId: null, displayOrder: 0 },
      { id: 's1', taskType: 'uworld_questions', taskDate: '2026-01-04', status: 'skipped', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
      { id: 'f1', taskType: 'flashcard_review', taskDate: '2026-01-04', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
      { id: 'l1', taskType: 'learning', taskDate: '2026-01-04', status: 'pending', targetCount: 0, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
      { id: 'm1', taskType: 'mixed_review', taskDate: '2026-01-04', status: 'pending', targetCount: 0, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
    ]
    const groupStates = [{ id: 'g-ex', key: 'g-ex', excluded: true }]
    const { nextBlock } = project(tasks, { groupStates })
    expect(nextBlock).toBeNull()
  })

  it('orders candidates by status priority', () => {
    const topics = [
      { id: 'p1', canonicalTopicId: 'c1', sourceTopicId: 's1', topicTitle: 'Topic A' },
      { id: 'p2', canonicalTopicId: 'c2', sourceTopicId: 's2', topicTitle: 'Topic B' },
    ]
    const topicStates = [
      { planTopicId: 'p1', remainingLearningMinutes: 0 },
      { planTopicId: 'p2', remainingLearningMinutes: 100 },
    ]
    const tasks = [
      { id: 't-planned', taskType: 'uworld_questions', taskDate: '2026-01-07', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
      { id: 't-locked', taskType: 'uworld_questions', taskDate: '2026-01-06', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: 'learning_completed:c2', planQuestionGroupId: null, planTopicId: 'p2', displayOrder: 0 },
      { id: 't-ready', taskType: 'uworld_questions', taskDate: '2026-01-05', status: 'locked', targetCount: 10, completedCount: 0, unlockCondition: 'learning_completed:c1', planQuestionGroupId: null, planTopicId: 'p1', displayOrder: 0 },
      { id: 't-inprogress', taskType: 'uworld_questions', taskDate: '2026-01-06', status: 'in_progress', targetCount: 10, completedCount: 3, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
      { id: 't-duetoday', taskType: 'uworld_questions', taskDate: '2026-01-05', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
      { id: 't-overdue', taskType: 'uworld_questions', taskDate: '2026-01-04', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
    ]
    const { nextBlock } = project(tasks, { topics, topicStates })
    expect(nextBlock.status).toBe('overdue')
    expect(nextBlock.taskId).toBe('t-overdue')
  })

  it('breaks ties by earliest plannedDate, then displayOrder, then taskId', () => {
    const tasks = [
      { id: 'z', taskType: 'uworld_questions', taskDate: '2026-01-05', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 5 },
      { id: 'a', taskType: 'uworld_questions', taskDate: '2026-01-04', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 9 },
      { id: 'b', taskType: 'uworld_questions', taskDate: '2026-01-04', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 1 },
      { id: 'c', taskType: 'uworld_questions', taskDate: '2026-01-04', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 1 },
    ]
    const { nextBlock } = project(tasks)
    expect(nextBlock.taskId).toBe('b')
  })

  it('dedupes by planQuestionGroupId and reports group-level counts', () => {
    const group = { id: 'g1', groupKey: 'grp-1', title: 'Group One', targetQuestions: 30, excluded: false, displayOrder: 0 }
    const groupState = { id: 'g1', key: 'grp-1', targetQuestions: 30, completedQuestions: 10, requiredLearningCompleted: true, unfinishedRequiredTopics: [], excluded: false }
    const tasks = [
      { id: 't1', taskType: 'uworld_questions', taskDate: '2026-01-05', status: 'pending', targetCount: 15, completedCount: 0, unlockCondition: null, planQuestionGroupId: 'g1', planTopicId: null, displayOrder: 0 },
      { id: 't2', taskType: 'uworld_questions', taskDate: '2026-01-05', status: 'pending', targetCount: 15, completedCount: 0, unlockCondition: null, planQuestionGroupId: 'g1', planTopicId: null, displayOrder: 0 },
      { id: 't3', taskType: 'uworld_questions', taskDate: '2026-01-06', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
    ]
    const { nextBlock } = project(tasks, { questionGroups: [group], groupStates: [groupState] })
    expect(nextBlock).not.toBeNull()
    expect(nextBlock.taskId).toBe('t1')
    expect(nextBlock.planQuestionGroupId).toBe('g1')
    expect(nextBlock.groupKey).toBe('grp-1')
    expect(nextBlock.groupTitle).toBe('Group One')
    expect(nextBlock.targetQuestions).toBe(30)
    expect(nextBlock.completedQuestions).toBe(10)
    expect(nextBlock.remainingQuestions).toBe(20)
    expect(nextBlock.status).toBe('due_today')
  })
})

describe('schedule and incorrectReview', () => {
  it('keeps one row per real task row and filters to the window', () => {
    const tasks = [
      { id: 'a1', taskType: 'uworld_questions', taskDate: '2026-01-06', targetCount: 10, completedCount: 2, status: 'pending', unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 5 },
      { id: 'b1', taskType: 'uworld_questions', taskDate: '2026-01-05', targetCount: 10, completedCount: 0, status: 'pending', unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 9 },
      { id: 'c1', taskType: 'uworld_questions', taskDate: '2026-01-05', targetCount: 10, completedCount: 0, status: 'pending', unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 1 },
      { id: 'out-past', taskType: 'uworld_questions', taskDate: '2026-01-01', targetCount: 10, completedCount: 0, status: 'pending', unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
      { id: 'out-future', taskType: 'uworld_questions', taskDate: '2026-01-20', targetCount: 10, completedCount: 0, status: 'pending', unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
    ]
    const { schedule, window } = project(tasks, { windowDays: 14 })
    expect(window.startDate).toBe('2026-01-05')
    expect(window.endDate).toBe('2026-01-18')
    expect(window.windowDays).toBe(14)
    expect(schedule.map(s => s.taskId)).toEqual(['c1', 'b1', 'a1'])
    expect(schedule[0].targetQuestions).toBe(10)
    expect(schedule[0].completedQuestions).toBe(0)
    expect(schedule[0].remainingQuestions).toBe(10)
    expect(schedule[2].remainingQuestions).toBe(8)
  })

  it('preserves multiple rows sharing a planQuestionGroupId', () => {
    const group = { id: 'g1', groupKey: 'grp-1', title: 'Group One', targetQuestions: 30, excluded: false, displayOrder: 0 }
    const groupState = { id: 'g1', key: 'grp-1', targetQuestions: 30, completedQuestions: 0, requiredLearningCompleted: true, unfinishedRequiredTopics: [], excluded: false }
    const tasks = [
      { id: 'g-t1', taskType: 'uworld_questions', taskDate: '2026-01-05', targetCount: 15, completedCount: 0, status: 'pending', unlockCondition: null, planQuestionGroupId: 'g1', planTopicId: null, displayOrder: 0 },
      { id: 'g-t2', taskType: 'uworld_questions', taskDate: '2026-01-05', targetCount: 15, completedCount: 0, status: 'pending', unlockCondition: null, planQuestionGroupId: 'g1', planTopicId: null, displayOrder: 0 },
      { id: 'g-t3', taskType: 'uworld_questions', taskDate: '2026-01-06', targetCount: 15, completedCount: 0, status: 'pending', unlockCondition: null, planQuestionGroupId: 'g1', planTopicId: null, displayOrder: 0 },
    ]
    const { schedule } = project(tasks, { questionGroups: [group], groupStates: [groupState] })
    expect(schedule.map(s => s.taskId)).toEqual(['g-t1', 'g-t2', 'g-t3'])
    expect(schedule[0].planQuestionGroupId).toBe('g1')
    expect(schedule[0].groupKey).toBe('grp-1')
    expect(schedule[0].groupTitle).toBe('Group One')
  })

  it('keeps incorrectReview distinct from schedule', () => {
    const tasks = [
      { id: 'r1', taskType: 'incorrect_review', taskDate: '2026-01-05', targetCount: 5, completedCount: 1, status: 'pending', unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
      { id: 'u1', taskType: 'uworld_questions', taskDate: '2026-01-05', targetCount: 10, completedCount: 0, status: 'pending', unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
    ]
    const { schedule, incorrectReview } = project(tasks)
    expect(schedule.map(s => s.taskId)).toEqual(['u1'])
    expect(incorrectReview.map(s => s.taskId)).toEqual(['r1'])
  })

  it('reports isPlanned and mayMove from plannedDate vs today', () => {
    const tasks = [
      { id: 't1', taskType: 'uworld_questions', taskDate: '2026-01-07', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: 'learning_completed:c1', planQuestionGroupId: null, planTopicId: 'p1', displayOrder: 0 },
      { id: 't2', taskType: 'uworld_questions', taskDate: '2026-01-05', status: 'pending', targetCount: 10, completedCount: 0, unlockCondition: null, planQuestionGroupId: null, planTopicId: null, displayOrder: 0 },
    ]
    const topics = [{ id: 'p1', canonicalTopicId: 'c1', sourceTopicId: 's1', topicTitle: 'Topic A' }]
    const topicStates = [{ planTopicId: 'p1', canonicalTopicId: 'c1', remainingLearningMinutes: 100 }]
    const { schedule, nextBlock } = project(tasks, { topics, topicStates })
    expect(schedule[0].isPlanned).toBe(false)
    expect(schedule[0].mayMove).toBe(false)
    expect(schedule[1].isPlanned).toBe(true)
    expect(schedule[1].mayMove).toBe(true)
    expect(schedule[1].plannedDate).toBe('2026-01-07')
    expect(nextBlock).not.toBeNull()
    expect(nextBlock.status).toBe('due_today')
    expect(nextBlock.isPlanned).toBe(false)
    expect(nextBlock.mayMove).toBe(false)
  })

  it('keeps plannedDate and flags for a future locked nextBlock candidate', () => {
    const tasks = [{
      id: 't1', taskType: 'uworld_questions', taskDate: '2026-01-07', status: 'pending',
      targetCount: 10, completedCount: 0, unlockCondition: 'learning_completed:c1',
      planQuestionGroupId: null, planTopicId: 'p1', displayOrder: 0,
    }]
    const topics = [{ id: 'p1', canonicalTopicId: 'c1', sourceTopicId: 's1', topicTitle: 'Topic A' }]
    const topicStates = [{ planTopicId: 'p1', canonicalTopicId: 'c1', remainingLearningMinutes: 100 }]
    const { nextBlock } = project(tasks, { topics, topicStates })
    expect(nextBlock).not.toBeNull()
    expect(nextBlock.status).toBe('locked')
    expect(nextBlock.plannedDate).toBe('2026-01-07')
    expect(nextBlock.isPlanned).toBe(true)
    expect(nextBlock.mayMove).toBe(true)
  })
})

describe('selectTrackingPlan', () => {
  const summaries = [
    { id: 'p-completed', status: 'completed', updatedAt: '2026-01-10 00:00:00' },
    { id: 'p-draft-2', status: 'draft', updatedAt: '2026-01-05 00:00:00' },
    { id: 'p-paused', status: 'paused', updatedAt: '2026-01-08 00:00:00' },
    { id: 'p-draft-1', status: 'draft', updatedAt: '2026-01-09 00:00:00' },
    { id: 'p-active', status: 'active', updatedAt: '2026-01-01 00:00:00' },
  ]

  it('prefers active over draft/paused/completed', () => {
    const selected = selectTrackingPlan(summaries)
    expect(selected.selectionReason).toBe('active')
    expect(selected.plan.id).toBe('p-active')
  })

  it('falls back to the newest draft by updatedAt', () => {
    const noActive = summaries.filter(s => s.status !== 'active')
    const selected = selectTrackingPlan(noActive)
    expect(selected.selectionReason).toBe('newest_draft')
    expect(selected.plan.id).toBe('p-draft-1')
  })

  it('falls back to the newest paused by updatedAt', () => {
    const noActiveDraft = summaries.filter(s => s.status !== 'active' && s.status !== 'draft')
    const selected = selectTrackingPlan(noActiveDraft)
    expect(selected.selectionReason).toBe('newest_paused')
    expect(selected.plan.id).toBe('p-paused')
  })

  it('falls back to the newest completed by updatedAt', () => {
    const onlyCompleted = summaries.filter(s => s.status === 'completed')
    const selected = selectTrackingPlan(onlyCompleted)
    expect(selected.selectionReason).toBe('newest_completed')
    expect(selected.plan.id).toBe('p-completed')
  })

  it('breaks updatedAt ties by id', () => {
    const tied = [
      { id: 'b', status: 'draft', updatedAt: '2026-01-05 00:00:00' },
      { id: 'a', status: 'draft', updatedAt: '2026-01-05 00:00:00' },
    ]
    expect(selectTrackingPlan(tied).plan.id).toBe('a')
  })

  it('returns null plan and reason for an empty list', () => {
    expect(selectTrackingPlan([])).toEqual({ plan: null, selectionReason: null })
  })
})

describe('no scheduler coupling', () => {
  it('does not import or reference the scheduler or recalculation', () => {
    const source = readFileSync(resolve(__dirname, '../trackingProjection.js'), 'utf8')
    expect(source).not.toContain('buildRotationSchedule')
    expect(source).not.toContain('recalculation')
  })
})
