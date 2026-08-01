import { describe, it, expect } from 'vitest'
import { recalculatePlan, deriveActualTopicStates } from '../recalculation.js'

// ─── Factories (mirror recalculation.test.js style) ───

function makePlan(overrides = {}) {
  return {
    id: 'plan-1',
    user_id: 'user-1',
    rotation_id: 'cardiology',
    source_id: 'step-up-medicine-6e-2024',
    start_date: '2026-01-05',
    end_date: '2026-01-09',
    exam_date: null,
    study_style: 'active',
    scheduling_mode: 'efficient',
    question_start_rule: 'next_available_day',
    preferred_questions_per_day: 10,
    minimum_questions_per_session: 5,
    maximum_questions_per_day: 20,
    average_minutes_per_question: 1.5,
    buffer_percentage: 0,
    maximum_active_topics: 5,
    status: 'active',
    uses_flashcard_capacity: 0,
    settings_json: '{}',
    revision: 1,
    ...overrides,
  }
}

function makeTopic(overrides = {}) {
  return {
    id: 'topic-1',
    plan_id: 'plan-1',
    normalized_topic_id: 'src::nonexistent.topic',
    canonical_topic_id: 'cardiology.stable-angina',
    source_topic_id: 'nonexistent.topic',
    shared_topic_key: null,
    topic_title: 'Stable Angina',
    group_id: null,
    base_learning_minutes: 60,
    personalized_learning_minutes: 60,
    total_uworld_questions: 0,
    completed_uworld_questions: 0,
    incorrect_questions_remaining: 0,
    learning_completed_at: null,
    questions_unlocked_at: null,
    status: 'not_started',
    mastery_score: null,
    display_order: 0,
    ...overrides,
  }
}

function makeTask(overrides = {}) {
  return {
    id: 'task-hist-1',
    plan_id: 'plan-1',
    plan_topic_id: 'topic-1',
    task_date: '2026-01-05',
    task_type: 'learning',
    provider: null,
    estimated_minutes: 60,
    actual_minutes: 30,
    target_count: null,
    completed_count: null,
    completion_percentage: 50,
    incorrect_count: 0,
    completed_at: '2026-01-05T12:00:00Z',
    completed_on: '2026-01-05',
    mode: null,
    question_pool: null,
    status: 'partial',
    unlock_condition: null,
    display_order: 0,
    is_pinned: 0,
    metadata_json: '{}',
    ...overrides,
  }
}

function makeAvailability() {
  return [
    { weekday: 0, available_minutes: 0, is_day_off: 1 },
    { weekday: 1, available_minutes: 240, is_day_off: 0 },
    { weekday: 2, available_minutes: 240, is_day_off: 0 },
    { weekday: 3, available_minutes: 240, is_day_off: 0 },
    { weekday: 4, available_minutes: 240, is_day_off: 0 },
    { weekday: 5, available_minutes: 240, is_day_off: 0 },
    { weekday: 6, available_minutes: 0, is_day_off: 1 },
  ]
}

function createPlanEnv({ plan, topics, tasks, availability }) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              first: async () => {
                if (sql.includes('FROM rotation_planner_plans')) return plan
                return null
              },
              all: async () => {
                if (sql.includes('FROM rotation_planner_topics')) return { results: topics }
                if (sql.includes('FROM rotation_planner_daily_tasks')) return { results: tasks }
                if (sql.includes('FROM rotation_planner_availability')) return { results: availability }
                return { results: [] }
              },
              run: async () => ({ success: true, meta: { changes: 1 } }),
            }
          },
        }
      },
      batch: async () => [],
    },
  }
}

const RECALC_DATE = '2026-01-07'

function learningTasks(result) {
  const recalc = result.recalculation
  const tasks = recalc?.recalculation?.tasks || recalc?.tasks || []
  return tasks.filter((t) => t.taskType === 'learning')
}

function totalLearningMinutes(result) {
  return learningTasks(result).reduce((s, t) => s + t.estimatedMinutes, 0)
}

describe('deriveActualTopicStates — partial learning remainder', () => {
  const AS_OF = { asOfDate: RECALC_DATE }

  it('keeps personalizedLearningMinutes as the immutable total baseline of 60', () => {
    const state = deriveActualTopicStates([makeTopic()], [makeTask()], AS_OF)[0]
    expect(state.personalizedLearningMinutes).toBe(60)
  })

  it('exposes remainingLearningMinutes as 30 after a 50% partial task of 60 minutes', () => {
    const state = deriveActualTopicStates([makeTopic()], [makeTask()], AS_OF)[0]
    expect(state.remainingLearningMinutes).toBe(30)
  })

  it('sums multiple partial learning events correctly', () => {
    const tasks = [
      makeTask({ id: 'task-p1', estimated_minutes: 20, actual_minutes: 10, completion_percentage: 50 }),
      makeTask({ id: 'task-p2', estimated_minutes: 40, actual_minutes: 20, completion_percentage: 50 }),
    ]
    const state = deriveActualTopicStates([makeTopic()], tasks, AS_OF)[0]
    expect(state.remainingLearningMinutes).toBe(30)
  })

  it('completed learning schedules zero remainder', () => {
    const tasks = [
      makeTask({ status: 'completed', estimated_minutes: 60, actual_minutes: 60, completion_percentage: null, completed_on: '2026-01-05' }),
    ]
    const state = deriveActualTopicStates([makeTopic()], tasks, AS_OF)[0]
    expect(state.remainingLearningMinutes).toBe(0)
  })

  it('skipped learning remains historical with full workload remaining', () => {
    const tasks = [
      makeTask({ status: 'skipped', estimated_minutes: 30, actual_minutes: 0, completion_percentage: null }),
    ]
    const state = deriveActualTopicStates([makeTopic()], tasks, AS_OF)[0]
    expect(state.remainingLearningMinutes).toBe(60)
  })

  it('partial topic keeps learning_started semantics (status learning, not completed)', () => {
    const state = deriveActualTopicStates([makeTopic()], [makeTask()], AS_OF)[0]
    expect(state.status).toBe('learning')
    expect(state.learningCompletedAt).toBeNull()
  })

  it('does not unlock UWorld early for a partial topic', () => {
    const state = deriveActualTopicStates([makeTopic({ total_uworld_questions: 20 })], [makeTask()], AS_OF)[0]
    expect(state.questionsUnlockedAt).toBeNull()
  })

  it('unlocks UWorld only once learning is complete', () => {
    const tasks = [
      makeTask({ status: 'completed', estimated_minutes: 60, actual_minutes: 60, completion_percentage: null, completed_on: '2026-01-05' }),
    ]
    const state = deriveActualTopicStates([makeTopic({ total_uworld_questions: 20 })], tasks, AS_OF)[0]
    expect(state.questionsUnlockedAt).toBe('2026-01-05')
  })

  it('subsequent completion reduces the remaining amount exactly once', () => {
    const tasks = [
      makeTask({ id: 'task-hist-1', status: 'partial', estimated_minutes: 60, actual_minutes: 30, completion_percentage: 50 }),
      makeTask({ id: 'task-hist-2', status: 'completed', estimated_minutes: 30, actual_minutes: 30, completion_percentage: null, completed_on: '2026-01-08' }),
    ]
    const state = deriveActualTopicStates([makeTopic()], tasks, AS_OF)[0]
    expect(state.remainingLearningMinutes).toBe(0)
  })
})

describe('recalculatePlan — partial learning remainder regression', () => {
  it('schedules only the remaining 30 minutes, NOT the full 60 again', async () => {
    const env = createPlanEnv({
      plan: makePlan(),
      topics: [makeTopic()],
      tasks: [makeTask()],
      availability: makeAvailability(),
    })
    const result = await recalculatePlan(env, 'plan-1', 'user-1', RECALC_DATE)
    expect(totalLearningMinutes(result)).toBe(30)
  })

  it('fresh remainder task has a new id, original partial task untouched', async () => {
    const env = createPlanEnv({
      plan: makePlan(),
      topics: [makeTopic()],
      tasks: [makeTask()],
      availability: makeAvailability(),
    })
    const result = await recalculatePlan(env, 'plan-1', 'user-1', RECALC_DATE)
    const learning = learningTasks(result)
    expect(learning).toHaveLength(1)
    expect(learning[0].estimatedMinutes).toBe(30)
    expect(learning.some((t) => t.id === 'task-hist-1')).toBe(false)
    expect(learning[0].id).not.toBe('task-hist-1')
  })

  it('multiple partial events schedule only the summed remainder', async () => {
    const env = createPlanEnv({
      plan: makePlan(),
      topics: [makeTopic()],
      tasks: [
        makeTask({ id: 'task-p1', estimated_minutes: 20, actual_minutes: 10, completion_percentage: 50 }),
        makeTask({ id: 'task-p2', estimated_minutes: 40, actual_minutes: 20, completion_percentage: 50 }),
      ],
      availability: makeAvailability(),
    })
    const result = await recalculatePlan(env, 'plan-1', 'user-1', RECALC_DATE)
    expect(totalLearningMinutes(result)).toBe(30)
  })

  it('completed learning schedules zero remainder', async () => {
    const env = createPlanEnv({
      plan: makePlan(),
      topics: [makeTopic()],
      tasks: [makeTask({ status: 'completed', estimated_minutes: 60, actual_minutes: 60, completion_percentage: null, completed_on: '2026-01-05' })],
      availability: makeAvailability(),
    })
    const result = await recalculatePlan(env, 'plan-1', 'user-1', RECALC_DATE)
    expect(totalLearningMinutes(result)).toBe(0)
  })

  it('skipped learning stays historical while unfinished workload remains scheduled', async () => {
    const env = createPlanEnv({
      plan: makePlan(),
      topics: [makeTopic()],
      tasks: [makeTask({ status: 'skipped', estimated_minutes: 30, actual_minutes: 0, completion_percentage: null })],
      availability: makeAvailability(),
    })
    const result = await recalculatePlan(env, 'plan-1', 'user-1', RECALC_DATE)
    expect(totalLearningMinutes(result)).toBe(60)
    expect(learningTasks(result).some((t) => t.id === 'task-hist-1')).toBe(false)
  })

  it('subsequent completion reduces the remaining amount exactly once', async () => {
    const env = createPlanEnv({
      plan: makePlan(),
      topics: [makeTopic()],
      tasks: [
        makeTask({ id: 'task-hist-1', status: 'partial', estimated_minutes: 60, actual_minutes: 30, completion_percentage: 50 }),
        makeTask({ id: 'task-hist-2', status: 'completed', estimated_minutes: 30, actual_minutes: 30, completion_percentage: null, completed_on: '2026-01-08' }),
      ],
      availability: makeAvailability(),
    })
    const result = await recalculatePlan(env, 'plan-1', 'user-1', RECALC_DATE)
    expect(totalLearningMinutes(result)).toBe(0)
  })

  it('completed and partial historical tasks remain unchanged; fresh remainder task gets new ids', async () => {
    const env = createPlanEnv({
      plan: makePlan(),
      topics: [makeTopic({ base_learning_minutes: 100, personalized_learning_minutes: 100 })],
      tasks: [
        makeTask({ id: 'task-completed', status: 'completed', estimated_minutes: 60, actual_minutes: 60, completion_percentage: null, completed_on: '2026-01-05' }),
        makeTask({ id: 'task-partial', status: 'partial', estimated_minutes: 40, actual_minutes: 20, completion_percentage: 50, completed_on: '2026-01-06' }),
      ],
      availability: makeAvailability(),
    })
    const result = await recalculatePlan(env, 'plan-1', 'user-1', RECALC_DATE)
    const learning = learningTasks(result)
    expect(learning).toHaveLength(1)
    expect(learning[0].estimatedMinutes).toBe(20)
    expect(totalLearningMinutes(result)).toBe(20)
    expect(learning.some((t) => t.id === 'task-completed')).toBe(false)
    expect(learning.some((t) => t.id === 'task-partial')).toBe(false)
    const actualStates = result.actualStates
    expect(actualStates[0].personalizedLearningMinutes).toBe(100)
    expect(actualStates[0].remainingLearningMinutes).toBe(20)
  })
})
