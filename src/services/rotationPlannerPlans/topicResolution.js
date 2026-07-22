import { findNormalizedTopic, getNormalizedTopicsForRotation } from '../../data/studySources/normalizedRegistry.js'
import { getStudySource } from '../../data/studySources/sourceRegistry.js'
import { getRotationById, validateRotationId } from '../../data/studySources/rotationRegistry.js'

export function resolveTopicsFromRegistry(sourceId, rotationId, topicInputs) {
  const errors = []

  const source = getStudySource(sourceId)
  if (!source) {
    return { resolvedTopics: [], errors: [{ code: 'SOURCE_NOT_FOUND', message: `Source not found: ${sourceId}` }] }
  }

  if (!validateRotationId(rotationId)) {
    return { resolvedTopics: [], errors: [{ code: 'ROTATION_NOT_FOUND', message: `Rotation not found: ${rotationId}` }] }
  }

  let supportedTopics
  try {
    supportedTopics = getNormalizedTopicsForRotation(sourceId, rotationId)
  } catch (e) {
    return { resolvedTopics: [], errors: [{ code: 'ROTATION_NOT_SUPPORTED_BY_SOURCE', message: `Source does not support rotation: ${rotationId}` }] }
  }

  if (!supportedTopics || supportedTopics.length === 0) {
    return { resolvedTopics: [], errors: [{ code: 'ROTATION_NOT_SUPPORTED_BY_SOURCE', message: `Source does not support rotation: ${rotationId}` }] }
  }

  const supportedByNormalizedId = new Map(supportedTopics.map(t => [t.normalizedTopicId, t]))

  for (let i = 0; i < topicInputs.length; i++) {
    const input = topicInputs[i]
    const field = `topics[${i}]`

    const parts = input.normalizedTopicId.split('::')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      errors.push({ code: 'VALIDATION_ERROR', message: `Invalid normalizedTopicId format: ${input.normalizedTopicId}`, field: `${field}.normalizedTopicId` })
      continue
    }

    const [inputSourceId, inputSourceTopicId] = parts
    if (inputSourceId !== sourceId) {
      errors.push({ code: 'TOPIC_NOT_FOUND', message: `Topic source mismatch: ${inputSourceId} != ${sourceId}`, field: `${field}.normalizedTopicId` })
      continue
    }

    const registryTopic = supportedByNormalizedId.get(input.normalizedTopicId)
    if (!registryTopic) {
      const inRotation = findNormalizedTopic(sourceId, inputSourceTopicId)
      if (!inRotation) {
        errors.push({ code: 'TOPIC_NOT_FOUND', message: `Topic not found in source: ${input.normalizedTopicId}`, field: `${field}.normalizedTopicId` })
      } else if (inRotation.rotationId !== rotationId) {
        errors.push({ code: 'TOPIC_WRONG_ROTATION', message: `Topic belongs to rotation "${inRotation.rotationId}", not "${rotationId}".`, field: `${field}.normalizedTopicId` })
      } else {
        errors.push({ code: 'TOPIC_NOT_FOUND', message: `Topic not found: ${input.normalizedTopicId}`, field: `${field}.normalizedTopicId` })
      }
      continue
    }

    const resolved = {
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
      uworldRemainingQuestions: input.uworldRemainingQuestions,
      alreadyCompletedLearningPercentage: input.alreadyCompletedLearningPercentage / 100,
      alreadyCompletedQuestionCount: input.alreadyCompletedQuestionCount,
      incorrectQuestionsRemaining: input.incorrectQuestionsRemaining ?? 0,
    }

    topicInputs[i]._resolved = resolved
  }

  const resolvedTopics = topicInputs
    .filter(t => t._resolved)
    .map(t => t._resolved)

  return { resolvedTopics, errors }
}
