const VALID_STUDY_STYLES = ['focused', 'active', 'detailed_notes']
const VALID_SCHEDULING_MODES = ['focused', 'efficient']
const VALID_QUESTION_START_RULES = ['next_available_day', 'same_day_if_capacity']

export function parseAndValidatePlanRequest(request, body, { requireIdempotencyKey = false } = {}) {
  const errors = []

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: [{ code: 'INVALID_JSON', message: 'Request body must be a JSON object.' }] }
  }

  const clientRequestId = request.headers.get('Idempotency-Key') ?? body.clientRequestId ?? null
  if (requireIdempotencyKey) {
    if (!clientRequestId || typeof clientRequestId !== 'string' || clientRequestId.trim() === '') {
      errors.push({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key header or clientRequestId body field is required.', field: 'clientRequestId' })
    }
  }

  const requiredFields = ['sourceId', 'rotationId', 'startDate', 'endDate', 'studyStyle', 'schedulingMode', 'questionStartRule']
  for (const field of requiredFields) {
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      errors.push({ code: 'VALIDATION_ERROR', message: `${field} is required.`, field })
    }
  }

  if (typeof body.sourceId === 'string' && body.sourceId.trim() !== '') {
    const validSources = [
      'step-up-medicine-6e-2024',
      'el-husseiny-essentials-step2ck',
      'el-husseiny-essentials-surgery-step2ck',
      'surgery-case-based-clinical-review-2e-2020',
    ]
    if (!validSources.includes(body.sourceId)) {
      errors.push({ code: 'SOURCE_NOT_FOUND', message: `Unknown source: ${body.sourceId}`, field: 'sourceId' })
    }
  }

  if (body.studyStyle && !VALID_STUDY_STYLES.includes(body.studyStyle)) {
    errors.push({ code: 'VALIDATION_ERROR', message: `studyStyle must be one of: ${VALID_STUDY_STYLES.join(', ')}`, field: 'studyStyle' })
  }
  if (body.schedulingMode && !VALID_SCHEDULING_MODES.includes(body.schedulingMode)) {
    errors.push({ code: 'VALIDATION_ERROR', message: `schedulingMode must be one of: ${VALID_SCHEDULING_MODES.join(', ')}`, field: 'schedulingMode' })
  }
  if (body.questionStartRule && !VALID_QUESTION_START_RULES.includes(body.questionStartRule)) {
    errors.push({ code: 'VALIDATION_ERROR', message: `questionStartRule must be one of: ${VALID_QUESTION_START_RULES.join(', ')}`, field: 'questionStartRule' })
  }

  if (!isValidDateString(body.startDate)) {
    errors.push({ code: 'VALIDATION_ERROR', message: 'startDate must be a valid YYYY-MM-DD date.', field: 'startDate' })
  }
  if (!isValidDateString(body.endDate)) {
    errors.push({ code: 'VALIDATION_ERROR', message: 'endDate must be a valid YYYY-MM-DD date.', field: 'endDate' })
  }
  if (isValidDateString(body.startDate) && isValidDateString(body.endDate) && body.startDate > body.endDate) {
    errors.push({ code: 'VALIDATION_ERROR', message: 'startDate must be <= endDate.', field: 'startDate' })
  }
  if (body.examDate !== undefined && body.examDate !== null && body.examDate !== '') {
    if (!isValidDateString(body.examDate)) {
      errors.push({ code: 'VALIDATION_ERROR', message: 'examDate must be a valid YYYY-MM-DD date.', field: 'examDate' })
    }
  }

  if (!Array.isArray(body.availability) || body.availability.length !== 7) {
    errors.push({ code: 'VALIDATION_ERROR', message: 'availability must be an array of exactly 7 objects.', field: 'availability' })
  } else {
    for (let i = 0; i < 7; i++) {
      const day = body.availability[i]
      if (!day || typeof day !== 'object') {
        errors.push({ code: 'VALIDATION_ERROR', message: `availability[${i}] must be an object.`, field: `availability[${i}]` })
        continue
      }
      if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6) {
        errors.push({ code: 'VALIDATION_ERROR', message: `availability[${i}].weekday must be 0-6.`, field: `availability[${i}].weekday` })
      }
      if (!Number.isInteger(day.availableMinutes) || day.availableMinutes < 0) {
        errors.push({ code: 'VALIDATION_ERROR', message: `availability[${i}].availableMinutes must be an integer >= 0.`, field: `availability[${i}].availableMinutes` })
      }
      if (typeof day.isDayOff !== 'boolean') {
        errors.push({ code: 'VALIDATION_ERROR', message: `availability[${i}].isDayOff must be a boolean.`, field: `availability[${i}].isDayOff` })
      }
    }
  }

  if (!Array.isArray(body.topics) || body.topics.length === 0) {
    errors.push({ code: 'VALIDATION_ERROR', message: 'topics must be a non-empty array.', field: 'topics' })
  } else {
    const seenIds = new Set()
    for (let i = 0; i < body.topics.length; i++) {
      const t = body.topics[i]
      const prefix = `topics[${i}]`
      if (typeof t.normalizedTopicId !== 'string' || t.normalizedTopicId.trim() === '') {
        errors.push({ code: 'VALIDATION_ERROR', message: `${prefix}.normalizedTopicId is required.`, field: `${prefix}.normalizedTopicId` })
      } else if (seenIds.has(t.normalizedTopicId)) {
        errors.push({ code: 'DUPLICATE_TOPIC', message: `Duplicate normalizedTopicId: ${t.normalizedTopicId}`, field: `${prefix}.normalizedTopicId` })
      } else {
        seenIds.add(t.normalizedTopicId)
      }
      if (!Number.isInteger(t.uworldRemainingQuestions) || t.uworldRemainingQuestions < 0) {
        errors.push({ code: 'VALIDATION_ERROR', message: `${prefix}.uworldRemainingQuestions must be an integer >= 0.`, field: `${prefix}.uworldRemainingQuestions` })
      }
      if (typeof t.alreadyCompletedLearningPercentage !== 'number' || t.alreadyCompletedLearningPercentage < 0 || t.alreadyCompletedLearningPercentage > 100) {
        errors.push({ code: 'VALIDATION_ERROR', message: `${prefix}.alreadyCompletedLearningPercentage must be a number 0-100.`, field: `${prefix}.alreadyCompletedLearningPercentage` })
      }
      if (!Number.isInteger(t.alreadyCompletedQuestionCount) || t.alreadyCompletedQuestionCount < 0) {
        errors.push({ code: 'VALIDATION_ERROR', message: `${prefix}.alreadyCompletedQuestionCount must be an integer >= 0.`, field: `${prefix}.alreadyCompletedQuestionCount` })
      }
      if (t.incorrectQuestionsRemaining !== undefined && t.incorrectQuestionsRemaining !== null) {
        if (!Number.isInteger(t.incorrectQuestionsRemaining) || t.incorrectQuestionsRemaining < 0) {
          errors.push({ code: 'VALIDATION_ERROR', message: `${prefix}.incorrectQuestionsRemaining must be an integer >= 0.`, field: `${prefix}.incorrectQuestionsRemaining` })
        }
      }
    }
  }

  if (body.blockedDates !== undefined && body.blockedDates !== null) {
    if (!Array.isArray(body.blockedDates)) {
      errors.push({ code: 'VALIDATION_ERROR', message: 'blockedDates must be an array.', field: 'blockedDates' })
    } else {
      const seenDates = new Set()
      for (const d of body.blockedDates) {
        if (!isValidDateString(d)) {
          errors.push({ code: 'VALIDATION_ERROR', message: `blockedDates entry "${d}" is not a valid YYYY-MM-DD date.`, field: 'blockedDates' })
        }
        if (seenDates.has(d)) {
          errors.push({ code: 'VALIDATION_ERROR', message: `blockedDates contains duplicate: ${d}`, field: 'blockedDates' })
        }
        seenDates.add(d)
      }
    }
  }

  const numFields = {
    preferredQuestionsPerDay: 30, minimumQuestionsPerSession: 10,
    maximumQuestionsPerDay: 50, bufferPercentage: 20, maximumActiveTopics: 5,
  }
  for (const [field, defaultVal] of Object.entries(numFields)) {
    const val = body[field] ?? defaultVal
    if (!Number.isInteger(val) || val < 0) {
      errors.push({ code: 'VALIDATION_ERROR', message: `${field} must be an integer >= 0.`, field })
    }
  }
  if (typeof body.averageMinutesPerQuestion !== 'number' || !isFinite(body.averageMinutesPerQuestion) || body.averageMinutesPerQuestion <= 0) {
    const val = body.averageMinutesPerQuestion ?? 1.5
    if (typeof val !== 'number' || !isFinite(val) || val <= 0) {
      errors.push({ code: 'VALIDATION_ERROR', message: 'averageMinutesPerQuestion must be a finite number > 0.', field: 'averageMinutesPerQuestion' })
    }
  }
  if (typeof body.personalSourcePaceMultiplier !== 'number' || !isFinite(body.personalSourcePaceMultiplier) || body.personalSourcePaceMultiplier <= 0) {
    const val = body.personalSourcePaceMultiplier ?? 1.0
    if (typeof val !== 'number' || !isFinite(val) || val <= 0) {
      errors.push({ code: 'VALIDATION_ERROR', message: 'personalSourcePaceMultiplier must be a finite number > 0.', field: 'personalSourcePaceMultiplier' })
    }
  }

  if (errors.length > 0) return { valid: false, errors }

  return {
    valid: true,
    parsed: {
      sourceId: body.sourceId,
      rotationId: body.rotationId,
      startDate: body.startDate,
      endDate: body.endDate,
      examDate: body.examDate || null,
      studyStyle: body.studyStyle,
      schedulingMode: body.schedulingMode,
      questionStartRule: body.questionStartRule,
      availability: body.availability,
      topics: body.topics,
      blockedDates: body.blockedDates || [],
      preferredQuestionsPerDay: body.preferredQuestionsPerDay ?? 30,
      minimumQuestionsPerSession: body.minimumQuestionsPerSession ?? 10,
      maximumQuestionsPerDay: body.maximumQuestionsPerDay ?? 50,
      averageMinutesPerQuestion: body.averageMinutesPerQuestion ?? 1.5,
      bufferPercentage: body.bufferPercentage ?? 20,
      maximumActiveTopics: body.maximumActiveTopics ?? 5,
      personalSourcePaceMultiplier: body.personalSourcePaceMultiplier ?? 1.0,
      examReviewWindowDays: body.examReviewWindowDays ?? 0,
      mixedReviewQuestionsPerDay: body.mixedReviewQuestionsPerDay ?? 0,
      dueReviewMinutesByDate: body.dueReviewMinutesByDate || {},
      clientRequestId,
      previewToken: body.previewToken || null,
      acceptOverload: body.acceptOverload ?? false,
    },
  }
}

function isValidDateString(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}
