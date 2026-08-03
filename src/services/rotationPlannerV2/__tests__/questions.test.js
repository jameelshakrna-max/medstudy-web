import { describe, it, expect } from 'vitest'
import { scheduleUworldTasks, scheduleIncorrectReview } from '../questions.js'

function makeTopic(overrides = {}) {
  return {
    canonicalTopicId: 'cardiology.hypertension',
    normalizedTopicId: 'src::cardiology.hypertension',
    ...overrides,
  }
}

function makeState(overrides = {}) {
  return {
    canonicalTopicId: 'cardiology.hypertension',
    remainingUworldQuestions: 30,
    questionsUnlockedAt: null,
    learningCompletedAt: '2026-01-05',
    status: 'uworld_in_progress',
    incorrectQuestionsRemaining: 0,
    ...overrides,
  }
}

const PLAN_CONFIG = {
  preferredQuestionsPerDay: 10,
  minimumQuestionsPerSession: 5,
  maximumQuestionsPerDay: 15,
  averageMinutesPerQuestion: 1.5,
}

describe('scheduleUworldTasks', () => {
  it('sets questionsUnlockedAt to the first day questions are scheduled', () => {
    const topic = makeTopic()
    const state = makeState()
    const topicStates = { [topic.canonicalTopicId]: state }

    const day1 = scheduleUworldTasks({
      dayDate: '2026-01-10',
      usableMinutes: 120,
      eligibleTopics: [topic],
      topicStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })

    expect(day1.topicStates[topic.canonicalTopicId].questionsUnlockedAt).toBe('2026-01-10')
  })

  it('preserves first-day questionsUnlockedAt on subsequent scheduling days', () => {
    const topic = makeTopic()
    const state = makeState({ remainingUworldQuestions: 30 })
    const topicStates = { [topic.canonicalTopicId]: { ...state } }

    const day1 = scheduleUworldTasks({
      dayDate: '2026-01-10',
      usableMinutes: 120,
      eligibleTopics: [topic],
      topicStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })

    const stateAfterDay1 = day1.topicStates[topic.canonicalTopicId]
    expect(stateAfterDay1.questionsUnlockedAt).toBe('2026-01-10')

    const day2 = scheduleUworldTasks({
      dayDate: '2026-01-11',
      usableMinutes: 120,
      eligibleTopics: [topic],
      topicStates: { [topic.canonicalTopicId]: { ...stateAfterDay1 } },
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })

    const stateAfterDay2 = day2.topicStates[topic.canonicalTopicId]
    expect(stateAfterDay2.questionsUnlockedAt).toBe('2026-01-10')
  })

  it('preserves existing questionsUnlockedAt from state', () => {
    const topic = makeTopic()
    const state = makeState({ questionsUnlockedAt: '2026-01-08' })
    const topicStates = { [topic.canonicalTopicId]: state }

    const day1 = scheduleUworldTasks({
      dayDate: '2026-01-10',
      usableMinutes: 120,
      eligibleTopics: [topic],
      topicStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })

    expect(day1.topicStates[topic.canonicalTopicId].questionsUnlockedAt).toBe('2026-01-08')
  })
})

const INCORRECT_PLAN_CONFIG = {
  preferredQuestionsPerDay: 10,
  minimumQuestionsPerSession: 5,
  maximumQuestionsPerDay: 50,
  averageMinutesPerQuestion: 1.5,
}

describe('scheduleIncorrectReview', () => {
  it('decrements incorrectQuestionsRemaining and returns updated topicStates', () => {
    const topic = makeTopic()
    const topicStates = {
      [topic.canonicalTopicId]: makeState({ incorrectQuestionsRemaining: 25 }),
    }

    const result = scheduleIncorrectReview({
      dayDate: '2026-01-10',
      usableMinutes: 120,
      topicsNeedingReview: [topic],
      topicStates,
      planConfig: INCORRECT_PLAN_CONFIG,
    })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].taskType).toBe('incorrect_review')
    expect(result.tasks[0].canonicalTopicId).toBe('cardiology.hypertension')
    expect(result.tasks[0].targetCount).toBe(10)
    expect(result.tasks[0].displayOrder).toBe(1)
    expect(result.remainingCapacity).toBe(105)
    expect(result.topicStates[topic.canonicalTopicId].incorrectQuestionsRemaining).toBe(15)
  })

  it('schedules exactly the remaining count on the last day and never goes negative', () => {
    const topic = makeTopic()
    const topicStates = {
      [topic.canonicalTopicId]: makeState({ incorrectQuestionsRemaining: 10 }),
    }

    const result = scheduleIncorrectReview({
      dayDate: '2026-01-10',
      usableMinutes: 120,
      topicsNeedingReview: [topic],
      topicStates,
      planConfig: INCORRECT_PLAN_CONFIG,
    })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].targetCount).toBe(10)
    expect(result.topicStates[topic.canonicalTopicId].incorrectQuestionsRemaining).toBe(0)
  })

  it('schedules a partial remainder without exceeding remaining', () => {
    const topic = makeTopic()
    const topicStates = {
      [topic.canonicalTopicId]: makeState({ incorrectQuestionsRemaining: 3 }),
    }

    const result = scheduleIncorrectReview({
      dayDate: '2026-01-10',
      usableMinutes: 120,
      topicsNeedingReview: [topic],
      topicStates,
      planConfig: INCORRECT_PLAN_CONFIG,
    })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].targetCount).toBe(3)
    expect(result.topicStates[topic.canonicalTopicId].incorrectQuestionsRemaining).toBe(0)
  })

  it('produces no task and no decrement when remaining is zero', () => {
    const topic = makeTopic()
    const topicStates = {
      [topic.canonicalTopicId]: makeState({ incorrectQuestionsRemaining: 0 }),
    }

    const result = scheduleIncorrectReview({
      dayDate: '2026-01-10',
      usableMinutes: 120,
      topicsNeedingReview: [topic],
      topicStates,
      planConfig: INCORRECT_PLAN_CONFIG,
    })

    expect(result.tasks).toHaveLength(0)
    expect(result.remainingCapacity).toBe(120)
    expect(result.topicStates[topic.canonicalTopicId]).toBeUndefined()
  })

  it('keeps separate topic states independent', () => {
    const topicA = makeTopic({ canonicalTopicId: 'cardiology.hypertension' })
    const topicB = makeTopic({ canonicalTopicId: 'cardiology.acs' })
    const topicStates = {
      'cardiology.hypertension': makeState({ canonicalTopicId: 'cardiology.hypertension', incorrectQuestionsRemaining: 25 }),
      'cardiology.acs': makeState({ canonicalTopicId: 'cardiology.acs', incorrectQuestionsRemaining: 5 }),
    }

    const result = scheduleIncorrectReview({
      dayDate: '2026-01-10',
      usableMinutes: 120,
      topicsNeedingReview: [topicA, topicB],
      topicStates,
      planConfig: INCORRECT_PLAN_CONFIG,
    })

    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0].canonicalTopicId).toBe('cardiology.hypertension')
    expect(result.tasks[0].targetCount).toBe(10)
    expect(result.tasks[1].canonicalTopicId).toBe('cardiology.acs')
    expect(result.tasks[1].targetCount).toBe(5)
    expect(result.topicStates['cardiology.hypertension'].incorrectQuestionsRemaining).toBe(15)
    expect(result.topicStates['cardiology.acs'].incorrectQuestionsRemaining).toBe(0)
  })

  it('respects daily capacity limits', () => {
    const topic = makeTopic()
    const topicStates = {
      [topic.canonicalTopicId]: makeState({ incorrectQuestionsRemaining: 100 }),
    }

    const result = scheduleIncorrectReview({
      dayDate: '2026-01-10',
      usableMinutes: 15,
      topicsNeedingReview: [topic],
      topicStates,
      planConfig: INCORRECT_PLAN_CONFIG,
    })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].targetCount).toBe(10)
    expect(result.remainingCapacity).toBe(0)
    expect(result.topicStates[topic.canonicalTopicId].incorrectQuestionsRemaining).toBe(90)
  })
})
