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

describe('scheduleLearningTasks — remainingLearningMinutes restoration', () => {
  it('schedules only the residual when remainingLearningMinutes is below personalizedLearningMinutes', () => {
    const topic = makeTopic()
    const state = makeState({ personalizedLearningMinutes: 60, remainingLearningMinutes: 30 })
    const topicStates = { [state.canonicalTopicId]: state }
    const result = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 120,
      activeTopics: [topic],
      topicStates,
      schedulingMode: 'efficient',
      maximumActiveTopics: 5,
    })
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].estimatedMinutes).toBe(30)
    expect(result.remainingCapacity).toBe(90)
    expect(result.topicStates[state.canonicalTopicId].status).toBe('questions_locked')
    expect(result.topicStates[state.canonicalTopicId].learningCompletedAt).toBe('2026-08-03')
  })

  it('remainingLearningMinutes of 0 schedules nothing even when status is learning', () => {
    const topic = makeTopic()
    const state = makeState({ personalizedLearningMinutes: 60, remainingLearningMinutes: 0, status: 'learning' })
    const topicStates = { [state.canonicalTopicId]: state }
    const result = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 120,
      activeTopics: [topic],
      topicStates,
      schedulingMode: 'focused',
      maximumActiveTopics: 5,
    })
    expect(result.tasks).toHaveLength(0)
    expect(result.remainingCapacity).toBe(120)
  })

  it('absent remainingLearningMinutes falls back to personalizedLearningMinutes', () => {
    const topic = makeTopic()
    const state = makeState()
    const topicStates = { [state.canonicalTopicId]: state }
    const result = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 120,
      activeTopics: [topic],
      topicStates,
      schedulingMode: 'efficient',
      maximumActiveTopics: 5,
    })
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].estimatedMinutes).toBe(50)
  })
})

describe('scheduleLearningTasks — cross-day persistent remainingLearningMinutes state model', () => {
  it('persists remaining across calls: 50 min at 30/day → [30, 20], no third task', () => {
    const topic = makeTopic()
    const state = makeState({ personalizedLearningMinutes: 50, remainingLearningMinutes: 50 })
    let topicStates = { [state.canonicalTopicId]: state }
    const allocations = []
    for (const day of ['2026-08-03', '2026-08-04', '2026-08-05']) {
      const r = scheduleLearningTasks({
        dayDate: day,
        usableMinutes: 30,
        activeTopics: [topic],
        topicStates,
        schedulingMode: 'efficient',
        maximumActiveTopics: 5,
      })
      allocations.push(r.tasks.reduce((s, t) => s + t.estimatedMinutes, 0))
      topicStates = r.topicStates
    }
    expect(allocations).toEqual([30, 20, 0])
    const finalState = topicStates[state.canonicalTopicId]
    expect(finalState.remainingLearningMinutes).toBe(0)
    expect(finalState.status).toBe('questions_locked')
    expect(finalState.learningCompletedAt).toBe('2026-08-04')
    expect(finalState.personalizedLearningMinutes).toBe(50)
  })

  it('exact fit: 60 min at 30/day → [30, 30], total 60', () => {
    const topic = makeTopic()
    const state = makeState({ personalizedLearningMinutes: 60, remainingLearningMinutes: 60 })
    let topicStates = { [state.canonicalTopicId]: state }
    const allocations = []
    for (const day of ['2026-08-03', '2026-08-04', '2026-08-05']) {
      const r = scheduleLearningTasks({
        dayDate: day,
        usableMinutes: 30,
        activeTopics: [topic],
        topicStates,
        schedulingMode: 'efficient',
        maximumActiveTopics: 5,
      })
      allocations.push(r.tasks.reduce((s, t) => s + t.estimatedMinutes, 0))
      topicStates = r.topicStates
    }
    expect(allocations).toEqual([30, 30, 0])
    const finalState = topicStates[state.canonicalTopicId]
    expect(finalState.remainingLearningMinutes).toBe(0)
    expect(finalState.status).toBe('questions_locked')
    expect(finalState.personalizedLearningMinutes).toBe(60)
  })

  it('less than one day: 20 min at 30/day → single task of 20', () => {
    const topic = makeTopic()
    const state = makeState({ personalizedLearningMinutes: 20, remainingLearningMinutes: 20 })
    const topicStates = { [state.canonicalTopicId]: state }
    const r = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 30,
      activeTopics: [topic],
      topicStates,
      schedulingMode: 'efficient',
      maximumActiveTopics: 5,
    })
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].estimatedMinutes).toBe(20)
    expect(r.remainingCapacity).toBe(10)
    expect(r.topicStates[state.canonicalTopicId].remainingLearningMinutes).toBe(0)
    expect(r.topicStates[state.canonicalTopicId].status).toBe('questions_locked')
  })

  it('absent remainingLearningMinutes initializes from personalizedLearningMinutes and persists the residual', () => {
    const topic = makeTopic()
    const state = makeState()
    const topicStates = { [state.canonicalTopicId]: state }
    const r = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 30,
      activeTopics: [topic],
      topicStates,
      schedulingMode: 'efficient',
      maximumActiveTopics: 5,
    })
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].estimatedMinutes).toBe(30)
    expect(r.topicStates[state.canonicalTopicId].remainingLearningMinutes).toBe(20)
    expect(r.topicStates[state.canonicalTopicId].personalizedLearningMinutes).toBe(50)
    expect(r.topicStates[state.canonicalTopicId].status).toBe('learning')
  })

  it('multiple topics keep independent remaining state with no overwrite or leakage', () => {
    const topicA = makeTopic({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A' })
    const topicB = makeTopic({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B' })
    const stateA = makeState({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A', personalizedLearningMinutes: 50, remainingLearningMinutes: 50 })
    const stateB = makeState({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B', personalizedLearningMinutes: 20, remainingLearningMinutes: 20 })
    const r = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 60,
      activeTopics: [topicA, topicB],
      topicStates: { a: stateA, b: stateB },
      schedulingMode: 'efficient',
      maximumActiveTopics: 5,
    })
    expect(r.tasks).toHaveLength(2)
    expect(r.tasks[0].estimatedMinutes).toBe(50)
    expect(r.tasks[1].estimatedMinutes).toBe(10)
    expect(r.topicStates.a.remainingLearningMinutes).toBe(0)
    expect(r.topicStates.b.remainingLearningMinutes).toBe(10)
    expect(r.topicStates.a.status).toBe('questions_locked')
    expect(r.topicStates.b.status).toBe('learning')
  })

  it('day-capacity sharing: two topics share days without exceeding capacity; each remaining correct after', () => {
    const topicA = makeTopic({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A' })
    const topicB = makeTopic({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B' })
    const stateA = makeState({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A', personalizedLearningMinutes: 50, remainingLearningMinutes: 50 })
    const stateB = makeState({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B', personalizedLearningMinutes: 50, remainingLearningMinutes: 50 })
    let topicStates = { a: stateA, b: stateB }
    const allocations = []
    for (const day of ['2026-08-03', '2026-08-04']) {
      const r = scheduleLearningTasks({
        dayDate: day,
        usableMinutes: 30,
        activeTopics: [topicA, topicB],
        topicStates,
        schedulingMode: 'efficient',
        maximumActiveTopics: 5,
      })
      allocations.push(r.tasks.reduce((s, t) => s + t.estimatedMinutes, 0))
      expect(allocations[allocations.length - 1]).toBeLessThanOrEqual(30)
      topicStates = r.topicStates
    }
    expect(allocations).toEqual([30, 30])
    expect(topicStates.a.remainingLearningMinutes).toBe(0)
    expect(topicStates.b.remainingLearningMinutes).toBe(40)
    expect(topicStates.a.status).toBe('questions_locked')
    expect(topicStates.b.status).toBe('learning')
  })

  it('remainingLearningMinutes never drops below zero', () => {
    const topic = makeTopic()
    const state = makeState({ personalizedLearningMinutes: 50, remainingLearningMinutes: 10 })
    const r = scheduleLearningTasks({
      dayDate: '2026-08-03',
      usableMinutes: 30,
      activeTopics: [topic],
      topicStates: { [state.canonicalTopicId]: state },
      schedulingMode: 'efficient',
      maximumActiveTopics: 5,
    })
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].estimatedMinutes).toBe(10)
    expect(r.topicStates[state.canonicalTopicId].remainingLearningMinutes).toBe(0)
    expect(r.remainingCapacity).toBe(20)
  })

  it('deterministic: repeated identical input produces identical allocations and ordering', () => {
    const run = () => {
      const topic = makeTopic()
      const state = makeState({ personalizedLearningMinutes: 50, remainingLearningMinutes: 50 })
      let topicStates = { [state.canonicalTopicId]: state }
      const out = []
      for (const day of ['2026-08-03', '2026-08-04', '2026-08-05']) {
        const r = scheduleLearningTasks({
          dayDate: day,
          usableMinutes: 30,
          activeTopics: [topic],
          topicStates,
          schedulingMode: 'efficient',
          maximumActiveTopics: 5,
        })
        out.push(r.tasks.map((t) => ({ date: t.taskDate, minutes: t.estimatedMinutes, displayOrder: t.displayOrder })))
        topicStates = r.topicStates
      }
      return out
    }
    expect(run()).toEqual(run())
  })
})
