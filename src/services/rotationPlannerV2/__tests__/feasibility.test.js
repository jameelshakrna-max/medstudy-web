import { describe, it, expect } from 'vitest'
import {
  calculatePlanFeasibility,
  buildUnscheduledWork,
} from '../feasibility.js'

function makeResolvedTopic(id = 'cardiology.hypertension', overrides = {}) {
  return {
    canonicalTopicId: id,
    sourceTopicId: id,
    title: 'Hypertension',
    satisfiedBySharedCompletion: false,
    ...overrides,
  }
}

function makeTopicState(id = 'cardiology.hypertension', overrides = {}) {
  return {
    canonicalTopicId: id,
    personalizedLearningMinutes: 50,
    remainingUworldQuestions: 20,
    satisfiedBySharedCompletion: false,
    status: 'not_started',
    ...overrides,
  }
}

function makeDateCapacities(dates, usableMinutes = 200) {
  const caps = {}
  for (const d of dates) {
    caps[d] = { usableMinutes, isDayOff: false, isBlocked: false }
  }
  return caps
}

function makePlanConfig(overrides = {}) {
  return {
    averageMinutesPerQuestion: 1.5,
    bufferPercentage: 20,
    studyStyle: 'active',
    examReviewWindowDays: 0,
    mixedReviewQuestionsPerDay: 0,
    ...overrides,
  }
}

describe('calculatePlanFeasibility', () => {
  it('returns feasible=true when plan fits', () => {
    const id = 'cardiology.hypertension'
    const resolvedTopics = [makeResolvedTopic(id)]
    const topicStates = { [id]: makeTopicState(id) }
    const dateCapacities = makeDateCapacities(['2026-01-01', '2026-01-02'], 200)
    const planConfig = makePlanConfig()

    const result = calculatePlanFeasibility({ resolvedTopics, dateCapacities, planConfig, topicStates })
    expect(result.feasible).toBe(true)
  })

  it('returns feasible=false when plan cannot fit', () => {
    const id = 'cardiology.hypertension'
    const resolvedTopics = [makeResolvedTopic(id)]
    const topicStates = { [id]: makeTopicState(id, { personalizedLearningMinutes: 900, remainingUworldQuestions: 67 }) }
    const dateCapacities = makeDateCapacities(['2026-01-01'], 200)
    const planConfig = makePlanConfig()

    const result = calculatePlanFeasibility({ resolvedTopics, dateCapacities, planConfig, topicStates })
    expect(result.feasible).toBe(false)
    expect(result.missingCapacity).toBeGreaterThan(0)
  })

  it('calculates required extra minutes rounded up per day', () => {
    const id = 'cardiology.hypertension'
    const resolvedTopics = [makeResolvedTopic(id)]
    const topicStates = { [id]: makeTopicState(id, { personalizedLearningMinutes: 900, remainingUworldQuestions: 67 }) }
    const dateCapacities = makeDateCapacities(['2026-01-01'], 200)
    const planConfig = makePlanConfig()

    const result = calculatePlanFeasibility({ resolvedTopics, dateCapacities, planConfig, topicStates })
    expect(result.requiredExtraMinutesPerDay).toBeGreaterThanOrEqual(1)
  })

  it('derives possible solutions when infeasible', () => {
    const id = 'cardiology.hypertension'
    const resolvedTopics = [makeResolvedTopic(id)]
    const topicStates = { [id]: makeTopicState(id, { personalizedLearningMinutes: 900, remainingUworldQuestions: 67 }) }
    const dateCapacities = makeDateCapacities(['2026-01-01'], 200)
    const planConfig = makePlanConfig()

    const result = calculatePlanFeasibility({ resolvedTopics, dateCapacities, planConfig, topicStates })
    expect(result.feasible).toBe(false)
    expect(result.possibleSolutions).toBeDefined()
    expect(Array.isArray(result.possibleSolutions)).toBe(true)
    expect(result.possibleSolutions.length).toBeGreaterThan(0)
  })

  it('does not double-count minutes in totalRequiredMinutes', () => {
    const id = 'cardiology.hypertension'
    const resolvedTopics = [makeResolvedTopic(id)]
    const topicStates = { [id]: makeTopicState(id, { personalizedLearningMinutes: 50, remainingUworldQuestions: 20 }) }
    const dateCapacities = makeDateCapacities(['2026-01-01', '2026-01-02', '2026-01-03'], 200)
    const planConfig = makePlanConfig({ averageMinutesPerQuestion: 1.5 })

    const result = calculatePlanFeasibility({ resolvedTopics, dateCapacities, planConfig, topicStates })
    const expectedLearning = 50
    const expectedUworld = 20 * 1.5
    const expectedTotal = expectedLearning + expectedUworld

    expect(result.totalRequiredMinutes).toBeCloseTo(expectedTotal, 0)
  })
})

describe('buildUnscheduledWork', () => {
  it('includes topics with remaining work', () => {
    const id = 'cardiology.hypertension'
    const topic = makeResolvedTopic(id)
    const topicState = makeTopicState(id)
    const result = buildUnscheduledWork({ tasks: [], resolvedTopics: [topic], topicStates: { [id]: topicState } })
    expect(result.length).toBeGreaterThan(0)
    expect(result.find((t) => t.canonicalTopicId === id)).toBeDefined()
  })

  it('excludes fully scheduled topics', () => {
    const id = 'cardiology.hypertension'
    const topic = makeResolvedTopic(id)
    const topicState = makeTopicState(id, { status: 'completed' })
    const result = buildUnscheduledWork({ tasks: [], resolvedTopics: [topic], topicStates: { [id]: topicState } })
    expect(result).toHaveLength(0)
  })

  it('excludes satisfied shared topics', () => {
    const id = 'cardiology.hypertension'
    const topic = makeResolvedTopic(id)
    const topicState = makeTopicState(id, { satisfiedBySharedCompletion: true })
    const result = buildUnscheduledWork({ tasks: [], resolvedTopics: [topic], topicStates: { [id]: topicState } })
    expect(result).toHaveLength(0)
  })
})
