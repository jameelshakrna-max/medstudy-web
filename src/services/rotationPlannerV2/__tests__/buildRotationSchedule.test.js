import { describe, it, expect } from 'vitest'
import { buildRotationSchedule } from '../buildRotationSchedule.js'

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
    incorrectQuestionsRemaining: 0,
    ...overrides,
  }
}

function makePlanConfig(overrides = {}) {
  return {
    rotationId: 'cardiology',
    sourceId: 'step-up-medicine-6e-2024',
    startDate: '2026-08-01',
    endDate: '2026-08-07',
    examDate: null,
    studyStyle: 'active',
    schedulingMode: 'efficient',
    questionStartRule: 'next_available_day',
    maximumActiveTopics: 5,
    availabilityByWeekday: [
      { weekday: 0, availableMinutes: 0, isDayOff: true },
      { weekday: 1, availableMinutes: 240, isDayOff: false },
      { weekday: 2, availableMinutes: 240, isDayOff: false },
      { weekday: 3, availableMinutes: 240, isDayOff: false },
      { weekday: 4, availableMinutes: 240, isDayOff: false },
      { weekday: 5, availableMinutes: 240, isDayOff: false },
      { weekday: 6, availableMinutes: 0, isDayOff: true },
    ],
    blockedDates: [],
    bufferPercentage: 0,
    preferredQuestionsPerDay: 30,
    minimumQuestionsPerSession: 10,
    maximumQuestionsPerDay: 50,
    averageMinutesPerQuestion: 1.5,
    topics: [makeTopic()],
    dueReviewMinutesByDate: {},
    personalSourcePaceMultiplier: 1.0,
    examReviewWindowDays: 0,
    mixedReviewQuestionsPerDay: 0,
    ...overrides,
  }
}

describe('buildRotationSchedule — integration', () => {
  it('two hours per day produces valid schedule', () => {
    const config = makePlanConfig({
      availabilityByWeekday: [
        { weekday: 0, availableMinutes: 0, isDayOff: true },
        { weekday: 1, availableMinutes: 120, isDayOff: false },
        { weekday: 2, availableMinutes: 120, isDayOff: false },
        { weekday: 3, availableMinutes: 120, isDayOff: false },
        { weekday: 4, availableMinutes: 120, isDayOff: false },
        { weekday: 5, availableMinutes: 120, isDayOff: false },
        { weekday: 6, availableMinutes: 0, isDayOff: true },
      ],
    })
    const result = buildRotationSchedule(config)
    expect(result.tasks.length).toBeGreaterThan(0)
    expect(result.feasibility.feasible).toBe(true)

    const tasksByDay = {}
    for (const task of result.tasks) {
      if (!tasksByDay[task.taskDate]) tasksByDay[task.taskDate] = []
      tasksByDay[task.taskDate].push(task)
    }
    for (const [date, tasks] of Object.entries(tasksByDay)) {
      const sum = tasks.reduce((s, t) => s + t.estimatedMinutes, 0)
      expect(sum).toBeLessThanOrEqual(120)
    }
  })

  it('five hours per day produces fewer days', () => {
    const heavyTopics = [
      makeTopic({ canonicalTopicId: 'a', sourceTopicId: 'a', title: 'A', learningMinutes: { focused: 30, activeLow: 40, activeExpected: 100, activeHigh: 60, detailedNotes: 70 }, uworldRemainingQuestions: 40 }),
      makeTopic({ canonicalTopicId: 'b', sourceTopicId: 'b', title: 'B', learningMinutes: { focused: 30, activeLow: 40, activeExpected: 100, activeHigh: 60, detailedNotes: 70 }, uworldRemainingQuestions: 40 }),
      makeTopic({ canonicalTopicId: 'c', sourceTopicId: 'c', title: 'C', learningMinutes: { focused: 30, activeLow: 40, activeExpected: 100, activeHigh: 60, detailedNotes: 70 }, uworldRemainingQuestions: 40 }),
      makeTopic({ canonicalTopicId: 'd', sourceTopicId: 'd', title: 'D', learningMinutes: { focused: 30, activeLow: 40, activeExpected: 100, activeHigh: 60, detailedNotes: 70 }, uworldRemainingQuestions: 40 }),
    ]
    const config300 = makePlanConfig({
      topics: heavyTopics,
      availabilityByWeekday: [
        { weekday: 0, availableMinutes: 0, isDayOff: true },
        { weekday: 1, availableMinutes: 300, isDayOff: false },
        { weekday: 2, availableMinutes: 300, isDayOff: false },
        { weekday: 3, availableMinutes: 300, isDayOff: false },
        { weekday: 4, availableMinutes: 300, isDayOff: false },
        { weekday: 5, availableMinutes: 300, isDayOff: false },
        { weekday: 6, availableMinutes: 0, isDayOff: true },
      ],
    })
    const config120 = makePlanConfig({
      topics: heavyTopics,
      availabilityByWeekday: [
        { weekday: 0, availableMinutes: 0, isDayOff: true },
        { weekday: 1, availableMinutes: 120, isDayOff: false },
        { weekday: 2, availableMinutes: 120, isDayOff: false },
        { weekday: 3, availableMinutes: 120, isDayOff: false },
        { weekday: 4, availableMinutes: 120, isDayOff: false },
        { weekday: 5, availableMinutes: 120, isDayOff: false },
        { weekday: 6, availableMinutes: 0, isDayOff: true },
      ],
    })
    const result300 = buildRotationSchedule(config300)
    const result120 = buildRotationSchedule(config120)
    const days300 = new Set(result300.tasks.map((t) => t.taskDate)).size
    const days120 = new Set(result120.tasks.map((t) => t.taskDate)).size
    expect(days300).toBeLessThan(days120)
  })

  it('one full day off has no tasks', () => {
    const config = makePlanConfig()
    const result = buildRotationSchedule(config)
    const sundayTasks = result.tasks.filter((t) => t.taskDate === '2026-08-02')
    expect(sundayTasks.length).toBe(0)
    const saturdayTasks = result.tasks.filter((t) => t.taskDate === '2026-08-01')
    expect(saturdayTasks.length).toBe(0)
  })

  it('irregular weekday availability respected', () => {
    const config = makePlanConfig({
      availabilityByWeekday: [
        { weekday: 0, availableMinutes: 0, isDayOff: true },
        { weekday: 1, availableMinutes: 60, isDayOff: false },
        { weekday: 2, availableMinutes: 240, isDayOff: false },
        { weekday: 3, availableMinutes: 60, isDayOff: false },
        { weekday: 4, availableMinutes: 240, isDayOff: false },
        { weekday: 5, availableMinutes: 60, isDayOff: false },
        { weekday: 6, availableMinutes: 0, isDayOff: true },
      ],
    })
    const result = buildRotationSchedule(config)
    const mondayTasks = result.tasks.filter((t) => t.taskDate === '2026-08-03')
    const tuesdayTasks = result.tasks.filter((t) => t.taskDate === '2026-08-04')
    const mondayMin = mondayTasks.reduce((s, t) => s + t.estimatedMinutes, 0)
    const tuesdayMin = tuesdayTasks.reduce((s, t) => s + t.estimatedMinutes, 0)
    expect(mondayMin).toBeLessThanOrEqual(60)
    expect(tuesdayMin).toBeLessThanOrEqual(240)
  })

  it('flashcards consume capacity', () => {
    const config = makePlanConfig({
      dueReviewMinutesByDate: { '2026-08-03': 90 },
    })
    const result = buildRotationSchedule(config)
    const flashTasks = result.tasks.filter(
      (t) => t.taskDate === '2026-08-03' && t.taskType === 'flashcard_review'
    )
    expect(flashTasks.length).toBe(1)
    expect(flashTasks[0].estimatedMinutes).toBe(90)
  })

  it('blocked dates have no tasks', () => {
    const config = makePlanConfig({
      blockedDates: ['2026-08-04'],
    })
    const result = buildRotationSchedule(config)
    const blockedTasks = result.tasks.filter((t) => t.taskDate === '2026-08-04')
    expect(blockedTasks.length).toBe(0)
  })

  it('consecutive blocked dates have no tasks', () => {
    const config = makePlanConfig({
      blockedDates: ['2026-08-03', '2026-08-04', '2026-08-05'],
    })
    const result = buildRotationSchedule(config)
    const blockedTasks = result.tasks.filter(
      (t) => t.taskDate === '2026-08-03' || t.taskDate === '2026-08-04' || t.taskDate === '2026-08-05'
    )
    expect(blockedTasks.length).toBe(0)
  })

  it('next available day skips blocked date for UWorld', () => {
    const config = makePlanConfig({
      schedulingMode: 'focused',
      questionStartRule: 'next_available_day',
      topics: [makeTopic({ learningMinutes: { focused: 60, activeLow: 40, activeExpected: 50, activeHigh: 60, detailedNotes: 70 } })],
      blockedDates: ['2026-08-04'],
    })
    const result = buildRotationSchedule(config)
    const aug3 = result.tasks.filter((t) => t.taskDate === '2026-08-03')
    const aug3Learning = aug3.filter((t) => t.taskType === 'learning')
    const aug3Uworld = aug3.filter((t) => t.taskType === 'uworld_questions')
    if (aug3Learning.length > 0 && aug3Uworld.length > 0) {
      expect(aug3Uworld.length).toBe(0)
    }
  })

  it('shared topic already completed not scheduled again', () => {
    const config = makePlanConfig({
      topics: [
        makeTopic({
          canonicalTopicId: 'shared.topic-a',
          sourceTopicId: 'source1.topic-a',
          sharedTopicKey: 'shared.topic',
          alreadyCompletedLearningPercentage: 1.0,
        }),
        makeTopic({
          canonicalTopicId: 'shared.topic-b',
          sourceTopicId: 'source2.topic-a',
          sharedTopicKey: 'shared.topic',
          alreadyCompletedLearningPercentage: 0,
        }),
      ],
    })
    const result = buildRotationSchedule(config)
    const topicBLearning = result.tasks.filter(
      (t) => t.canonicalTopicId === 'shared.topic-b' && t.taskType === 'learning'
    )
    expect(topicBLearning.length).toBe(0)
  })

  it('plan cannot fit returns partial schedule', () => {
    const config = makePlanConfig({
      topics: [
        makeTopic({ learningMinutes: { focused: 30, activeLow: 40, activeExpected: 5000, activeHigh: 60, detailedNotes: 70 } }),
      ],
      availabilityByWeekday: [
        { weekday: 0, availableMinutes: 0, isDayOff: true },
        { weekday: 1, availableMinutes: 60, isDayOff: false },
        { weekday: 2, availableMinutes: 60, isDayOff: false },
        { weekday: 3, availableMinutes: 60, isDayOff: false },
        { weekday: 4, availableMinutes: 60, isDayOff: false },
        { weekday: 5, availableMinutes: 60, isDayOff: false },
        { weekday: 6, availableMinutes: 0, isDayOff: true },
      ],
    })
    const result = buildRotationSchedule(config)
    expect(result.feasibility.feasible).toBe(false)
    expect(result.tasks.length).toBeGreaterThan(0)
    expect(result.feasibility.missingCapacity).toBeGreaterThan(0)
  })

  it('exam review window adds mixed_review tasks', () => {
    const config = makePlanConfig({
      examDate: '2026-08-06',
      examReviewWindowDays: 2,
      mixedReviewQuestionsPerDay: 20,
      topics: [makeTopic({ uworldRemainingQuestions: 0 })],
    })
    const result = buildRotationSchedule(config)
    const mixedTasks = result.tasks.filter((t) => t.taskType === 'mixed_review')
    expect(mixedTasks.length).toBeGreaterThan(0)
    expect(mixedTasks[0].provider).toBe('uworld')
    expect(mixedTasks[0].mode).toBe('timed')
    expect(mixedTasks[0].questionPool).toBe('mixed')
  })

  it('efficient mode with two active topics', () => {
    const config = makePlanConfig({
      schedulingMode: 'efficient',
      maximumActiveTopics: 2,
      topics: [
        makeTopic({ canonicalTopicId: 'topic-a', sourceTopicId: 'topic-a', learningMinutes: { focused: 30, activeLow: 40, activeExpected: 50, activeHigh: 60, detailedNotes: 70 } }),
        makeTopic({ canonicalTopicId: 'topic-b', sourceTopicId: 'topic-b', learningMinutes: { focused: 30, activeLow: 40, activeExpected: 50, activeHigh: 60, detailedNotes: 70 } }),
      ],
    })
    const result = buildRotationSchedule(config)
    const learningTasks = result.tasks.filter((t) => t.taskType === 'learning')
    const topicATasks = learningTasks.filter((t) => t.canonicalTopicId === 'topic-a')
    const topicBTasks = learningTasks.filter((t) => t.canonicalTopicId === 'topic-b')
    expect(topicATasks.length).toBeGreaterThan(0)
    expect(topicBTasks.length).toBeGreaterThan(0)
  })

  it('no task exceeds daily capacity', () => {
    const config = makePlanConfig({
      availabilityByWeekday: [
        { weekday: 0, availableMinutes: 0, isDayOff: true },
        { weekday: 1, availableMinutes: 120, isDayOff: false },
        { weekday: 2, availableMinutes: 120, isDayOff: false },
        { weekday: 3, availableMinutes: 120, isDayOff: false },
        { weekday: 4, availableMinutes: 120, isDayOff: false },
        { weekday: 5, availableMinutes: 120, isDayOff: false },
        { weekday: 6, availableMinutes: 0, isDayOff: true },
      ],
      topics: [
        makeTopic({ canonicalTopicId: 'topic-a', sourceTopicId: 'topic-a' }),
        makeTopic({ canonicalTopicId: 'topic-b', sourceTopicId: 'topic-b' }),
        makeTopic({ canonicalTopicId: 'topic-c', sourceTopicId: 'topic-c' }),
      ],
    })
    const result = buildRotationSchedule(config)
    const tasksByDay = {}
    for (const task of result.tasks) {
      if (!tasksByDay[task.taskDate]) tasksByDay[task.taskDate] = []
      tasksByDay[task.taskDate].push(task)
    }
    for (const [date, tasks] of Object.entries(tasksByDay)) {
      const sum = tasks.reduce((s, t) => s + t.estimatedMinutes, 0)
      expect(sum).toBeLessThanOrEqual(120)
    }
  })

  it('deterministic output for identical inputs', () => {
    const config = makePlanConfig()
    const r1 = buildRotationSchedule(config)
    const r2 = buildRotationSchedule(config)
    expect(r1.tasks.length).toBe(r2.tasks.length)
    for (let i = 0; i < r1.tasks.length; i++) {
      expect(r1.tasks[i].taskDate).toBe(r2.tasks[i].taskDate)
      expect(r1.tasks[i].taskType).toBe(r2.tasks[i].taskType)
      expect(r1.tasks[i].canonicalTopicId).toBe(r2.tasks[i].canonicalTopicId)
      expect(r1.tasks[i].estimatedMinutes).toBe(r2.tasks[i].estimatedMinutes)
    }
  })

  it('original topic inputs are not mutated', () => {
    const topic = makeTopic()
    const topicCopy = JSON.parse(JSON.stringify(topic))
    const config = makePlanConfig({ topics: [topic] })
    buildRotationSchedule(config)
    expect(topic).toEqual(topicCopy)
  })

  it('returns empty result for invalid config', () => {
    const result = buildRotationSchedule({})
    expect(result.tasks).toEqual([])
    expect(result.feasibility.feasible).toBe(false)
  })
})

describe('buildRotationSchedule — incorrect review state tracking', () => {
  function makeIncorrectConfig(overrides = {}) {
    return makePlanConfig({
      startDate: '2026-08-03',
      endDate: '2026-08-07',
      preferredQuestionsPerDay: 10,
      minimumQuestionsPerSession: 5,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      topics: [
        makeTopic({
          uworldRemainingQuestions: 0,
          incorrectQuestionsRemaining: 40,
          alreadyCompletedLearningPercentage: 1.0,
        }),
      ],
      ...overrides,
    })
  }

  function incorrectTasks(result) {
    return result.tasks
      .filter((t) => t.taskType === 'incorrect_review')
      .sort((a, b) => (a.taskDate < b.taskDate ? -1 : 1))
  }

  function stateFor(result, canonicalTopicId) {
    return result.topicStates.find((s) => s.canonicalTopicId === canonicalTopicId)
  }

  it('total incorrect review targetCount equals the original remaining count', () => {
    const result = buildRotationSchedule(makeIncorrectConfig())
    const tasks = incorrectTasks(result)
    const total = tasks.reduce((s, t) => s + t.targetCount, 0)
    expect(total).toBe(40)
  })

  it('daily incorrect review allocations respect remaining and capacity', () => {
    const result = buildRotationSchedule(makeIncorrectConfig())
    const counts = incorrectTasks(result).map((t) => t.targetCount)
    expect(counts).toEqual([10, 10, 10, 10])
    for (const task of incorrectTasks(result)) {
      expect(task.targetCount).toBeGreaterThan(0)
      expect(task.targetCount).toBeLessThanOrEqual(10)
    }
  })

  it('final topic state has incorrectQuestionsRemaining at zero', () => {
    const result = buildRotationSchedule(makeIncorrectConfig())
    const state = stateFor(result, 'cardiology.hypertension')
    expect(state.incorrectQuestionsRemaining).toBe(0)
  })

  it('produces no incorrect review task after remaining reaches zero', () => {
    const result = buildRotationSchedule(makeIncorrectConfig())
    const tasks = incorrectTasks(result)
    const counts = tasks.map((t) => t.targetCount)
    const total = counts.reduce((s, c) => s + c, 0)
    expect(total).toBe(40)
    expect(counts).toEqual([10, 10, 10, 10])
    const lastDayTasks = tasks.filter((t) => t.taskDate === '2026-08-07')
    expect(lastDayTasks.length).toBe(0)
  })

  it('exact-fit capacity schedules once with the correct count', () => {
    const result = buildRotationSchedule(
      makeIncorrectConfig({
        startDate: '2026-08-03',
        endDate: '2026-08-03',
        topics: [
          makeTopic({
            uworldRemainingQuestions: 0,
            incorrectQuestionsRemaining: 10,
            alreadyCompletedLearningPercentage: 1.0,
          }),
        ],
      })
    )
    const tasks = incorrectTasks(result)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].targetCount).toBe(10)
  })

  it('zero remaining produces no incorrect review task', () => {
    const result = buildRotationSchedule(
      makeIncorrectConfig({
        topics: [
          makeTopic({
            uworldRemainingQuestions: 0,
            incorrectQuestionsRemaining: 0,
            alreadyCompletedLearningPercentage: 1.0,
          }),
        ],
      })
    )
    expect(incorrectTasks(result)).toHaveLength(0)
  })

  it('multiple topics keep independent remaining state', () => {
    const result = buildRotationSchedule(
      makeIncorrectConfig({
        topics: [
          makeTopic({
            canonicalTopicId: 'topic-a',
            sourceTopicId: 'topic-a',
            title: 'A',
            uworldRemainingQuestions: 0,
            incorrectQuestionsRemaining: 15,
            alreadyCompletedLearningPercentage: 1.0,
          }),
          makeTopic({
            canonicalTopicId: 'topic-b',
            sourceTopicId: 'topic-b',
            title: 'B',
            uworldRemainingQuestions: 0,
            incorrectQuestionsRemaining: 5,
            alreadyCompletedLearningPercentage: 1.0,
          }),
        ],
      })
    )
    const tasks = incorrectTasks(result)
    const totalA = tasks.filter((t) => t.canonicalTopicId === 'topic-a').reduce((s, t) => s + t.targetCount, 0)
    const totalB = tasks.filter((t) => t.canonicalTopicId === 'topic-b').reduce((s, t) => s + t.targetCount, 0)
    expect(totalA).toBe(15)
    expect(totalB).toBe(5)
    expect(stateFor(result, 'topic-a').incorrectQuestionsRemaining).toBe(0)
    expect(stateFor(result, 'topic-b').incorrectQuestionsRemaining).toBe(0)
  })

  it('repeated runs produce identical incorrect review task arrays', () => {
    const config = makeIncorrectConfig()
    const r1 = buildRotationSchedule(config)
    const r2 = buildRotationSchedule(config)
    const t1 = incorrectTasks(r1)
    const t2 = incorrectTasks(r2)
    expect(t1.length).toBe(t2.length)
    for (let i = 0; i < t1.length; i++) {
      expect(t1[i]).toEqual(t2[i])
    }
  })

  it('state restoration schedules only the residual incorrect review count', () => {
    const result = buildRotationSchedule(makeIncorrectConfig(), {
      initialTopicStates: {
        'cardiology.hypertension': {
          canonicalTopicId: 'cardiology.hypertension',
          remainingUworldQuestions: 0,
          incorrectQuestionsRemaining: 15,
        },
      },
    })
    const tasks = incorrectTasks(result)
    const total = tasks.reduce((s, t) => s + t.targetCount, 0)
    expect(total).toBe(15)
    expect(stateFor(result, 'cardiology.hypertension').incorrectQuestionsRemaining).toBe(0)
  })
})

describe('buildRotationSchedule — learning remainder restoration', () => {
  it('initialTopicStates.remainingLearningMinutes schedules only the residual', () => {
    const result = buildRotationSchedule(makePlanConfig(), {
      initialTopicStates: {
        'cardiology.hypertension': {
          canonicalTopicId: 'cardiology.hypertension',
          personalizedLearningMinutes: 60,
          remainingLearningMinutes: 30,
          remainingUworldQuestions: 0,
          status: 'learning',
        },
      },
    })
    const learning = result.tasks.filter((t) => t.taskType === 'learning')
    const total = learning.reduce((s, t) => s + t.estimatedMinutes, 0)
    expect(total).toBe(30)
    expect(learning).toHaveLength(1)
    expect(learning[0].estimatedMinutes).toBe(30)
  })

  it('initialTopicStates.remainingLearningMinutes of 0 schedules no learning', () => {
    const result = buildRotationSchedule(makePlanConfig(), {
      initialTopicStates: {
        'cardiology.hypertension': {
          canonicalTopicId: 'cardiology.hypertension',
          personalizedLearningMinutes: 60,
          remainingLearningMinutes: 0,
          remainingUworldQuestions: 0,
          status: 'completed',
        },
      },
    })
    const learning = result.tasks.filter((t) => t.taskType === 'learning')
    expect(learning).toHaveLength(0)
  })

  it('absent remainingLearningMinutes falls back to personalizedLearningMinutes', () => {
    const result = buildRotationSchedule(makePlanConfig(), {
      initialTopicStates: {
        'cardiology.hypertension': {
          canonicalTopicId: 'cardiology.hypertension',
          personalizedLearningMinutes: 50,
          remainingUworldQuestions: 0,
          status: 'not_started',
        },
      },
    })
    const learning = result.tasks.filter((t) => t.taskType === 'learning')
    const total = learning.reduce((s, t) => s + t.estimatedMinutes, 0)
    expect(total).toBe(50)
  })
})

describe('buildRotationSchedule — cross-day learning over-scheduling regression', () => {
  function makeCapacityConfig(overrides = {}) {
    return makePlanConfig({
      startDate: '2026-08-03',
      endDate: '2026-08-07',
      availabilityByWeekday: [
        { weekday: 0, availableMinutes: 30, isDayOff: false },
        { weekday: 1, availableMinutes: 30, isDayOff: false },
        { weekday: 2, availableMinutes: 30, isDayOff: false },
        { weekday: 3, availableMinutes: 30, isDayOff: false },
        { weekday: 4, availableMinutes: 30, isDayOff: false },
        { weekday: 5, availableMinutes: 30, isDayOff: false },
        { weekday: 6, availableMinutes: 30, isDayOff: false },
      ],
      topics: [makeTopic({ uworldRemainingQuestions: 0 })],
      ...overrides,
    })
  }

  function learningTasks(result) {
    return result.tasks
      .filter((t) => t.taskType === 'learning')
      .sort((a, b) => (a.taskDate < b.taskDate ? -1 : 1))
  }

  function stateFor(result, canonicalTopicId) {
    return result.topicStates.find((s) => s.canonicalTopicId === canonicalTopicId)
  }

  it('50 min at 30/day → allocations [30, 20], total 50, no third task', () => {
    const result = buildRotationSchedule(makeCapacityConfig())
    const tasks = learningTasks(result)
    const allocations = tasks.map((t) => t.estimatedMinutes)
    expect(allocations).toEqual([30, 20])
    const total = tasks.reduce((s, t) => s + t.estimatedMinutes, 0)
    expect(total).toBe(50)
    expect(tasks).toHaveLength(2)
    const state = stateFor(result, 'cardiology.hypertension')
    expect(state.remainingLearningMinutes).toBe(0)
    expect(state.status).toBe('questions_locked')
    expect(state.learningCompletedAt).toBe('2026-08-04')
    expect(state.personalizedLearningMinutes).toBe(50)
  })

  it('exact fit: 60 min at 30/day → [30, 30], total 60', () => {
    const config = makeCapacityConfig({
      topics: [makeTopic({
        uworldRemainingQuestions: 0,
        learningMinutes: { focused: 30, activeLow: 40, activeExpected: 60, activeHigh: 60, detailedNotes: 70 },
      })],
    })
    const result = buildRotationSchedule(config)
    const tasks = learningTasks(result)
    expect(tasks.map((t) => t.estimatedMinutes)).toEqual([30, 30])
    const total = tasks.reduce((s, t) => s + t.estimatedMinutes, 0)
    expect(total).toBe(60)
    const state = stateFor(result, 'cardiology.hypertension')
    expect(state.remainingLearningMinutes).toBe(0)
    expect(state.status).toBe('questions_locked')
    expect(state.learningCompletedAt).toBe('2026-08-04')
  })

  it('less than one day: 20 min at 30/day → single task of 20', () => {
    const config = makeCapacityConfig({
      topics: [makeTopic({
        uworldRemainingQuestions: 0,
        learningMinutes: { focused: 30, activeLow: 40, activeExpected: 20, activeHigh: 60, detailedNotes: 70 },
      })],
    })
    const result = buildRotationSchedule(config)
    const tasks = learningTasks(result)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].estimatedMinutes).toBe(20)
    expect(tasks[0].taskDate).toBe('2026-08-03')
    const state = stateFor(result, 'cardiology.hypertension')
    expect(state.remainingLearningMinutes).toBe(0)
    expect(state.status).toBe('questions_locked')
    expect(state.learningCompletedAt).toBe('2026-08-03')
  })

  it('zero remaining produces no learning task and keeps the immutable baseline', () => {
    const result = buildRotationSchedule(makeCapacityConfig(), {
      initialTopicStates: {
        'cardiology.hypertension': {
          canonicalTopicId: 'cardiology.hypertension',
          personalizedLearningMinutes: 50,
          remainingLearningMinutes: 0,
          remainingUworldQuestions: 0,
          status: 'learning',
        },
      },
    })
    expect(learningTasks(result)).toHaveLength(0)
    const state = stateFor(result, 'cardiology.hypertension')
    expect(state.personalizedLearningMinutes).toBe(50)
    expect(state.remainingLearningMinutes).toBe(0)
  })

  it('partial-learning recalculation: immutable baseline 60, remaining 30, only 30 scheduled', () => {
    const result = buildRotationSchedule(makeCapacityConfig(), {
      initialTopicStates: {
        'cardiology.hypertension': {
          canonicalTopicId: 'cardiology.hypertension',
          personalizedLearningMinutes: 60,
          remainingLearningMinutes: 30,
          remainingUworldQuestions: 0,
          status: 'learning',
        },
      },
    })
    const tasks = learningTasks(result)
    const total = tasks.reduce((s, t) => s + t.estimatedMinutes, 0)
    expect(total).toBe(30)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].estimatedMinutes).toBe(30)
    const state = stateFor(result, 'cardiology.hypertension')
    expect(state.personalizedLearningMinutes).toBe(60)
    expect(state.remainingLearningMinutes).toBe(0)
    expect(state.status).toBe('questions_locked')
  })

  it('multiple topics keep independent remaining state across days', () => {
    const config = makeCapacityConfig({
      topics: [
        makeTopic({ canonicalTopicId: 'topic-a', sourceTopicId: 'topic-a', title: 'A', uworldRemainingQuestions: 0 }),
        makeTopic({ canonicalTopicId: 'topic-b', sourceTopicId: 'topic-b', title: 'B', uworldRemainingQuestions: 0 }),
      ],
    })
    const result = buildRotationSchedule(config)
    const aTotal = learningTasks(result).filter((t) => t.canonicalTopicId === 'topic-a').reduce((s, t) => s + t.estimatedMinutes, 0)
    const bTotal = learningTasks(result).filter((t) => t.canonicalTopicId === 'topic-b').reduce((s, t) => s + t.estimatedMinutes, 0)
    expect(aTotal).toBe(50)
    expect(bTotal).toBe(50)
    expect(stateFor(result, 'topic-a').remainingLearningMinutes).toBe(0)
    expect(stateFor(result, 'topic-b').remainingLearningMinutes).toBe(0)
    expect(stateFor(result, 'topic-a').status).toBe('questions_locked')
    expect(stateFor(result, 'topic-b').status).toBe('questions_locked')
  })

  it('blocked dates produce no learning allocation; remaining preserved for next eligible date', () => {
    const result = buildRotationSchedule(makeCapacityConfig({ blockedDates: ['2026-08-04', '2026-08-05'] }))
    const tasks = learningTasks(result)
    expect(tasks.map((t) => t.estimatedMinutes)).toEqual([30, 20])
    expect(tasks[0].taskDate).toBe('2026-08-03')
    expect(tasks[1].taskDate).toBe('2026-08-06')
    const state = stateFor(result, 'cardiology.hypertension')
    expect(state.remainingLearningMinutes).toBe(0)
    expect(state.status).toBe('questions_locked')
  })

  it('deterministic: repeated identical input produces identical learning allocations', () => {
    const t1 = learningTasks(buildRotationSchedule(makeCapacityConfig())).map((t) => [t.taskDate, t.estimatedMinutes])
    const t2 = learningTasks(buildRotationSchedule(makeCapacityConfig())).map((t) => [t.taskDate, t.estimatedMinutes])
    expect(t1).toEqual(t2)
    expect(t1).toEqual([['2026-08-03', 30], ['2026-08-04', 20]])
  })

  it('shared canonical topic schedules the workload once, not once per source alias', () => {
    const config = makeCapacityConfig({
      topics: [
        makeTopic({ canonicalTopicId: 'shared.topic', sourceTopicId: 'src1.shared', normalizedTopicId: 'src::src1.shared', uworldRemainingQuestions: 0 }),
        makeTopic({ canonicalTopicId: 'shared.topic', sourceTopicId: 'src2.shared', normalizedTopicId: 'src::src2.shared', uworldRemainingQuestions: 0 }),
      ],
    })
    const result = buildRotationSchedule(config)
    const tasks = learningTasks(result)
    const total = tasks.reduce((s, t) => s + t.estimatedMinutes, 0)
    expect(total).toBe(50)
    expect(tasks.map((t) => t.estimatedMinutes)).toEqual([30, 20])
    const state = stateFor(result, 'shared.topic')
    expect(state.remainingLearningMinutes).toBe(0)
  })

  it('pinned learning tasks decrement remainingLearningMinutes without touching the baseline', () => {
    const result = buildRotationSchedule(makeCapacityConfig(), {
      pinnedTasks: [{
        taskDate: '2026-08-03',
        taskType: 'learning',
        canonicalTopicId: 'cardiology.hypertension',
        estimatedMinutes: 10,
      }],
    })
    const tasks = learningTasks(result)
    expect(tasks.map((t) => t.estimatedMinutes)).toEqual([20, 20])
    const total = tasks.reduce((s, t) => s + t.estimatedMinutes, 0)
    expect(total).toBe(40)
    const state = stateFor(result, 'cardiology.hypertension')
    expect(state.personalizedLearningMinutes).toBe(50)
    expect(state.remainingLearningMinutes).toBe(0)
    expect(state.status).toBe('questions_locked')
    expect(state.learningCompletedAt).toBe('2026-08-04')
  })
})

describe('buildRotationSchedule — learn-before-UWorld unlock modes', () => {
  function makeCapacityConfig(overrides = {}) {
    return {
      rotationId: 'cardiology',
      sourceId: 'step-up-medicine-6e-2024',
      startDate: '2026-08-03',
      endDate: '2026-08-07',
      examDate: null,
      studyStyle: 'active',
      schedulingMode: 'efficient',
      questionStartRule: 'next_available_day',
      maximumActiveTopics: 5,
      availabilityByWeekday: [
        { weekday: 0, availableMinutes: 30, isDayOff: false },
        { weekday: 1, availableMinutes: 30, isDayOff: false },
        { weekday: 2, availableMinutes: 30, isDayOff: false },
        { weekday: 3, availableMinutes: 30, isDayOff: false },
        { weekday: 4, availableMinutes: 30, isDayOff: false },
        { weekday: 5, availableMinutes: 30, isDayOff: false },
        { weekday: 6, availableMinutes: 30, isDayOff: false },
      ],
      blockedDates: [],
      bufferPercentage: 0,
      preferredQuestionsPerDay: 30,
      minimumQuestionsPerSession: 10,
      maximumQuestionsPerDay: 50,
      averageMinutesPerQuestion: 1.5,
      topics: [makeTopic({ uworldRemainingQuestions: 20 })],
      dueReviewMinutesByDate: {},
      personalSourcePaceMultiplier: 1.0,
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
      ...overrides,
    }
  }

  function learningTasks(result) {
    return result.tasks
      .filter((t) => t.taskType === 'learning')
      .sort((a, b) => (a.taskDate < b.taskDate ? -1 : 1))
  }

  function stateFor(result, canonicalTopicId) {
    return result.topicStates.find((s) => s.canonicalTopicId === canonicalTopicId)
  }

  it('learning_completed: UWorld stays locked while remaining > 0, unlocks only after it reaches 0', () => {
    const result = buildRotationSchedule(makeCapacityConfig())
    const learning = learningTasks(result)
    expect(learning.map((t) => t.estimatedMinutes)).toEqual([30, 20])
    const uworldDates = result.tasks.filter((t) => t.taskType === 'uworld_questions').map((t) => t.taskDate)
    expect(uworldDates.length).toBeGreaterThan(0)
    for (const d of uworldDates) {
      expect(d > '2026-08-04').toBe(true)
    }
    const state = stateFor(result, 'cardiology.hypertension')
    expect(state.remainingLearningMinutes).toBe(0)
    expect(state.learningCompletedAt).toBe('2026-08-04')
    expect(state.questionsUnlockedAt >= '2026-08-04').toBe(true)
    expect(state.status).toBe('completed')
  })

  it('learning_started: partial topic keeps scheduling learning and is never over-scheduled', () => {
    const result = buildRotationSchedule(makeCapacityConfig(), {
      initialTopicStates: {
        'cardiology.hypertension': {
          canonicalTopicId: 'cardiology.hypertension',
          personalizedLearningMinutes: 60,
          remainingLearningMinutes: 50,
          remainingUworldQuestions: 0,
          status: 'learning',
        },
      },
    })
    const learning = learningTasks(result)
    expect(learning.map((t) => t.estimatedMinutes)).toEqual([30, 20])
    const total = learning.reduce((s, t) => s + t.estimatedMinutes, 0)
    expect(total).toBe(50)
    const state = stateFor(result, 'cardiology.hypertension')
    expect(state.personalizedLearningMinutes).toBe(60)
    expect(state.remainingLearningMinutes).toBe(0)
    expect(state.status).toBe('questions_locked')
  })
})

describe('buildRotationSchedule — large scale', () => {
  function addWeek(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d + 7))
    return dt.toISOString().slice(0, 10)
  }

  function makeLargeScaleConfig() {
    const topics50 = Array.from({ length: 50 }, (_, i) =>
      makeTopic({
        canonicalTopicId: 'topic-' + i,
        sourceTopicId: 'topic-' + i,
        title: 'Topic ' + i,
        learningMinutes: { focused: 30, activeLow: 40, activeExpected: 60, activeHigh: 80, detailedNotes: 70 },
        uworldRemainingQuestions: 40,
        prerequisiteTopicIds: [],
      })
    )

    const dueReviewMinutesByDate = {}
    const dueReviewCardCountByDate = {}
    const topicBreakdownByDate = {}

    const dates = []
    let date = '2026-01-05'
    while (date <= '2026-12-31' && dates.length < 52) {
      dates.push(date)
      date = addWeek(date)
    }

    for (const d of dates) {
      dueReviewCardCountByDate[d] = 40
      dueReviewMinutesByDate[d] = 40 * 1.5
      topicBreakdownByDate[d] = Array.from({ length: 5 }, (_, j) => ({
        normalizedTopicId: 'step-up-medicine-6e-2024::topic-' + j,
        groupId: 'G' + j,
        dueCardCount: 8,
        deckNames: [],
      }))
    }

    return makePlanConfig({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      maximumActiveTopics: 10,
      topics: topics50,
      dueReviewMinutesByDate,
      dueReviewCardCountByDate,
      topicBreakdownByDate,
    })
  }

  it('365 days x 50 topics is feasible with tasks produced', () => {
    const result = buildRotationSchedule(makeLargeScaleConfig())
    expect(result.feasibility.feasible).toBe(true)
    expect(result.tasks.length).toBeGreaterThan(0)
  }, 30000)

  it('deterministic at scale across runs', () => {
    const config = makeLargeScaleConfig()
    const run1 = buildRotationSchedule(structuredClone(config))
    const run2 = buildRotationSchedule(structuredClone(config))
    expect(run2.tasks).toEqual(run1.tasks)
    expect(run2.topicStates).toEqual(run1.topicStates)
  }, 30000)

  it('every scheduled day respects the 240-minute weekday budget', () => {
    const result = buildRotationSchedule(makeLargeScaleConfig())
    const tasksByDay = {}
    for (const task of result.tasks) {
      if (!tasksByDay[task.taskDate]) tasksByDay[task.taskDate] = []
      tasksByDay[task.taskDate].push(task)
    }
    for (const [date, tasks] of Object.entries(tasksByDay)) {
      const sum = tasks.reduce((s, t) => s + t.estimatedMinutes, 0)
      expect(sum).toBeLessThanOrEqual(240)
    }
  }, 30000)

  it('builds the schedule in bounded wall-clock time', () => {
    const t0 = performance.now()
    buildRotationSchedule(makeLargeScaleConfig())
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(5000)
  }, 30000)
})
