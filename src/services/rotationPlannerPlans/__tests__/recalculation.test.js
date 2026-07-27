import { describe, it, expect } from 'vitest'
import { buildReservedMinutesMap, deriveActualTopicStates, buildRecalculationResult } from '../recalculation.js'

// ─── buildReservedMinutesMap ───
describe('buildReservedMinutesMap', () => {
  const dateRange = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08']

  it('returns empty object when no terminal tasks', () => {
    const tasks = [
      { status: 'pending', task_date: '2026-01-05', estimated_minutes: 30 },
      { status: 'in_progress', task_date: '2026-01-06', estimated_minutes: 45 },
    ]
    const result = buildReservedMinutesMap(tasks, dateRange)
    expect(result).toEqual({})
  })

  it('sums actual_minutes for completed/skipped tasks per date', () => {
    const tasks = [
      { status: 'completed', task_date: '2026-01-05', actual_minutes: 30, estimated_minutes: 50 },
      { status: 'skipped', task_date: '2026-01-05', actual_minutes: 10, estimated_minutes: 20 },
      { status: 'completed', task_date: '2026-01-06', actual_minutes: 45, estimated_minutes: 60 },
    ]
    const result = buildReservedMinutesMap(tasks, dateRange)
    expect(result).toEqual({
      '2026-01-05': 40,
      '2026-01-06': 45,
    })
  })

  it('falls back to estimated_minutes when actual_minutes is null', () => {
    const tasks = [
      { status: 'completed', task_date: '2026-01-05', actual_minutes: null, estimated_minutes: 50 },
      { status: 'partial', task_date: '2026-01-06', actual_minutes: null, estimated_minutes: 35 },
    ]
    const result = buildReservedMinutesMap(tasks, dateRange)
    expect(result).toEqual({
      '2026-01-05': 50,
      '2026-01-06': 35,
    })
  })

  it('ignores non-terminal tasks (pending, in_progress)', () => {
    const tasks = [
      { status: 'pending', task_date: '2026-01-05', actual_minutes: 10, estimated_minutes: 50 },
      { status: 'in_progress', task_date: '2026-01-05', actual_minutes: 20, estimated_minutes: 40 },
      { status: 'completed', task_date: '2026-01-05', actual_minutes: 30, estimated_minutes: 60 },
    ]
    const result = buildReservedMinutesMap(tasks, dateRange)
    expect(result).toEqual({ '2026-01-05': 30 })
  })

  it('only includes dates in the provided dateRange', () => {
    const tasks = [
      { status: 'completed', task_date: '2026-01-05', actual_minutes: 30, estimated_minutes: 50 },
      { status: 'completed', task_date: '2026-01-20', actual_minutes: 40, estimated_minutes: 60 },
    ]
    const result = buildReservedMinutesMap(tasks, dateRange)
    expect(result).toEqual({ '2026-01-05': 30 })
    expect(result['2026-01-20']).toBeUndefined()
  })
})

// ─── deriveActualTopicStates ───
describe('deriveActualTopicStates', () => {
  function makeTopic(overrides = {}) {
    return {
      id: 'topic-1',
      canonical_topic_id: 'cardiology.stable-angina',
      normalized_topic_id: 'src::cardiology.stable-angina',
      learning_completed_at: null,
      questions_unlocked_at: null,
      completed_uworld_questions: 0,
      incorrect_questions_remaining: 5,
      personalized_learning_minutes: 45,
      base_learning_minutes: 45,
      total_uworld_questions: 20,
      status: 'not_started',
      ...overrides,
    }
  }

  function makeTask(overrides = {}) {
    return {
      plan_topic_id: 'topic-1',
      task_type: 'learning',
      status: 'pending',
      actual_minutes: null,
      estimated_minutes: 30,
      completed_count: null,
      completed_at: null,
      completed_on: null,
      incorrect_count: 0,
      completion_percentage: null,
      ...overrides,
    }
  }

  const AS_OF = { asOfDate: '2026-01-07' }

  it('returns topic states from DB rows', () => {
    const topics = [makeTopic()]
    const result = deriveActualTopicStates(topics, [], AS_OF)
    expect(result).toHaveLength(1)
    expect(result[0].planTopicId).toBe('topic-1')
    expect(result[0].canonicalTopicId).toBe('cardiology.stable-angina')
    expect(result[0].normalizedTopicId).toBe('src::cardiology.stable-angina')
    expect(result[0].completedUworldQuestions).toBe(0)
  })

  it('sets learningCompletedAt from completed_on of completed tasks', () => {
    const topics = [makeTopic()]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', completed_on: '2026-01-05', estimated_minutes: 45 }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].learningCompletedAt).toBe('2026-01-05')
    expect(result[0].status).toBe('uworld_in_progress')
  })

  it('computes completedUworldQuestions from scratch via task history', () => {
    const topics = [makeTopic({ completed_uworld_questions: 5 })]
    const tasks = [
      makeTask({ task_type: 'uworld_questions', status: 'completed', completed_count: 10 }),
      makeTask({ task_type: 'uworld_questions', status: 'completed', completed_count: 3 }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].completedUworldQuestions).toBe(13)
  })

  it('computes incorrectQuestionsRemaining from scratch', () => {
    const topics = [makeTopic({ incorrect_questions_remaining: 10 })]
    const tasks = [
      makeTask({ task_type: 'uworld_questions', status: 'completed', incorrect_count: 7 }),
      makeTask({ task_type: 'incorrect_review', status: 'completed', completed_count: 4 }),
      makeTask({ task_type: 'incorrect_review', status: 'completed', completed_count: 3 }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].incorrectQuestionsRemaining).toBe(0)
  })

  it('preserves questionsUnlockedAt when already set', () => {
    const topics = [makeTopic({ questions_unlocked_at: '2026-01-01' })]
    const tasks = [
      makeTask({ task_type: 'uworld_questions', status: 'completed', completed_count: 5 }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].questionsUnlockedAt).toBe('2026-01-01')
  })

  it('sets questionsUnlockedAt when learning complete and UWorld > 0', () => {
    const topics = [makeTopic({
      personalized_learning_minutes: 30,
      completed_uworld_questions: 0,
      questions_unlocked_at: null,
      learning_completed_at: null,
      total_uworld_questions: 10,
    })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 30, completed_on: '2026-01-05' }),
      makeTask({ task_type: 'uworld_questions', status: 'completed', completed_count: 5 }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].questionsUnlockedAt).toBe('2026-01-05')
  })

  it('completedEquivalentMinutes counts only learning/consolidation task types', () => {
    const topics = [makeTopic({
      personalized_learning_minutes: 60,
      total_uworld_questions: 20,
    })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 20, completion_percentage: null, completed_on: '2026-01-05' }),
      makeTask({ task_type: 'uworld_questions', status: 'completed', estimated_minutes: 30, completed_count: 10, completed_on: '2026-01-06' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].completedUworldQuestions).toBe(10)
    expect(result[0].status).toBe('learning')
    expect(result[0].learningCompletedAt).toBeNull()
  })

  it('consolidation task type contributes to completedEquivalentMinutes', () => {
    const topics = [makeTopic({
      personalized_learning_minutes: 45,
      total_uworld_questions: 10,
    })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 20, completed_on: '2026-01-05' }),
      makeTask({ task_type: 'consolidation', status: 'completed', estimated_minutes: 30, completed_on: '2026-01-06' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].status).toBe('uworld_in_progress')
    expect(result[0].learningCompletedAt).toBe('2026-01-06')
  })

  it('partial learning still contributes to completedEquivalentMinutes via fraction', () => {
    const topics = [makeTopic({
      personalized_learning_minutes: 60,
      total_uworld_questions: 0,
    })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'partial', estimated_minutes: 40, completion_percentage: 50, completed_on: '2026-01-05' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].status).toBe('learning')
  })
})

// ─── buildRecalculationResult ───
describe('buildRecalculationResult', () => {
  it('returns compact DTO with planId, revision, recalculationDate, replayed', () => {
    const recalculation = {
      recalculationDate: '2026-01-07',
      tasks: [{ isNew: true, status: 'pending' }],
      topicStates: [],
      feasibility: { feasible: true },
    }
    const plan = { id: 'plan-1', revision: 3 }
    const result = buildRecalculationResult(recalculation, plan, false)
    expect(result.planId).toBe('plan-1')
    expect(result.revision).toBe(3)
    expect(result.recalculationDate).toBe('2026-01-07')
    expect(result.replayed).toBe(false)
  })

  it('counts created/preserved/modified tasks correctly', () => {
    const recalculation = {
      recalculationDate: '2026-01-07',
      tasks: [
        { isNew: true, status: 'pending' },
        { isNew: true, status: 'pending' },
        { isNew: false, status: 'completed' },
        { isNew: false, status: 'pending' },
      ],
      topicStates: [],
      feasibility: { feasible: true },
    }
    const plan = { id: 'plan-1', revision: 1 }
    const result = buildRecalculationResult(recalculation, plan, false)
    expect(result.tasks.created).toBe(2)
    expect(result.tasks.preserved).toBe(1)
    expect(result.tasks.modified).toBe(1)
  })

  it('maps topicStates to compact format', () => {
    const recalculation = {
      recalculationDate: '2026-01-07',
      tasks: [],
      topicStates: [
        {
          canonicalTopicId: 'cardiology.stable-angina',
          status: 'in_progress',
          learningCompletedAt: '2026-01-05',
          totalUworldQuestions: 20,
          completedUworldQuestions: 8,
        },
        {
          canonicalTopicId: 'cardiology.acs',
          status: 'not_started',
          learningCompletedAt: null,
          totalUworldQuestions: 15,
          completedUworldQuestions: 0,
        },
      ],
      feasibility: { feasible: true },
    }
    const plan = { id: 'plan-1', revision: 1 }
    const result = buildRecalculationResult(recalculation, plan, false)
    expect(result.topicStates).toHaveLength(2)
    expect(result.topicStates[0]).toEqual({
      id: 'cardiology.stable-angina',
      status: 'in_progress',
      learningComplete: true,
      projectedQuestionsRemaining: 12,
    })
    expect(result.topicStates[1]).toEqual({
      id: 'cardiology.acs',
      status: 'not_started',
      learningComplete: false,
      projectedQuestionsRemaining: 15,
    })
  })
})
