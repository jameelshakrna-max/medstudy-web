import { describe, it, expect } from 'vitest'
import { scheduleUworldTasks } from '../questions.js'

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
