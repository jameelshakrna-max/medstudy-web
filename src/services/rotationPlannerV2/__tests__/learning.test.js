import { describe, it, expect } from 'vitest'
import { resolveTopicLearningMinutes, scheduleLearningTasks } from '../learning.js'

function makeTopic(overrides = {}) {
  return {
    canonicalTopicId: 'cardiology.hypertension',
    sourceTopicId: 'cardiology.hypertension',
    title: 'Hypertension',
    learningMinutes: { focused: 30, activeLow: 40, activeExpected: 50, activeHigh: 60, detailedNotes: 70 },
    uworldRemainingQuestions: 20,
    prerequisiteTopicIds: [],
    sharedTopicKey: null,
    alreadyCompletedLearningPercentage: 0,
    alreadyCompletedQuestionCount: 0,
    ...overrides,
  }
}

function makeState(overrides = {}) {
  return {
    canonicalTopicId: 'cardiology.hypertension',
    sourceTopicId: 'cardiology.hypertension',
    title: 'Hypertension',
    baseLearningMinutes: 50,
    personalizedLearningMinutes: 50,
    totalUworldQuestions: 20,
    completedUworldQuestions: 0,
    remainingUworldQuestions: 20,
    learningCompletedAt: null,
    questionsUnlockedAt: null,
    status: 'not_started',
    displayOrder: 0,
    satisfiedBySharedCompletion: false,
    isPrimarySharedUnit: true,
    incorrectQuestionsRemaining: 0,
    ...overrides,
  }
}

describe('resolveTopicLearningMinutes', () => {
  it('focused style uses focused minutes', () => {
    const topic = makeTopic()
    expect(resolveTopicLearningMinutes(topic, 'focused', 1.0)).toBe(30)
  })

  it('active style uses activeExpected minutes', () => {
    const topic = makeTopic()
    expect(resolveTopicLearningMinutes(topic, 'active', 1.0)).toBe(50)
  })

  it('detailed_notes style uses detailedNotes minutes', () => {
    const topic = makeTopic()
    expect(resolveTopicLearningMinutes(topic, 'detailed_notes', 1.0)).toBe(70)
  })

  it('paceMultiplier 1.2 scales up', () => {
    const topic = makeTopic()
    expect(resolveTopicLearningMinutes(topic, 'active', 1.2)).toBe(60)
  })

  it('paceMultiplier 0.8 scales down', () => {
    const topic = makeTopic()
    expect(resolveTopicLearningMinutes(topic, 'active', 0.8)).toBe(40)
  })

  it('alreadyCompletedLearningPercentage 0.5 halves remaining', () => {
    const topic = makeTopic({ alreadyCompletedLearningPercentage: 0.5 })
    expect(resolveTopicLearningMinutes(topic, 'active', 1.0)).toBe(25)
  })

  it('alreadyCompletedLearningPercentage 1.0 returns 0', () => {
    const topic = makeTopic({ alreadyCompletedLearningPercentage: 1.0 })
    expect(resolveTopicLearningMinutes(topic, 'active', 1.0)).toBe(0)
  })
})

describe('scheduleLearningTasks — focused mode', () => {
  it('1 topic, 120 min capacity, focused, not_started → transitions to learning, single task of 50', () => {
    const topic = makeTopic()
    const state = makeState()
    const topicStates = { [state.canonicalTopicId]: state }
    const result = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 120,
      activeTopics: [topic],
      topicStates,
      schedulingMode: 'focused',
      maximumActiveTopics: 5,
    })
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].estimatedMinutes).toBe(50)
    expect(result.remainingCapacity).toBe(70)
  })

  it('1 topic, 30 min capacity, 50 min needed → partial task of 30, topic stays learning', () => {
    const topic = makeTopic()
    const state = makeState()
    const topicStates = { [state.canonicalTopicId]: state }
    const result = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 30,
      activeTopics: [topic],
      topicStates,
      schedulingMode: 'focused',
      maximumActiveTopics: 5,
    })
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].estimatedMinutes).toBe(30)
    const updatedState = result.topicStates[state.canonicalTopicId]
    expect(updatedState.status).toBe('learning')
  })

  it('1 topic, full 50 min capacity → task of 50, status becomes questions_locked', () => {
    const topic = makeTopic()
    const state = makeState()
    const topicStates = { [state.canonicalTopicId]: state }
    const result = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 50,
      activeTopics: [topic],
      topicStates,
      schedulingMode: 'focused',
      maximumActiveTopics: 5,
    })
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].estimatedMinutes).toBe(50)
    const updatedState = result.topicStates[state.canonicalTopicId]
    expect(updatedState.status).toBe('questions_locked')
    expect(updatedState.learningCompletedAt).toBe('2026-08-03')
  })
})

describe('scheduleLearningTasks — efficient mode', () => {
  it('2 topics, 120 min capacity → both get learning, remainingCapacity=20', () => {
    const topicA = makeTopic({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A' })
    const topicB = makeTopic({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B' })
    const stateA = makeState({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A', personalizedLearningMinutes: 50 })
    const stateB = makeState({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B', personalizedLearningMinutes: 50 })
    const topicStates = { a: stateA, b: stateB }
    const result = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 120,
      activeTopics: [topicA, topicB],
      topicStates,
      schedulingMode: 'efficient',
      maximumActiveTopics: 5,
    })
    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0].estimatedMinutes).toBe(50)
    expect(result.tasks[1].estimatedMinutes).toBe(50)
    expect(result.remainingCapacity).toBe(20)
  })

  it('maximumActiveTopics=1 with 2 topics → only first topic gets learning', () => {
    const topicA = makeTopic({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A' })
    const topicB = makeTopic({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B' })
    const stateA = makeState({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A', personalizedLearningMinutes: 50 })
    const stateB = makeState({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B', personalizedLearningMinutes: 50 })
    const topicStates = { a: stateA, b: stateB }
    const result = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 120,
      activeTopics: [topicA, topicB],
      topicStates,
      schedulingMode: 'efficient',
      maximumActiveTopics: 1,
    })
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].canonicalTopicId).toBe('a')
    expect(result.remainingCapacity).toBe(70)
  })
})

describe('scheduleLearningTasks — capacity invariant', () => {
  it('no day produces tasks exceeding usableMinutes', () => {
    const topics = [
      makeTopic({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A' }),
      makeTopic({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B' }),
      makeTopic({ canonicalTopicId: 'c', sourceTopicId: 'c', title: 'C' }),
    ]
    const topicStates = {
      a: makeState({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A', personalizedLearningMinutes: 50 }),
      b: makeState({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B', personalizedLearningMinutes: 50 }),
      c: makeState({ canonicalTopicId: 'c', sourceTopicId: 'c', title: 'C', personalizedLearningMinutes: 50 }),
    }
    const usableMinutes = 90
    const result = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes,
      activeTopics: topics,
      topicStates,
      schedulingMode: 'efficient',
      maximumActiveTopics: 5,
    })
    const totalMinutes = result.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0)
    expect(totalMinutes).toBeLessThanOrEqual(usableMinutes)
  })
})
