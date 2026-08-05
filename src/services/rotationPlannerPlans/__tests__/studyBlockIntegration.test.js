import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../../__tests__/helpers/d1TestHarness.js'
import { filterMetadata } from '../persistence.js'
import { mapTaskDto } from '../dtoMappers.js'
import { generatePlanPreview } from '../previewPipeline.js'
import {
  handleCreateRotationPlan,
  handleGetRotationPlan,
  handleRecalculatePlan,
} from '../../../handlers/rotationPlannerPlans.js'

const USER_A = { sub: 'user-a', email: 'a@test.local', role: 'authenticated' }

const VALID_BODY = {
  sourceId: 'step-up-medicine-6e-2024',
  rotationId: 'cardiology',
  displayName: 'Cardiology — January 2026',
  startDate: '2026-01-05',
  endDate: '2026-01-11',
  studyStyle: 'active',
  schedulingMode: 'efficient',
  questionStartRule: 'next_available_day',
  availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
  topics: [{
    normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris',
    uworldRemainingQuestions: 20,
    alreadyCompletedLearningPercentage: 0,
    alreadyCompletedQuestionCount: 0,
  }],
  acceptOverload: false,
}

const VALID_PARSED_INPUT = {
  ...VALID_BODY,
  blockedDates: [],
  preferredQuestionsPerDay: 30,
  minimumQuestionsPerSession: 10,
  maximumQuestionsPerDay: 50,
  averageMinutesPerQuestion: 1.5,
  bufferPercentage: 20,
  maximumActiveTopics: 1,
  personalSourcePaceMultiplier: 1.0,
  examReviewWindowDays: 0,
  mixedReviewQuestionsPerDay: 0,
  dueReviewMinutesByDate: {},
}

const RESOLVED_TOPICS = [{
  normalizedTopicId: 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris',
  canonicalTopicId: 'cardiology.stable-angina-pectoris',
  sourceTopicId: 'cardiology.stable-angina-pectoris',
  sourceId: 'step-up-medicine-6e-2024',
  title: 'Stable Angina Pectoris',
  groupId: 'Ischemic Heart Disease',
  learningMinutes: { focused: 19, activeLow: 31, activeExpected: 37, activeHigh: 44, detailedNotes: 57 },
  uworldRemainingQuestions: 20,
  alreadyCompletedLearningPercentage: 0,
  alreadyCompletedQuestionCount: 0,
  incorrectQuestionsRemaining: 0,
  sharedTopicKey: null,
}]

let db

beforeEach(async () => {
  db = await createTestDb()
})

function makeRequest(path, { method = 'GET', body = null, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } }
  if (body !== null) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  return new Request(`https://medstudy.app${path}`, opts)
}

async function createPlan(body = VALID_BODY, user = USER_A) {
  const req = makeRequest('/api/rotation-planner/plans', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2) },
  })
  return handleCreateRotationPlan(req, { DB: db }, user)
}

async function getPlan(planId, user = USER_A) {
  const req = makeRequest(`/api/rotation-planner/plans/${planId}`)
  return handleGetRotationPlan(req, { DB: db }, user)
}

async function recalculate(planId, body, user = USER_A) {
  const req = makeRequest(`/api/rotation-planner/plans/${planId}/recalculate`, {
    method: 'POST',
    body,
  })
  return handleRecalculatePlan(req, { DB: db }, user)
}

function makeBody(overrides = {}) {
  return { ...VALID_BODY, ...overrides }
}

// ─── filterMetadata — studyBlockId gating ───

describe('filterMetadata — studyBlockId gating', () => {
  it('allows studyBlockId for learning tasks', () => {
    const result = filterMetadata('learning', { pageRange: { start: 1, end: 5 }, studyBlockId: 'sb::2026-01-05::src::sec::0' })
    expect(result.studyBlockId).toBe('sb::2026-01-05::src::sec::0')
  })

  it('strips studyBlockId for consolidation tasks (not in allowlist)', () => {
    const result = filterMetadata('consolidation', { studyBlockId: 'sb::2026-01-05::src::sec::0' })
    expect(result.studyBlockId).toBeUndefined()
  })

  it('strips studyBlockId for uworld_questions tasks', () => {
    const result = filterMetadata('uworld_questions', { selection: 'random', studyBlockId: 'sb::2026-01-05::src::sec::0' })
    expect(result.studyBlockId).toBeUndefined()
  })

  it('strips studyBlockId for flashcard_review tasks', () => {
    const result = filterMetadata('flashcard_review', { priority: 1, studyBlockId: 'sb::2026-01-05::src::sec::0' })
    expect(result.studyBlockId).toBeUndefined()
  })

  it('returns empty when metadata is null', () => {
    expect(filterMetadata('learning', null)).toEqual({})
  })
})

// ─── mapTaskDto — studyBlockId exposure ───

describe('mapTaskDto — studyBlockId exposure', () => {
  it('exposes studyBlockId at top level from metadata', () => {
    const row = {
      id: 'task-1', plan_id: 'plan-1', plan_topic_id: 'topic-1',
      task_date: '2026-01-05', task_type: 'learning', provider: null,
      estimated_minutes: 30, actual_minutes: null,
      target_count: 0, completed_count: 0, mode: null, question_pool: null,
      status: 'pending', unlock_condition: null, display_order: 0,
      metadata_json: '{"studyBlockId":"sb::2026-01-05::src::sec::0","pageRange":{"start":1,"end":5}}',
      created_at: null, updated_at: null,
      completion_percentage: null, incorrect_count: 0,
      completed_at: null, completed_on: null,
    }
    const dto = mapTaskDto(row)
    expect(dto.studyBlockId).toBe('sb::2026-01-05::src::sec::0')
    expect(dto.metadataJson.studyBlockId).toBe('sb::2026-01-05::src::sec::0')
  })

  it('returns null when metadata has no studyBlockId', () => {
    const row = {
      id: 'task-1', plan_id: 'plan-1', plan_topic_id: 'topic-1',
      task_date: '2026-01-05', task_type: 'learning', provider: null,
      estimated_minutes: 30, actual_minutes: null,
      target_count: 0, completed_count: 0, mode: null, question_pool: null,
      status: 'pending', unlock_condition: null, display_order: 0,
      metadata_json: '{"pageRange":{"start":1,"end":5}}',
      created_at: null, updated_at: null,
      completion_percentage: null, incorrect_count: 0,
      completed_at: null, completed_on: null,
    }
    const dto = mapTaskDto(row)
    expect(dto.studyBlockId).toBeNull()
  })

  it('returns null when metadata_json is empty', () => {
    const row = {
      id: 'task-1', plan_id: 'plan-1', plan_topic_id: 'topic-1',
      task_date: '2026-01-05', task_type: 'learning', provider: null,
      estimated_minutes: 30, actual_minutes: null,
      target_count: 0, completed_count: 0, mode: null, question_pool: null,
      status: 'pending', unlock_condition: null, display_order: 0,
      metadata_json: '{}',
      created_at: null, updated_at: null,
      completion_percentage: null, incorrect_count: 0,
      completed_at: null, completed_on: null,
    }
    const dto = mapTaskDto(row)
    expect(dto.studyBlockId).toBeNull()
  })
})

// ─── Preview pipeline — studyBlockId in preview tasks ───

describe('Preview pipeline — studyBlockId in preview tasks', () => {
  it('preview learning tasks have studyBlockId in metadata', () => {
    const { preview } = generatePlanPreview(RESOLVED_TOPICS, VALID_PARSED_INPUT)

    const learningTasks = preview.tasks.filter(t => t.taskType === 'learning')
    expect(learningTasks.length).toBeGreaterThan(0)
    for (const task of learningTasks) {
      expect(task.metadata.studyBlockId).toBeDefined()
      expect(task.metadata.studyBlockId).toMatch(/^sb::/)
    }
  })

  it('non-learning tasks in preview do not get studyBlockId', () => {
    const { preview } = generatePlanPreview(RESOLVED_TOPICS, VALID_PARSED_INPUT)

    const nonLearningTasks = preview.tasks.filter(t => t.taskType !== 'learning')
    expect(nonLearningTasks.length).toBeGreaterThan(0)
    for (const task of nonLearningTasks) {
      expect(task.metadata.studyBlockId).toBeUndefined()
    }
  })
})

// ─── assignStudyBlocks — direct integration with scheduler output ───

describe('assignStudyBlocks — direct integration with scheduler output', () => {
  it('preview tasks have positive estimated minutes', () => {
    const { preview } = generatePlanPreview(RESOLVED_TOPICS, VALID_PARSED_INPUT)

    expect(preview.tasks.length).toBeGreaterThan(0)
    for (const task of preview.tasks) {
      expect(task.estimatedMinutes).toBeGreaterThan(0)
    }
  })

  it('same scheduler output produces deterministic block IDs', () => {
    const { preview: p1 } = generatePlanPreview(RESOLVED_TOPICS, VALID_PARSED_INPUT)
    const { preview: p2 } = generatePlanPreview(RESOLVED_TOPICS, VALID_PARSED_INPUT)

    const blocks1 = p1.tasks.filter(t => t.taskType === 'learning').map(t => t.metadata.studyBlockId)
    const blocks2 = p2.tasks.filter(t => t.taskType === 'learning').map(t => t.metadata.studyBlockId)
    expect(blocks1).toEqual(blocks2)
  })
})

// ─── Recalculation — studyBlockId on regenerated tasks ───

describe('Recalculation — studyBlockId on regenerated tasks', () => {
  it('regenerated tasks have studyBlockId after recalculation', async () => {
    const createRes = await createPlan()
    expect(createRes.status).toBe(201)
    const createBody = await createRes.json()
    const planId = createBody.plan.id

    const getRes = await getPlan(planId)
    const plan = await getRes.json()
    const originalTask = plan.tasks.find(t => t.taskType === 'learning')
    expect(originalTask).toBeDefined()
    expect(originalTask.studyBlockId).toBeDefined()

    const recalcRes = await recalculate(planId, {
      recalculationDate: '2026-01-06',
      expectedRevision: plan.plan.revision,
    })
    expect(recalcRes.status).toBe(200)

    const getRes2 = await getPlan(planId)
    const plan2 = await getRes2.json()
    const regeneratedTasks = plan2.tasks.filter(t => t.taskType === 'learning')
    expect(regeneratedTasks.length).toBeGreaterThan(0)
    for (const task of regeneratedTasks) {
      expect(task.studyBlockId).toBeDefined()
      expect(task.studyBlockId).toMatch(/^sb::/)
    }
  })
})

// ─── Full handler integration — create + get shows studyBlockId ───

describe('Full handler integration — create + get', () => {
  it('created plan learning tasks have studyBlockId', async () => {
    const createRes = await createPlan()
    expect(createRes.status).toBe(201)
    const createBody = await createRes.json()
    const planId = createBody.plan.id

    const getRes = await getPlan(planId)
    expect(getRes.status).toBe(200)
    const plan = await getRes.json()

    const learningTasks = plan.tasks.filter(t => t.taskType === 'learning')
    expect(learningTasks.length).toBeGreaterThan(0)
    for (const task of learningTasks) {
      expect(task.studyBlockId).toBeDefined()
      expect(task.studyBlockId).toMatch(/^sb::/)
    }
  })

  it('non-learning tasks in created plan have null studyBlockId', async () => {
    const createRes = await createPlan()
    expect(createRes.status).toBe(201)
    const createBody = await createRes.json()
    const planId = createBody.plan.id

    const getRes = await getPlan(planId)
    const plan = await getRes.json()

    const nonLearningTasks = plan.tasks.filter(t => t.taskType !== 'learning')
    expect(nonLearningTasks.length).toBeGreaterThan(0)
    for (const task of nonLearningTasks) {
      expect(task.studyBlockId).toBeNull()
    }
  })
})
