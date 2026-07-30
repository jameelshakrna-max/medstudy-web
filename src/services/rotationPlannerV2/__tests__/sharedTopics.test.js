import { describe, it, expect } from 'vitest'
import { deduplicateSharedTopics } from '../sharedTopics.js'

function makeTopic(sourceTopicId, sharedTopicKey = null, completedPct = 0) {
  return {
    canonicalTopicId: `shared-topic::${sourceTopicId}`,
    sourceTopicId,
    title: `Topic ${sourceTopicId}`,
    learningMinutes: { focused: 30, activeLow: 40, activeExpected: 50, activeHigh: 60, detailedNotes: 70 },
    uworldRemainingQuestions: 20,
    prerequisiteTopicIds: [],
    sharedTopicKey,
    alreadyCompletedLearningPercentage: completedPct,
    alreadyCompletedQuestionCount: 0,
  }
}

describe('deduplicateSharedTopics', () => {
  it('does not deduplicate when sharedTopicKey is null', () => {
    const topic = makeTopic('a', null, 0)
    const { processedTopics, deduplicationLog } = deduplicateSharedTopics([topic])

    expect(processedTopics).toHaveLength(1)
    expect(processedTopics[0].canonicalTopicId).toBe(topic.canonicalTopicId)
    expect(processedTopics[0].isPrimarySharedUnit).toBe(true)
    expect(deduplicationLog).toBeDefined()
  })

  it('marks completed shared key as satisfying the other topic', () => {
    const completed = makeTopic('a', 'shared-1', 1.0)
    const other = makeTopic('b', 'shared-1', 0)
    const { processedTopics } = deduplicateSharedTopics([completed, other])

    expect(processedTopics).toHaveLength(2)
    const completedResult = processedTopics.find((t) => t.sourceTopicId === 'a')
    const otherResult = processedTopics.find((t) => t.sourceTopicId === 'b')

    expect(completedResult.isPrimarySharedUnit).toBe(true)
    expect(otherResult.satisfiedBySharedCompletion).toBe(true)
  })

  it('selects primary unit deterministically when neither is completed', () => {
    const topicB = makeTopic('b', 'shared-1', 0)
    const topicA = makeTopic('a', 'shared-1', 0)
    const { processedTopics } = deduplicateSharedTopics([topicB, topicA])

    const primary = processedTopics.find((t) => t.isPrimarySharedUnit === true)
    const satisfied = processedTopics.find((t) => t.satisfiedBySharedCompletion === true)

    expect(primary).toBeDefined()
    expect(primary.sourceTopicId).toBe('a')
    expect(satisfied).toBeDefined()
    expect(satisfied.sourceTopicId).toBe('b')
  })

  it('preserves all topic-state records', () => {
    const topics = [
      makeTopic('a', 'key-1', 0),
      makeTopic('b', 'key-1', 0),
      makeTopic('c', 'key-2', 0),
    ]
    const { processedTopics } = deduplicateSharedTopics(topics)
    expect(processedTopics).toHaveLength(3)
  })

  it('emits deduplication log with expected fields', () => {
    const topicA = makeTopic('a', 'key-1', 0)
    const topicB = makeTopic('b', 'key-1', 0)
    const { deduplicationLog } = deduplicateSharedTopics([topicA, topicB])

    expect(deduplicationLog).toBeDefined()
    expect(deduplicationLog.length).toBeGreaterThan(0)
    for (const entry of deduplicationLog) {
      expect(entry).toHaveProperty('canonicalTopicId')
      expect(entry).toHaveProperty('sharedTopicKey')
      expect(entry).toHaveProperty('action')
      expect(entry).toHaveProperty('reason')
    }
  })
})
