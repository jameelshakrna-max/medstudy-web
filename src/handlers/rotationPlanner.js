import { json } from '../lib/worker-utils.js'
import {
  getNormalizedTopicsForSource,
  getNormalizedTopicsForRotation,
} from '../data/studySources/normalizedRegistry.js'
import {
  getRotationDefinitions,
  getRotationById,
  validateRotationId,
} from '../data/studySources/rotationRegistry.js'
import {
  getStudySource,
  getAvailableStudySources,
} from '../data/studySources/sourceRegistry.js'

function err(code, message, status = 404) {
  return json({ error: { code, message } }, status)
}

function toRotationDto(rotation) {
  return {
    id: rotation.id,
    displayLabel: rotation.displayLabel,
    subjectId: rotation.subjectId,
  }
}

function toTopicDto(topic) {
  return {
    normalizedTopicId: topic.normalizedTopicId,
    canonicalTopicId: topic.canonicalTopicId,
    sourceTopicId: topic.sourceTopicId,
    title: topic.title,
    groupId: topic.groupId,
    learningMinutes: { ...topic.learningMinutes },
    pageRange: topic.pageRange ? { ...topic.pageRange } : null,
    confidence: topic.confidence,
    questionSource: topic.questionSource,
    studyUnitType: topic.studyUnitType,
    sharedTopicKey: topic.sharedTopicKey,
  }
}

export async function getPlannerRotations(_request, _env, _user) {
  try {
    const rotations = getRotationDefinitions().map(toRotationDto)
    return json(rotations)
  } catch (e) {
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load rotations.' } }, 500)
  }
}

export async function getPlannerSources(_request, _env, _user) {
  try {
    const sources = getAvailableStudySources().map((s) => {
      let normalizedCount = 0
      try {
        normalizedCount = getNormalizedTopicsForSource(s.id).length
      } catch (_) { /* source not in normalized registry */ }
      return {
        id: s.id,
        title: s.title,
        edition: s.edition,
        year: s.year,
        version: s.version,
        type: s.type,
        questionSource: s.questionSource,
        supportedRotations: s.supportedRotations,
        topicCount: normalizedCount,
      }
    })
    return json(sources)
  } catch (e) {
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load sources.' } }, 500)
  }
}

export async function getPlannerSourceRotations(request, _env, _user) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const sourceId = pathParts[4]

    const source = getStudySource(sourceId)
    if (!source) return err('SOURCE_NOT_FOUND', 'Source not found.')

    let normalizedTopics
    try {
      normalizedTopics = getNormalizedTopicsForSource(sourceId)
    } catch (_) {
      return err('SOURCE_NOT_FOUND', 'Source not found.')
    }

    const rotations = getRotationDefinitions()
    const rotationTopicCounts = new Map()

    for (const topic of normalizedTopics) {
      if (!topic.rotationId) continue
      const count = rotationTopicCounts.get(topic.rotationId) || 0
      rotationTopicCounts.set(topic.rotationId, count + 1)
    }

    const result = rotations
      .filter((r) => rotationTopicCounts.has(r.id))
      .map((r) => ({
        ...toRotationDto(r),
        topicCount: rotationTopicCounts.get(r.id),
      }))

    return json(result)
  } catch (e) {
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load source rotations.' } }, 500)
  }
}

export async function getPlannerSourceRotationTopics(request, _env, _user) {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const sourceId = pathParts[4]
    const rotationId = pathParts[6]

    const source = getStudySource(sourceId)
    if (!source) return err('SOURCE_NOT_FOUND', 'Source not found.')

    if (!validateRotationId(rotationId)) {
      return err('ROTATION_NOT_FOUND', 'Rotation not found.')
    }

    let topics
    try {
      topics = getNormalizedTopicsForRotation(sourceId, rotationId)
    } catch (e) {
      if (e.message && e.message.includes('Unknown canonical rotation')) {
        return err('ROTATION_NOT_FOUND', 'Rotation not found.')
      }
      return err('INTERNAL_ERROR', 'Failed to load topics.', 500)
    }

    if (!topics || topics.length === 0) {
      return err('ROTATION_NOT_SUPPORTED_BY_SOURCE', 'This source does not support the selected rotation.')
    }

    return json(topics.map(toTopicDto))
  } catch (e) {
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load topics.' } }, 500)
  }
}
