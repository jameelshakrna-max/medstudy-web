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
