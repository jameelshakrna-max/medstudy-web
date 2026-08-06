import { describe, it, expect } from 'vitest'
import {
  initializeGroupStates,
  evaluateGroupLearning,
  scheduleGroupedUworldTasks,
  scheduleGroupedIncorrectReview,
} from '../groupedQuestions.js'
import { buildRotationSchedule } from '../buildRotationSchedule.js'

function makeGroup(overrides = {}) {
  return {
    id: 'group-1',
    key: 'ischemic-heart-disease',
    title: 'Ischemic Heart Disease',
    system: 'uworld',
    targetQuestions: 30,
    memberTopicIds: ['cardiology.stable-angina-pectoris'],
    requiredTopicIds: ['cardiology.stable-angina-pectoris'],
    excluded: 0,
    displayOrder: 0,
    ...overrides,
  }
}

function makeGroupState(overrides = {}) {
  return {
    id: 'group-1',
    key: 'ischemic-heart-disease',
    title: 'Ischemic Heart Disease',
    system: 'uworld',
    targetQuestions: 30,
    excluded: false,
    displayOrder: 0,
    completedQuestions: 0,
    remainingQuestions: 30,
    incorrectQuestionsRemaining: 0,
    requiredLearningCompleted: false,
    requiredTopicIds: ['cardiology.stable-angina-pectoris'],
    requiredCanonicalTopicIds: ['cardiology.stable-angina-pectoris'],
    status: 'locked',
    unlockedAt: null,
    ...overrides,
  }
}

const PLAN_CONFIG = {
  preferredQuestionsPerDay: 10,
  minimumQuestionsPerSession: 5,
  maximumQuestionsPerDay: 15,
  averageMinutesPerQuestion: 1.5,
}

describe('initializeGroupStates', () => {
  const topics = [{ sourceTopicId: 'cardiology.stable-angina-pectoris', canonicalTopicId: 'cardiology.stable-angina-pectoris' }]

  it('is locked when required learning is incomplete', () => {
    const states = initializeGroupStates({ groups: [makeGroup()], topics, initialGroupStates: {} })
    const s = states['ischemic-heart-disease']
    expect(s.status).toBe('locked')
    expect(s.requiredLearningCompleted).toBe(false)
    expect(s.remainingQuestions).toBe(30)
    expect(s.unlockedAt).toBeNull()
  })

  it('is pending when requiredLearningCompleted comes from initial state', () => {
    const states = initializeGroupStates({
      groups: [makeGroup()],
      topics,
      initialGroupStates: { 'ischemic-heart-disease': { requiredLearningCompleted: true } },
    })
    expect(states['ischemic-heart-disease'].status).toBe('pending')
    expect(states['ischemic-heart-disease'].requiredLearningCompleted).toBe(true)
  })

  it('marks excluded groups', () => {
    const states = initializeGroupStates({ groups: [makeGroup({ excluded: 1 })], topics, initialGroupStates: {} })
    const s = states['ischemic-heart-disease']
    expect(s.excluded).toBe(true)
    expect(s.status).toBe('excluded')
  })

  it('computes remainingQuestions as target minus completed', () => {
    const states = initializeGroupStates({
      groups: [makeGroup()],
      topics,
      initialGroupStates: { 'ischemic-heart-disease': { completedQuestions: 12 } },
    })
    const s = states['ischemic-heart-disease']
    expect(s.completedQuestions).toBe(12)
    expect(s.remainingQuestions).toBe(18)
  })

  it('respects incorrectQuestionsRemaining and unlockedAt from initial state', () => {
    const states = initializeGroupStates({
      groups: [makeGroup()],
      topics,
      initialGroupStates: { 'ischemic-heart-disease': { incorrectQuestionsRemaining: 4, unlockedAt: '2026-08-02' } },
    })
    const s = states['ischemic-heart-disease']
    expect(s.incorrectQuestionsRemaining).toBe(4)
    expect(s.unlockedAt).toBe('2026-08-02')
  })

  it('maps requiredTopicIds to canonical ids via source->canonical map', () => {
    const mappedTopics = [
      { sourceTopicId: 'cardiology.stable-angina-pectoris', canonicalTopicId: 'cardiology.angina' },
    ]
    const states = initializeGroupStates({
      groups: [makeGroup({ requiredTopicIds: ['cardiology.stable-angina-pectoris'] })],
      topics: mappedTopics,
      initialGroupStates: {},
    })
    expect(states['ischemic-heart-disease'].requiredCanonicalTopicIds).toEqual(['cardiology.angina'])
    expect(states['ischemic-heart-disease'].requiredTopicIds).toEqual(['cardiology.stable-angina-pectoris'])
  })

  it('drops required topics with no canonical mapping', () => {
    const states = initializeGroupStates({
      groups: [makeGroup({ requiredTopicIds: ['cardiology.stable-angina-pectoris', 'cardiology.missing'] })],
      topics: [{ sourceTopicId: 'cardiology.stable-angina-pectoris', canonicalTopicId: 'cardiology.angina' }],
      initialGroupStates: {},
    })
    expect(states['ischemic-heart-disease'].requiredCanonicalTopicIds).toEqual(['cardiology.angina'])
  })
})

describe('evaluateGroupLearning', () => {
  it('unlocks when all required topics have remainingLearningMinutes <= 0', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState(),
    }
    const topicStates = {
      'cardiology.stable-angina-pectoris': { remainingLearningMinutes: 0 },
    }
    evaluateGroupLearning(groupStates, topicStates, '2026-08-05')
    const s = groupStates['ischemic-heart-disease']
    expect(s.requiredLearningCompleted).toBe(true)
    expect(s.status).toBe('pending')
    expect(s.unlockedAt).toBe('2026-08-05')
  })

  it('falls back to personalizedLearningMinutes when remainingLearningMinutes is absent', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState(),
    }
    const topicStates = {
      'cardiology.stable-angina-pectoris': { personalizedLearningMinutes: 0 },
    }
    evaluateGroupLearning(groupStates, topicStates, '2026-08-05')
    expect(groupStates['ischemic-heart-disease'].requiredLearningCompleted).toBe(true)
  })

  it('sets unlockedAt to the latest learningCompletedAt among required topics', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        requiredCanonicalTopicIds: ['cardiology.a', 'cardiology.b'],
      }),
    }
    const topicStates = {
      'cardiology.a': { learningCompletedAt: '2026-08-01' },
      'cardiology.b': { learningCompletedAt: '2026-08-05' },
    }
    evaluateGroupLearning(groupStates, topicStates, '2026-08-10')
    expect(groupStates['ischemic-heart-disease'].unlockedAt).toBe('2026-08-05')
  })

  it('does not re-unlock an already-unlocked group', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        requiredLearningCompleted: true,
        unlockedAt: '2026-08-01',
        status: 'in_progress',
      }),
    }
    const topicStates = {
      'cardiology.stable-angina-pectoris': { remainingLearningMinutes: 50 },
    }
    evaluateGroupLearning(groupStates, topicStates, '2026-08-05')
    const s = groupStates['ischemic-heart-disease']
    expect(s.requiredLearningCompleted).toBe(true)
    expect(s.unlockedAt).toBe('2026-08-01')
    expect(s.status).toBe('in_progress')
  })

  it('stays locked until every required topic completes', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        requiredCanonicalTopicIds: ['cardiology.a', 'cardiology.b'],
      }),
    }
    const topicStates = {
      'cardiology.a': { remainingLearningMinutes: 0 },
      'cardiology.b': { remainingLearningMinutes: 10 },
    }
    evaluateGroupLearning(groupStates, topicStates, '2026-08-05')
    const s = groupStates['ischemic-heart-disease']
    expect(s.requiredLearningCompleted).toBe(false)
    expect(s.status).toBe('locked')
  })

  it('unlocks immediately when there are no required topics', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({ requiredCanonicalTopicIds: [] }),
    }
    evaluateGroupLearning(groupStates, {}, '2026-08-05')
    const s = groupStates['ischemic-heart-disease']
    expect(s.requiredLearningCompleted).toBe(true)
    expect(s.status).toBe('pending')
    expect(s.unlockedAt).toBe('2026-08-05')
  })

  it('skips excluded groups', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({ excluded: true, status: 'excluded' }),
    }
    evaluateGroupLearning(groupStates, {}, '2026-08-05')
    expect(groupStates['ischemic-heart-disease'].requiredLearningCompleted).toBe(false)
    expect(groupStates['ischemic-heart-disease'].status).toBe('excluded')
  })
})

describe('scheduleGroupedUworldTasks', () => {
  it('produces no task for a locked group', () => {
    const groupStates = { 'ischemic-heart-disease': makeGroupState() }
    const result = scheduleGroupedUworldTasks({
      dayDate: '2026-08-10',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })
    expect(result.tasks).toHaveLength(0)
    expect(result.remainingCapacity).toBe(120)
    expect(result.groupStates['ischemic-heart-disease'].remainingQuestions).toBe(30)
  })

  it('produces a task only after evaluateGroupLearning unlocks the group', () => {
    const groupStates = initializeGroupStates({
      groups: [makeGroup()],
      topics: [{ sourceTopicId: 'cardiology.stable-angina-pectoris', canonicalTopicId: 'cardiology.stable-angina-pectoris' }],
      initialGroupStates: {},
    })

    const before = scheduleGroupedUworldTasks({
      dayDate: '2026-08-10',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })
    expect(before.tasks).toHaveLength(0)

    evaluateGroupLearning(groupStates, {
      'cardiology.stable-angina-pectoris': { learningCompletedAt: '2026-08-05' },
    }, '2026-08-05')

    const after = scheduleGroupedUworldTasks({
      dayDate: '2026-08-06',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })
    expect(after.tasks).toHaveLength(1)
  })

  it('emits the grouped task shape and caps targetCount', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        requiredLearningCompleted: true,
        unlockedAt: '2026-08-05',
        status: 'pending',
      }),
    }
    const result = scheduleGroupedUworldTasks({
      dayDate: '2026-08-06',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })
    expect(result.tasks).toHaveLength(1)
    const task = result.tasks[0]
    expect(task.taskType).toBe('uworld_questions')
    expect(task.unlockCondition).toBe('learning_group_completed:ischemic-heart-disease')
    expect(task.planQuestionGroupId).toBe('group-1')
    expect(task.groupKey).toBe('ischemic-heart-disease')
    expect(task.canonicalTopicId).toBeNull()
    expect(task.normalizedTopicId).toBeNull()
    expect(task.selection).toBe('group')
    expect(task.provider).toBe('uworld')
    expect(task.targetCount).toBe(10)
    expect(task.estimatedMinutes).toBe(15)
    expect(task.displayOrder).toBe(1)
  })

  it('never lets remainingQuestions go negative and marks the group in_progress', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        targetQuestions: 30,
        remainingQuestions: 12,
        requiredLearningCompleted: true,
        unlockedAt: '2026-08-05',
        status: 'pending',
      }),
    }
    const result = scheduleGroupedUworldTasks({
      dayDate: '2026-08-06',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })
    const s = result.groupStates['ischemic-heart-disease']
    expect(s.completedQuestions).toBe(10)
    expect(s.remainingQuestions).toBe(2)
    expect(s.remainingQuestions).toBeGreaterThanOrEqual(0)
    expect(s.status).toBe('in_progress')
  })

  it('skips excluded groups', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({ excluded: true, status: 'excluded' }),
    }
    const result = scheduleGroupedUworldTasks({
      dayDate: '2026-08-10',
      usableMinutes: 120,
      groups: [makeGroup({ excluded: 1 })],
      groupStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })
    expect(result.tasks).toHaveLength(0)
    expect(result.remainingCapacity).toBe(120)
  })

  it('next_available_day: no task on the unlock day, first task the following day', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        requiredLearningCompleted: true,
        unlockedAt: '2026-08-05',
        status: 'pending',
      }),
    }
    const unlockDay = scheduleGroupedUworldTasks({
      dayDate: '2026-08-05',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })
    expect(unlockDay.tasks).toHaveLength(0)

    const nextDay = scheduleGroupedUworldTasks({
      dayDate: '2026-08-06',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      questionStartRule: 'next_available_day',
      planConfig: PLAN_CONFIG,
    })
    expect(nextDay.tasks).toHaveLength(1)
  })

  it('same_day_if_capacity: no task on the unlock day when capacity is below min session minutes', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        requiredLearningCompleted: true,
        unlockedAt: '2026-08-05',
        status: 'pending',
      }),
    }
    const lowCapacity = scheduleGroupedUworldTasks({
      dayDate: '2026-08-05',
      usableMinutes: 5,
      groups: [makeGroup()],
      groupStates,
      questionStartRule: 'same_day_if_capacity',
      planConfig: PLAN_CONFIG,
    })
    expect(lowCapacity.tasks).toHaveLength(0)

    const enoughCapacity = scheduleGroupedUworldTasks({
      dayDate: '2026-08-05',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      questionStartRule: 'same_day_if_capacity',
      planConfig: PLAN_CONFIG,
    })
    expect(enoughCapacity.tasks).toHaveLength(1)
  })
})

describe('scheduleGroupedIncorrectReview', () => {
  it('produces no task while uworld questions remain', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        remainingQuestions: 10,
        incorrectQuestionsRemaining: 20,
        status: 'in_progress',
      }),
    }
    const result = scheduleGroupedIncorrectReview({
      dayDate: '2026-08-10',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      planConfig: PLAN_CONFIG,
    })
    expect(result.tasks).toHaveLength(0)
    expect(result.remainingCapacity).toBe(120)
    expect(result.groupStates['ischemic-heart-disease'].incorrectQuestionsRemaining).toBe(20)
  })

  it('schedules incorrect review once uworld is done', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        remainingQuestions: 0,
        incorrectQuestionsRemaining: 20,
        status: 'in_progress',
      }),
    }
    const result = scheduleGroupedIncorrectReview({
      dayDate: '2026-08-10',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      planConfig: PLAN_CONFIG,
    })
    expect(result.tasks).toHaveLength(1)
    const task = result.tasks[0]
    expect(task.taskType).toBe('incorrect_review')
    expect(task.unlockCondition).toBe('uworld_group_completed:ischemic-heart-disease')
    expect(task.groupKey).toBe('ischemic-heart-disease')
    expect(task.canonicalTopicId).toBeNull()
    expect(task.selection).toBe('group')
    expect(task.targetCount).toBe(10)
    expect(result.groupStates['ischemic-heart-disease'].incorrectQuestionsRemaining).toBe(10)
  })

  it('decrements incorrectQuestionsRemaining and marks the group completed when both reach zero', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        remainingQuestions: 0,
        incorrectQuestionsRemaining: 10,
        status: 'in_progress',
      }),
    }
    const result = scheduleGroupedIncorrectReview({
      dayDate: '2026-08-10',
      usableMinutes: 120,
      groups: [makeGroup()],
      groupStates,
      planConfig: PLAN_CONFIG,
    })
    const s = result.groupStates['ischemic-heart-disease']
    expect(s.incorrectQuestionsRemaining).toBe(0)
    expect(s.status).toBe('completed')
  })

  it('respects capacity', () => {
    const groupStates = {
      'ischemic-heart-disease': makeGroupState({
        remainingQuestions: 0,
        incorrectQuestionsRemaining: 100,
        status: 'in_progress',
      }),
    }
    const result = scheduleGroupedIncorrectReview({
      dayDate: '2026-08-10',
      usableMinutes: 15,
      groups: [makeGroup()],
      groupStates,
      planConfig: PLAN_CONFIG,
    })
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].targetCount).toBe(10)
    expect(result.remainingCapacity).toBe(0)
    expect(result.groupStates['ischemic-heart-disease'].incorrectQuestionsRemaining).toBe(90)
  })
})

describe('grouped uworld — buildRotationSchedule integration', () => {
  function makeTopic(overrides = {}) {
    return {
      canonicalTopicId: 'topic-a',
      sourceTopicId: 'topic-a',
      title: 'Topic A',
      learningMinutes: { focused: 30, activeLow: 40, activeExpected: 50, activeHigh: 60, detailedNotes: 70 },
      uworldRemainingQuestions: 0,
      prerequisiteTopicIds: [],
      sharedTopicKey: null,
      alreadyCompletedLearningPercentage: 0,
      alreadyCompletedQuestionCount: 0,
      incorrectQuestionsRemaining: 0,
      ...overrides,
    }
  }

  function makeGroupedConfig(overrides = {}) {
    return {
      rotationId: 'cardiology',
      sourceId: 'step-up-medicine-6e-2024',
      startDate: '2026-08-03',
      endDate: '2026-08-10',
      examDate: null,
      studyStyle: 'active',
      schedulingMode: 'efficient',
      questionStartRule: 'next_available_day',
      uworldSchedulingMode: 'grouped',
      maximumActiveTopics: 5,
      availabilityByWeekday: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        availableMinutes: 240,
        isDayOff: false,
      })),
      blockedDates: [],
      bufferPercentage: 0,
      preferredQuestionsPerDay: 10,
      minimumQuestionsPerSession: 5,
      maximumQuestionsPerDay: 15,
      averageMinutesPerQuestion: 1.5,
      topics: [
        makeTopic({ canonicalTopicId: 'topic-a', sourceTopicId: 'topic-a', title: 'Topic A' }),
        makeTopic({ canonicalTopicId: 'topic-b', sourceTopicId: 'topic-b', title: 'Topic B' }),
      ],
      questionGroups: [
        { id: 'g1', key: 'group-a', title: 'Group A', system: 'uworld', targetQuestions: 20, memberTopicIds: ['topic-a'], requiredTopicIds: ['topic-a'], excluded: 0, displayOrder: 0 },
        { id: 'g2', key: 'group-b', title: 'Group B', system: 'uworld', targetQuestions: 20, memberTopicIds: ['topic-b'], requiredTopicIds: ['topic-b'], excluded: 0, displayOrder: 1 },
      ],
      dueReviewMinutesByDate: {},
      personalSourcePaceMultiplier: 1.0,
      examReviewWindowDays: 0,
      mixedReviewQuestionsPerDay: 0,
      ...overrides,
    }
  }

  it('schedules grouped questions only after required learning completes', () => {
    const result = buildRotationSchedule(makeGroupedConfig())

    const learningTasks = result.tasks.filter((t) => t.taskType === 'learning')
    const learningTopics = new Set(learningTasks.map((t) => t.canonicalTopicId))
    expect(learningTopics.has('topic-a')).toBe(true)
    expect(learningTopics.has('topic-b')).toBe(true)
    expect(learningTasks.reduce((s, t) => s + t.estimatedMinutes, 0)).toBe(100)

    const uworldTasks = result.tasks.filter((t) => t.taskType === 'uworld_questions')
    expect(uworldTasks.length).toBeGreaterThan(0)
    for (const task of uworldTasks) {
      expect(task.planQuestionGroupId).toBeTruthy()
      expect(task.groupKey).toBeDefined()
      expect(task.canonicalTopicId).toBeNull()
      expect(task.normalizedTopicId).toBeNull()
      expect(task.selection).toBe('group')
      expect(task.unlockCondition.startsWith('learning_group_completed:')).toBe(true)
    }

    const learningDates = learningTasks.map((t) => t.taskDate)
    const earliestLearningDate = learningDates.reduce((min, d) => (min === null || d < min ? d : min), null)
    const earliestUworldDate = uworldTasks.reduce((min, t) => (min === null || t.taskDate < min ? t.taskDate : min), null)
    expect(earliestUworldDate > earliestLearningDate).toBe(true)

    const totalByGroup = {}
    for (const task of uworldTasks) {
      totalByGroup[task.groupKey] = (totalByGroup[task.groupKey] || 0) + task.targetCount
    }
    expect(totalByGroup['group-a']).toBe(20)
    expect(totalByGroup['group-b']).toBe(20)
    expect(totalByGroup['group-a']).toBeLessThanOrEqual(20)
    expect(totalByGroup['group-b']).toBeLessThanOrEqual(20)

    const groupA = result.groupStates.find((g) => g.key === 'group-a')
    expect(groupA).toBeDefined()
    expect(groupA.requiredLearningCompleted).toBe(true)
    expect(groupA.unlockedAt).toBeTruthy()
    expect(groupA.remainingQuestions).toBe(0)
  })
})
