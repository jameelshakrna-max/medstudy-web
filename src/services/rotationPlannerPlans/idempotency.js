export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function calculateScheduleFingerprint(userId, validatedInput) {
  const canonical = JSON.stringify({
    userId,
    sourceId: validatedInput.sourceId,
    sourceVersion: validatedInput.sourceVersion,
    rotationId: validatedInput.rotationId,
    startDate: validatedInput.startDate,
    endDate: validatedInput.endDate,
    examDate: validatedInput.examDate ?? null,
    studyStyle: validatedInput.studyStyle,
    schedulingMode: validatedInput.schedulingMode,
    questionStartRule: validatedInput.questionStartRule,
    preferredQuestionsPerDay: validatedInput.preferredQuestionsPerDay,
    minimumQuestionsPerSession: validatedInput.minimumQuestionsPerSession,
    maximumQuestionsPerDay: validatedInput.maximumQuestionsPerDay,
    averageMinutesPerQuestion: validatedInput.averageMinutesPerQuestion,
    bufferPercentage: validatedInput.bufferPercentage,
    maximumActiveTopics: validatedInput.maximumActiveTopics,
    availability: validatedInput.availability
      .map(a => ({ weekday: a.weekday, availableMinutes: a.availableMinutes, isDayOff: a.isDayOff }))
      .sort((a, b) => a.weekday - b.weekday),
    blockedDates: [...validatedInput.blockedDates].sort(),
    topics: validatedInput.topics
      .map(t => ({
        normalizedTopicId: t.normalizedTopicId,
        uworldRemainingQuestions: t.uworldRemainingQuestions,
        alreadyCompletedLearningPercentage: t.alreadyCompletedLearningPercentage,
        alreadyCompletedQuestionCount: t.alreadyCompletedQuestionCount,
        incorrectQuestionsRemaining: t.incorrectQuestionsRemaining ?? 0,
      }))
      .sort((a, b) => a.normalizedTopicId.localeCompare(b.normalizedTopicId)),
    personalSourcePaceMultiplier: validatedInput.personalSourcePaceMultiplier,
    examReviewWindowDays: validatedInput.examReviewWindowDays ?? 0,
    mixedReviewQuestionsPerDay: validatedInput.mixedReviewQuestionsPerDay ?? 0,
    dueReviewMinutesByDate: Object.entries(validatedInput.dueReviewMinutesByDate ?? {})
      .sort(([a], [b]) => a.localeCompare(b)),
  }, null, 0)
  return sha256Hex(canonical)
}

export async function calculateRequestFingerprint(userId, validatedInput) {
  const canonical = JSON.stringify({
    userId,
    sourceId: validatedInput.sourceId,
    sourceVersion: validatedInput.sourceVersion,
    rotationId: validatedInput.rotationId,
    startDate: validatedInput.startDate,
    endDate: validatedInput.endDate,
    examDate: validatedInput.examDate ?? null,
    studyStyle: validatedInput.studyStyle,
    schedulingMode: validatedInput.schedulingMode,
    questionStartRule: validatedInput.questionStartRule,
    preferredQuestionsPerDay: validatedInput.preferredQuestionsPerDay,
    minimumQuestionsPerSession: validatedInput.minimumQuestionsPerSession,
    maximumQuestionsPerDay: validatedInput.maximumQuestionsPerDay,
    averageMinutesPerQuestion: validatedInput.averageMinutesPerQuestion,
    bufferPercentage: validatedInput.bufferPercentage,
    maximumActiveTopics: validatedInput.maximumActiveTopics,
    availability: validatedInput.availability
      .map(a => ({ weekday: a.weekday, availableMinutes: a.availableMinutes, isDayOff: a.isDayOff }))
      .sort((a, b) => a.weekday - b.weekday),
    blockedDates: [...validatedInput.blockedDates].sort(),
    topics: validatedInput.topics
      .map(t => ({
        normalizedTopicId: t.normalizedTopicId,
        uworldRemainingQuestions: t.uworldRemainingQuestions,
        alreadyCompletedLearningPercentage: t.alreadyCompletedLearningPercentage,
        alreadyCompletedQuestionCount: t.alreadyCompletedQuestionCount,
        incorrectQuestionsRemaining: t.incorrectQuestionsRemaining ?? 0,
      }))
      .sort((a, b) => a.normalizedTopicId.localeCompare(b.normalizedTopicId)),
    personalSourcePaceMultiplier: validatedInput.personalSourcePaceMultiplier,
    examReviewWindowDays: validatedInput.examReviewWindowDays ?? 0,
    mixedReviewQuestionsPerDay: validatedInput.mixedReviewQuestionsPerDay ?? 0,
    dueReviewMinutesByDate: Object.entries(validatedInput.dueReviewMinutesByDate ?? {})
      .sort(([a], [b]) => a.localeCompare(b)),
    acceptOverload: validatedInput.acceptOverload ?? false,
  }, null, 0)
  return sha256Hex(canonical)
}

export async function checkIdempotency(env, userId, clientRequestId) {
  if (!clientRequestId) return { status: 'no_key' }

  const { results } = await env.DB.prepare(
    'SELECT id, request_fingerprint FROM rotation_planner_plans WHERE user_id = ? AND client_request_id = ?'
  ).bind(userId, clientRequestId).all()

  if (results.length === 0) return { status: 'not_found' }

  return {
    status: 'found',
    existingPlanId: results[0].id,
    existingFingerprint: results[0].request_fingerprint,
  }
}

export async function calculateTaskUpdateFingerprint(userId, taskId, action, payload) {
  const canonical = JSON.stringify({
    userId,
    taskId,
    action,
    payload,
  }, null, 0)
  return sha256Hex(canonical)
}

export async function calculateRecalculationFingerprint(userId, planId, recalculationDate, expectedRevision) {
  const canonical = JSON.stringify({
    userId,
    planId,
    recalculationDate,
    expectedRevision,
  }, null, 0)
  return sha256Hex(canonical)
}
