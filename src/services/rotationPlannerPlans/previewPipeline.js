import { getStudySource } from '../../data/studySources/sourceRegistry.js'
import { buildRotationSchedule } from '../rotationPlannerV2/buildRotationSchedule.js'

export function generatePlanPreview(resolvedTopics, validatedInput) {
  const source = getStudySource(validatedInput.sourceId)
  const sourceVersion = source?.version || '1.0.0'

  const config = buildSchedulerConfig(resolvedTopics, validatedInput, sourceVersion)
  const preview = buildRotationSchedule(config)

  return {
    preview,
    sourceVersion,
    config,
  }
}

function buildSchedulerConfig(resolvedTopics, validatedInput, sourceVersion) {
  const dueReviewMinutesByDate = {}
  for (const [dateStr, minutes] of Object.entries(validatedInput.dueReviewMinutesByDate || {})) {
    dueReviewMinutesByDate[dateStr] = minutes
  }

  return {
    rotationId: validatedInput.rotationId,
    sourceId: validatedInput.sourceId,
    startDate: validatedInput.startDate,
    endDate: validatedInput.endDate,
    examDate: validatedInput.examDate || undefined,
    studyStyle: validatedInput.studyStyle,
    schedulingMode: validatedInput.schedulingMode,
    questionStartRule: validatedInput.questionStartRule,
    preferredQuestionsPerDay: validatedInput.preferredQuestionsPerDay,
    minimumQuestionsPerSession: validatedInput.minimumQuestionsPerSession,
    maximumQuestionsPerDay: validatedInput.maximumQuestionsPerDay,
    averageMinutesPerQuestion: validatedInput.averageMinutesPerQuestion,
    bufferPercentage: validatedInput.bufferPercentage,
    maximumActiveTopics: validatedInput.maximumActiveTopics,
    availabilityByWeekday: validatedInput.availability,
    blockedDates: validatedInput.blockedDates || [],
    topics: resolvedTopics.map(t => ({
      normalizedTopicId: t.normalizedTopicId,
      canonicalTopicId: t.canonicalTopicId,
      sourceTopicId: t.sourceTopicId,
      title: t.title,
      learningMinutes: t.learningMinutes,
      uworldRemainingQuestions: t.uworldRemainingQuestions,
      alreadyCompletedLearningPercentage: t.alreadyCompletedLearningPercentage,
      alreadyCompletedQuestionCount: t.alreadyCompletedQuestionCount,
      incorrectQuestionsRemaining: t.incorrectQuestionsRemaining ?? 0,
      prerequisiteTopicIds: t.prerequisiteTopicIds || [],
      sharedTopicKey: t.sharedTopicKey,
    })),
    personalSourcePaceMultiplier: validatedInput.personalSourcePaceMultiplier,
    examReviewWindowDays: validatedInput.examReviewWindowDays || 0,
    mixedReviewQuestionsPerDay: validatedInput.mixedReviewQuestionsPerDay || 0,
    dueReviewMinutesByDate,
  }
}
