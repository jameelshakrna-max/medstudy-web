import { describe, it, expect } from 'vitest'
import { generatePlanPreview } from '../previewPipeline.js'
import { getNormalizedTopicsForRotation } from '../../../data/studySources/normalizedRegistry.js'

function toResolved(registryTopic, overrides = {}) {
  return {
    normalizedTopicId: registryTopic.normalizedTopicId,
    canonicalTopicId: registryTopic.canonicalTopicId,
    sourceTopicId: registryTopic.sourceTopicId,
    sourceId: registryTopic.sourceId,
    title: registryTopic.title,
    groupId: registryTopic.groupId,
    learningMinutes: { ...registryTopic.learningMinutes },
    pageRange: registryTopic.pageRange ? { ...registryTopic.pageRange } : null,
    confidence: registryTopic.confidence,
    questionSource: registryTopic.questionSource,
    sharedTopicKey: registryTopic.sharedTopicKey,
    prerequisiteTopicIds: [],
    uworldRemainingQuestions: 20,
    alreadyCompletedLearningPercentage: 0,
    alreadyCompletedQuestionCount: 0,
    incorrectQuestionsRemaining: 0,
    ...overrides,
  }
}

function makeValidatedInput(overrides = {}) {
  return {
    sourceId: 'step-up-medicine-6e-2024',
    rotationId: 'cardiology',
    displayName: 'Cardiology — Preview',
    startDate: '2026-01-05',
    endDate: '2026-01-11',
    studyStyle: 'active',
    schedulingMode: 'efficient',
    uworldSchedulingMode: 'grouped',
    questionStartRule: 'next_available_day',
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
    topicBreakdownByDate: {},
    availability: Array.from({ length: 7 }, (_, i) => ({ weekday: i, availableMinutes: 120, isDayOff: false })),
    blockedDates: [],
    ...overrides,
  }
}

describe('generatePlanPreview — source-adapted question groups', () => {
  it('grouped preview succeeds with a source-adapted group and does not force exclusion', () => {
    const supported = getNormalizedTopicsForRotation('step-up-medicine-6e-2024', 'cardiology')
    const adhf = supported.find(t => t.sourceTopicId === 'cardiology.acute-decompensated-heart-failure')
    expect(adhf).toBeDefined()
    expect(supported.some(t => t.sourceTopicId === 'cardiology.congestive-heart-failure')).toBe(false)

    const result = generatePlanPreview([toResolved(adhf)], makeValidatedInput())

    expect(result.questionGroupErrors).toEqual([])
    expect(result.incompleteQuestionGroups).toEqual([])

    const adapted = result.sourceAdaptedQuestionGroups.find(g => g.groupKey === 'heart-failure')
    expect(adapted).toBeDefined()
    expect(adapted.unavailableRequiredTopicIds).toEqual(['cardiology.congestive-heart-failure'])

    const hf = result.questionGroups.find(g => g.key === 'heart-failure')
    expect(hf).toBeDefined()
    expect(hf.requiredTopicIds).not.toContain('cardiology.congestive-heart-failure')
    expect(hf.excluded).toBe(0)
  })

  it('throws QUESTION_GROUP_VALIDATION_FAILED only for invalid exclusion keys', () => {
    const supported = getNormalizedTopicsForRotation('step-up-medicine-6e-2024', 'cardiology')
    const adhf = supported.find(t => t.sourceTopicId === 'cardiology.acute-decompensated-heart-failure')
    const input = makeValidatedInput({ questionGroupExclusions: ['does-not-exist'] })

    expect(() => generatePlanPreview([toResolved(adhf)], input)).toThrow(/QUESTION_GROUP_VALIDATION_FAILED/)
  })
})
