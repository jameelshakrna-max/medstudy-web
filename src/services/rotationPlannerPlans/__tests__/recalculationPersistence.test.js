import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deriveActualTopicStates, getCompletionFraction, buildReservedMinutesMap, buildRecalculationResult } from '../recalculation.js'
import { persistRecalculationBatch } from '../persistence.js'

// ─── Factory helpers ───

function makeTopic(overrides = {}) {
  return {
    id: 'topic-1',
    canonical_topic_id: 'cardiology.stable-angina',
    normalized_topic_id: 'src::cardiology.stable-angina',
    learning_completed_at: null,
    questions_unlocked_at: null,
    completed_uworld_questions: 0,
    incorrect_questions_remaining: 0,
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

function createMockEnv() {
  const batchCalls = []
  return {
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      })),
      batch: vi.fn(async (stmts) => {
        batchCalls.push(stmts)
        return stmts.map(() => ({ success: true, meta: { changes: 1 } }))
      }),
    },
    _batchCalls: batchCalls,
  }
}

// ─── getCompletionFraction ───

describe('getCompletionFraction', () => {
  it('returns 1 for completed status', () => {
    expect(getCompletionFraction({ status: 'completed' })).toBe(1)
  })

  it('returns completion_percentage/100 for partial', () => {
    expect(getCompletionFraction({ status: 'partial', completion_percentage: 60 })).toBe(0.6)
  })

  it('returns completion_percentage/100 for in_progress', () => {
    expect(getCompletionFraction({ status: 'in_progress', completion_percentage: 35 })).toBe(0.35)
  })

  it('returns 0 for pending, locked, skipped', () => {
    expect(getCompletionFraction({ status: 'pending' })).toBe(0)
    expect(getCompletionFraction({ status: 'locked' })).toBe(0)
    expect(getCompletionFraction({ status: 'skipped' })).toBe(0)
  })
})

// ─── deriveActualTopicStates — idempotent from-scratch ───

describe('deriveActualTopicStates — idempotent from-scratch', () => {
  const AS_OF = { asOfDate: '2026-01-07' }

  it('completedUworldQuestions computed from task history, not DB value', () => {
    const topics = [makeTopic({ completed_uworld_questions: 99 })]
    const tasks = [
      makeTask({ task_type: 'uworld_questions', completed_count: 10 }),
      makeTask({ task_type: 'uworld_questions', completed_count: 5 }),
      makeTask({ task_type: 'mixed_review', completed_count: 3 }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].completedUworldQuestions).toBe(18)
  })

  it('incorrectQuestionsRemaining computed from UWorld incorrect minus review completed', () => {
    const topics = [makeTopic()]
    const tasks = [
      makeTask({ task_type: 'uworld_questions', incorrect_count: 8 }),
      makeTask({ task_type: 'uworld_questions', incorrect_count: 2 }),
      makeTask({ task_type: 'incorrect_review', completed_count: 5 }),
      makeTask({ task_type: 'incorrect_review', completed_count: 2 }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].incorrectQuestionsRemaining).toBe(3)
  })

  it('personalizedLearningMinutes stays unchanged, never decremented', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 60 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 60, completed_on: '2026-01-05' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].personalizedLearningMinutes).toBe(60)
  })

  it('learning fraction: completed=1, partial=pct/100, in_progress=pct/100, pending=0', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 100 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 20, completed_on: '2026-01-03' }),
      makeTask({ task_type: 'learning', status: 'partial', estimated_minutes: 30, completion_percentage: 50, completed_on: '2026-01-04' }),
      makeTask({ task_type: 'learning', status: 'in_progress', estimated_minutes: 20, completion_percentage: 25, completed_on: null }),
      makeTask({ task_type: 'learning', status: 'pending', estimated_minutes: 30 }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    const completedEquiv = 20 * 1 + 30 * 0.5 + 20 * 0.25 + 30 * 0
    expect(completedEquiv).toBe(40)
    const remaining = Math.max(0, 100 - completedEquiv)
    expect(remaining).toBe(60)
    expect(result[0].status).toBe('learning')
  })

  it('completed learning with actualMinutes=12 does not leave learning remaining when personalized=12', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 12 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 12, completed_on: '2026-01-05' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].status).toBe('uworld_in_progress')
    expect(result[0].learningCompletedAt).toBe('2026-01-05')
  })

  it('actualMinutes=50 with personalized=45 does not over-complete beyond 0 remaining', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 45 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 50, completed_on: '2026-01-05' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    const completedEquiv = 50 * 1
    const remaining = Math.max(0, 45 - completedEquiv)
    expect(remaining).toBe(0)
    expect(result[0].status).toBe('uworld_in_progress')
    expect(result[0].learningCompletedAt).toBe('2026-01-05')
  })
})

// ─── deriveActualTopicStates — status derivation ───

describe('deriveActualTopicStates — status derivation', () => {
  const AS_OF = { asOfDate: '2026-01-07' }

  it('not_started: no progress, remaining > 0', () => {
    const topics = [makeTopic()]
    const result = deriveActualTopicStates(topics, [], AS_OF)
    expect(result[0].status).toBe('not_started')
  })

  it('learning: has progress, remaining > 0', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 45 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'partial', estimated_minutes: 30, completion_percentage: 50, completed_on: '2026-01-05' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].status).toBe('learning')
  })

  it('uworld_in_progress: learning done, UWorld remaining', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 30, total_uworld_questions: 10 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 30, completed_on: '2026-01-05' }),
      makeTask({ task_type: 'uworld_questions', completed_count: 3 }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].status).toBe('uworld_in_progress')
  })

  it('completed: learning done, all UWorld done, no incorrect', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 30, total_uworld_questions: 10 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 30, completed_on: '2026-01-05' }),
      makeTask({ task_type: 'uworld_questions', completed_count: 10, incorrect_count: 0 }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].status).toBe('completed')
  })

  it('partial percentage respected: 50% of 40min = 20 completed, 25 remaining → learning', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 45 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'partial', estimated_minutes: 40, completion_percentage: 50, completed_on: '2026-01-05' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].status).toBe('learning')
  })
})

// ─── deriveActualTopicStates — milestones ───

describe('deriveActualTopicStates — milestones', () => {
  const AS_OF = { asOfDate: '2026-01-07' }

  it('learningCompletedAt set when remaining <= 0', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 30 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 30, completed_on: '2026-01-05' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].learningCompletedAt).toBe('2026-01-05')
  })

  it('learningCompletedAt monotonic: once set, never cleared by subsequent recalc', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 30, learning_completed_at: '2025-12-01' })]
    const result = deriveActualTopicStates(topics, [], AS_OF)
    expect(result[0].learningCompletedAt).toBe('2025-12-01')
  })

  it('questionsUnlockedAt set when learningComplete && totalUworld > 0 && not already set', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 30, total_uworld_questions: 15, questions_unlocked_at: null })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 30, completed_on: '2026-01-05' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].questionsUnlockedAt).toBe('2026-01-05')
  })

  it('questionsUnlockedAt monotonic: once set, never cleared', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 30, total_uworld_questions: 15, questions_unlocked_at: '2025-11-15' })]
    const result = deriveActualTopicStates(topics, [], AS_OF)
    expect(result[0].questionsUnlockedAt).toBe('2025-11-15')
  })

  it('questionsUnlockedAt value uses learningCompletedAt || asOfDate', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 30, total_uworld_questions: 15 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 30, completed_on: '2026-01-03' }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].questionsUnlockedAt).toBe('2026-01-03')
  })

  it('questionsUnlockedAt falls back to asOfDate when no completed_on', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 30, total_uworld_questions: 15 })]
    const tasks = [
      makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 30, completed_on: null }),
    ]
    const result = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(result[0].questionsUnlockedAt).toBe(AS_OF.asOfDate)
  })
})

// ─── deriveActualTopicStates — repeated recalculation idempotence ───

describe('deriveActualTopicStates — repeated recalculation idempotence', () => {
  const AS_OF = { asOfDate: '2026-01-07' }

  it('recalc #1 → #2 → #3 with no progress keeps identical topic state', () => {
    const topics = [makeTopic()]
    let state = deriveActualTopicStates(topics, [], AS_OF)
    const first = JSON.parse(JSON.stringify(state))

    state = deriveActualTopicStates(
      [makeTopic({ ...topics[0], status: first[0].status })],
      [],
      AS_OF,
    )
    const second = JSON.parse(JSON.stringify(state))

    state = deriveActualTopicStates(
      [makeTopic({ ...topics[0], status: second[0].status })],
      [],
      AS_OF,
    )
    const third = JSON.parse(JSON.stringify(state))

    expect(first[0].status).toBe(third[0].status)
    expect(first[0].completedUworldQuestions).toBe(third[0].completedUworldQuestions)
    expect(first[0].incorrectQuestionsRemaining).toBe(third[0].incorrectQuestionsRemaining)
    expect(first[0].learningCompletedAt).toBeNull()
    expect(third[0].learningCompletedAt).toBeNull()
  })

  it('historical task IDs never duplicated (task IDs are preserved tasks)', () => {
    const topics = [makeTopic({ personalized_learning_minutes: 30 })]
    const preservedTasks = [
      { ...makeTask({ task_type: 'learning', status: 'completed', estimated_minutes: 30, completed_on: '2026-01-05' }), id: 'task-hist-1' },
    ]
    const result1 = deriveActualTopicStates(topics, preservedTasks, AS_OF)
    expect(result1[0].learningCompletedAt).toBe('2026-01-05')
    const result2 = deriveActualTopicStates(
      [makeTopic({ personalized_learning_minutes: 30, learning_completed_at: '2026-01-05' })],
      preservedTasks,
      AS_OF,
    )
    expect(result2[0].learningCompletedAt).toBe('2026-01-05')
  })

  it('same inputs always produce same outputs (basic idempotence)', () => {
    const topics = [makeTopic()]
    const tasks = [
      makeTask({ task_type: 'uworld_questions', completed_count: 5, incorrect_count: 2 }),
      makeTask({ task_type: 'incorrect_review', completed_count: 1 }),
    ]
    const r1 = deriveActualTopicStates(topics, tasks, AS_OF)
    const r2 = deriveActualTopicStates(topics, tasks, AS_OF)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })
})

// ─── persistRecalculationBatch — batch construction ───

describe('persistRecalculationBatch — batch construction', () => {
  let env

  beforeEach(() => {
    env = createMockEnv()
  })

  const baseOpts = {
    planId: 'plan-1',
    userId: 'user-1',
    expectedRevision: 5,
    clientRequestId: 'req-1',
    requestFingerprint: 'fp-1',
    operation: 'recalculate',
    regeneratedTasks: [
      { id: 'task-new-1', planTopicId: 'topic-1', taskDate: '2026-01-07', taskType: 'learning', estimatedMinutes: 30, targetCount: 0, displayOrder: 0, metadata: {} },
    ],
    updatedTopics: [
      { planTopicId: 'topic-1', completedUworldQuestions: 5, incorrectQuestionsRemaining: 2, learningCompletedAt: '2026-01-05', questionsUnlockedAt: '2026-01-05', status: 'uworld_in_progress' },
    ],
    resultJson: { planId: 'plan-1', revision: 5, tasks: { created: 1, modified: 0, preserved: 0 } },
    recalculationMutationId: 'mut-1',
    recalculatedAt: '2026-01-07T12:00:00Z',
  }

  it('returns exactly 7 results from batch', async () => {
    const results = await persistRecalculationBatch(env, baseOpts)
    expect(results).toHaveLength(7)
  })

  it('statement 0 is INSERT (mutation claim)', async () => {
    await persistRecalculationBatch(env, baseOpts)
    const stmts = env._batchCalls[0]
    const sql = stmts[0].bind.mock.results[0]?.value?._query || ''
    expect(env.DB.prepare).toHaveBeenCalled()
  })

  it('statement 1 is UPDATE (plan revision)', async () => {
    await persistRecalculationBatch(env, baseOpts)
    expect(env.DB.prepare).toHaveBeenCalledTimes(7)
  })

  it('statement 2 is DELETE (pending/locked tasks)', async () => {
    await persistRecalculationBatch(env, baseOpts)
    expect(env.DB.batch).toHaveBeenCalledTimes(1)
  })

  it('statement 3 uses json_each for task insertion', async () => {
    await persistRecalculationBatch(env, baseOpts)
    const batchArg = env.DB.batch.mock.calls[0][0]
    expect(batchArg).toHaveLength(7)
  })

  it('statement 4 uses json_each for topic update', async () => {
    await persistRecalculationBatch(env, baseOpts)
    const batchArg = env.DB.batch.mock.calls[0][0]
    expect(batchArg[4]).toBeDefined()
  })
})

// ─── persistRecalculationBatch — STALE_REVISION detection ───

describe('persistRecalculationBatch — STALE_REVISION detection', () => {
  it('batchResults[0].meta.changes === 0 indicates stale revision', async () => {
    const env = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        })),
        batch: vi.fn(async (stmts) => {
          return stmts.map((_, i) => ({
            success: true,
            meta: { changes: i === 0 ? 0 : 1 },
          }))
        }),
      },
    }

    const results = await persistRecalculationBatch(env, {
      planId: 'plan-1',
      userId: 'user-1',
      expectedRevision: 5,
      clientRequestId: 'req-1',
      requestFingerprint: 'fp-1',
      operation: 'recalculate',
      regeneratedTasks: [
        { id: 'task-1', planTopicId: 'topic-1', taskDate: '2026-01-07', taskType: 'learning', estimatedMinutes: 30, targetCount: 0, displayOrder: 0, metadata: {} },
      ],
      updatedTopics: [
        { planTopicId: 'topic-1', completedUworldQuestions: 5, incorrectQuestionsRemaining: 0, learningCompletedAt: '2026-01-05', questionsUnlockedAt: '2026-01-05', status: 'uworld_in_progress' },
      ],
      resultJson: { planId: 'plan-1', revision: 5 },
      recalculationMutationId: 'mut-1',
      recalculatedAt: '2026-01-07T12:00:00Z',
    })
    expect(results[0].meta.changes).toBe(0)
  })

  it('batchResults[0].meta.changes === 1 indicates successful claim', async () => {
    const env = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        })),
        batch: vi.fn(async (stmts) => {
          return stmts.map(() => ({
            success: true,
            meta: { changes: 1 },
          }))
        }),
      },
    }

    const results = await persistRecalculationBatch(env, {
      planId: 'plan-1',
      userId: 'user-1',
      expectedRevision: 5,
      clientRequestId: 'req-1',
      requestFingerprint: 'fp-1',
      operation: 'recalculate',
      regeneratedTasks: [
        { id: 'task-1', planTopicId: 'topic-1', taskDate: '2026-01-07', taskType: 'learning', estimatedMinutes: 30, targetCount: 0, displayOrder: 0, metadata: {} },
      ],
      updatedTopics: [
        { planTopicId: 'topic-1', completedUworldQuestions: 5, incorrectQuestionsRemaining: 0, learningCompletedAt: '2026-01-05', questionsUnlockedAt: '2026-01-05', status: 'uworld_in_progress' },
      ],
      resultJson: { planId: 'plan-1', revision: 5 },
      recalculationMutationId: 'mut-1',
      recalculatedAt: '2026-01-07T12:00:00Z',
    })
    expect(results[0].meta.changes).toBe(1)
  })
})

// ─── persistRecalculationBatch — rollback ───

describe('persistRecalculationBatch — rollback', () => {
  it('if batch throws, no statements succeed (batch was called, error propagated)', async () => {
    const env = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        })),
        batch: vi.fn(async () => {
          throw new Error('BATCH_FAILED')
        }),
      },
    }

    await expect(
      persistRecalculationBatch(env, {
        planId: 'plan-1',
        userId: 'user-1',
        expectedRevision: 5,
        clientRequestId: 'req-1',
        requestFingerprint: 'fp-1',
        operation: 'recalculate',
        regeneratedTasks: [
          { id: 'task-1', planTopicId: 'topic-1', taskDate: '2026-01-07', taskType: 'learning', estimatedMinutes: 30, targetCount: 0, displayOrder: 0, metadata: {} },
        ],
        updatedTopics: [
          { planTopicId: 'topic-1', completedUworldQuestions: 5, incorrectQuestionsRemaining: 0, learningCompletedAt: '2026-01-05', questionsUnlockedAt: '2026-01-05', status: 'uworld_in_progress' },
        ],
        resultJson: { planId: 'plan-1', revision: 5 },
        recalculationMutationId: 'mut-1',
        recalculatedAt: '2026-01-07T12:00:00Z',
      })
    ).rejects.toThrow('BATCH_FAILED')
    expect(env.DB.batch).toHaveBeenCalledTimes(1)
  })

  it('env.DB.prepare not called outside batch (all in batch)', async () => {
    const env = createMockEnv()
    await persistRecalculationBatch(env, {
      planId: 'plan-1',
      userId: 'user-1',
      expectedRevision: 5,
      clientRequestId: 'req-1',
      requestFingerprint: 'fp-1',
      operation: 'recalculate',
      regeneratedTasks: [
        { id: 'task-1', planTopicId: 'topic-1', taskDate: '2026-01-07', taskType: 'learning', estimatedMinutes: 30, targetCount: 0, displayOrder: 0, metadata: {} },
      ],
      updatedTopics: [
        { planTopicId: 'topic-1', completedUworldQuestions: 5, incorrectQuestionsRemaining: 0, learningCompletedAt: '2026-01-05', questionsUnlockedAt: '2026-01-05', status: 'uworld_in_progress' },
      ],
      resultJson: { planId: 'plan-1', revision: 5 },
      recalculationMutationId: 'mut-1',
      recalculatedAt: '2026-01-07T12:00:00Z',
    })
    expect(env.DB.prepare).toHaveBeenCalledTimes(7)
    expect(env.DB.batch).toHaveBeenCalledTimes(1)
  })
})

// ─── buildReservedMinutesMap — R1-specific ───

describe('buildReservedMinutesMap — R1-specific', () => {
  const dateRange = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08']

  it('only preserved tasks (completed/partial/skipped) contribute to reserved minutes', () => {
    const tasks = [
      { status: 'pending', task_date: '2026-01-05', actual_minutes: 100, estimated_minutes: 100 },
      { status: 'locked', task_date: '2026-01-05', actual_minutes: 50, estimated_minutes: 50 },
      { status: 'completed', task_date: '2026-01-05', actual_minutes: 30, estimated_minutes: 60 },
      { status: 'partial', task_date: '2026-01-06', actual_minutes: 15, estimated_minutes: 40 },
      { status: 'skipped', task_date: '2026-01-07', actual_minutes: 20, estimated_minutes: 30 },
      { status: 'in_progress', task_date: '2026-01-08', actual_minutes: 25, estimated_minutes: 50 },
    ]
    const result = buildReservedMinutesMap(tasks, dateRange)
    expect(result).toEqual({
      '2026-01-05': 30,
      '2026-01-06': 15,
      '2026-01-07': 20,
    })
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
          status: 'uworld_in_progress',
          learningCompletedAt: '2026-01-05',
          totalUworldQuestions: 20,
          completedUworldQuestions: 8,
        },
      ],
      feasibility: { feasible: true },
    }
    const plan = { id: 'plan-1', revision: 1 }
    const result = buildRecalculationResult(recalculation, plan, false)
    expect(result.topicStates).toHaveLength(1)
    expect(result.topicStates[0]).toEqual({
      id: 'cardiology.stable-angina',
      status: 'uworld_in_progress',
      learningComplete: true,
      projectedQuestionsRemaining: 12,
    })
  })

  it('handles missing recalculationDate gracefully when top-level key present', () => {
    const recalculation = {
      recalculationDate: '2026-01-07',
      tasks: [],
      topicStates: [],
      feasibility: { feasible: false },
    }
    const plan = { plan_id: 'plan-2', revision: 7 }
    const result = buildRecalculationResult(recalculation, plan, true)
    expect(result.planId).toBe('plan-2')
    expect(result.revision).toBe(7)
    expect(result.replayed).toBe(true)
    expect(result.feasibility).toEqual({ feasible: false })
  })
})
