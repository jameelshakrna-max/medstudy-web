import { describe, it, expect } from 'vitest'
import { resolveTopicsFromRegistry } from '../topicResolution.js'

const VALID_TOPIC_ID = 'step-up-medicine-6e-2024::cardiology.stable-angina-pectoris'
const VALID_TOPIC_ID_2 = 'step-up-medicine-6e-2024::cardiology.acute-coronary-syndromes-acs'

describe('resolveTopicsFromRegistry', () => {
  it('resolves valid topic inputs', () => {
    const { resolvedTopics, errors } = resolveTopicsFromRegistry(
      'step-up-medicine-6e-2024',
      'cardiology',
      [{ normalizedTopicId: VALID_TOPIC_ID, uworldRemainingQuestions: 20, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }]
    )
    expect(errors).toHaveLength(0)
    expect(resolvedTopics).toHaveLength(1)
    expect(resolvedTopics[0].normalizedTopicId).toBe(VALID_TOPIC_ID)
    expect(resolvedTopics[0].learningMinutes).toBeDefined()
    expect(resolvedTopics[0].learningMinutes.focused).toBeGreaterThan(0)
  })

  it('returns error for invalid normalizedTopicId format (no :: separator)', () => {
    const { resolvedTopics, errors } = resolveTopicsFromRegistry(
      'step-up-medicine-6e-2024',
      'cardiology',
      [{ normalizedTopicId: 'bad-id', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }]
    )
    expect(resolvedTopics).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].code).toBe('VALIDATION_ERROR')
  })

  it('returns error for unknown sourceId', () => {
    const { resolvedTopics, errors } = resolveTopicsFromRegistry(
      'unknown-source',
      'cardiology',
      [{ normalizedTopicId: 'unknown-source::x', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }]
    )
    expect(resolvedTopics).toHaveLength(0)
    expect(errors.some(e => e.code === 'SOURCE_NOT_FOUND')).toBe(true)
  })

  it('returns error for topic not found in source', () => {
    const { resolvedTopics, errors } = resolveTopicsFromRegistry(
      'step-up-medicine-6e-2024',
      'cardiology',
      [{ normalizedTopicId: 'step-up-medicine-6e-2024::nonexistent-topic', uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }]
    )
    expect(resolvedTopics).toHaveLength(0)
    expect(errors.some(e => e.code === 'TOPIC_NOT_FOUND')).toBe(true)
  })

  it('converts percentage to fraction', () => {
    const { resolvedTopics } = resolveTopicsFromRegistry(
      'step-up-medicine-6e-2024',
      'cardiology',
      [{ normalizedTopicId: VALID_TOPIC_ID, uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 75, alreadyCompletedQuestionCount: 0 }]
    )
    expect(resolvedTopics[0].alreadyCompletedLearningPercentage).toBe(0.75)
  })

  it('preserves sharedTopicKey', () => {
    const { resolvedTopics } = resolveTopicsFromRegistry(
      'step-up-medicine-6e-2024',
      'cardiology',
      [{ normalizedTopicId: VALID_TOPIC_ID, uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }]
    )
    const topic = resolvedTopics[0]
    if (topic.sharedTopicKey) {
      expect(typeof topic.sharedTopicKey).toBe('string')
    }
  })

  it('includes sourceId and sourceTopicId on resolved topics', () => {
    const { resolvedTopics } = resolveTopicsFromRegistry(
      'step-up-medicine-6e-2024',
      'cardiology',
      [{ normalizedTopicId: VALID_TOPIC_ID, uworldRemainingQuestions: 0, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 }]
    )
    expect(resolvedTopics[0].sourceId).toBe('step-up-medicine-6e-2024')
    expect(resolvedTopics[0].sourceTopicId).toBe('cardiology.stable-angina-pectoris')
  })

  it('handles multiple topics', () => {
    const topics = [
      { normalizedTopicId: VALID_TOPIC_ID, uworldRemainingQuestions: 10, alreadyCompletedLearningPercentage: 0, alreadyCompletedQuestionCount: 0 },
      { normalizedTopicId: VALID_TOPIC_ID_2, uworldRemainingQuestions: 5, alreadyCompletedLearningPercentage: 50, alreadyCompletedQuestionCount: 3 },
    ]
    const { resolvedTopics, errors } = resolveTopicsFromRegistry('step-up-medicine-6e-2024', 'cardiology', topics)
    expect(errors).toHaveLength(0)
    expect(resolvedTopics).toHaveLength(2)
  })
})
