import { getStudySource } from '../../data/studySources/sourceRegistry.js'
import { buildRotationSchedule } from '../rotationPlannerV2/buildRotationSchedule.js'
import { assignStudyBlocks } from '../rotationPlannerV2/studyBlockAssignment.js'
import { buildQuestionGroups } from './questionGroupBuilder.js'

export function generatePlanPreview(resolvedTopics, validatedInput) {
  const source = getStudySource(validatedInput.sourceId)
  const sourceVersion = source?.version || '1.0.0'

  const isGrouped = (validatedInput.uworldSchedulingMode || 'per_topic') === 'grouped'
  let questionGroupResult = null
  if (isGrouped) {
    questionGroupResult = buildQuestionGroups({
      resolvedTopics,
      preferredQuestionsPerDay: validatedInput.preferredQuestionsPerDay,
      questionGroupExclusions: validatedInput.questionGroupExclusions || [],
    })
    if (questionGroupResult.errors.length > 0) {
      throw new Error(`QUESTION_GROUP_VALIDATION_FAILED: ${questionGroupResult.errors[0].message}`)
    }
  }

  const config = buildSchedulerConfig(resolvedTopics, validatedInput, sourceVersion, questionGroupResult?.groups)
  const preview = buildRotationSchedule(config)

  const topicMap = new Map()
  for (const t of resolvedTopics) {
    topicMap.set(t.normalizedTopicId, { sourceId: t.sourceId, groupId: t.groupId })
  }

  preview.tasks = assignStudyBlocks(preview.tasks, topicMap)
  preview.questionGroups = questionGroupResult?.groups || []

  return {
    preview,
    sourceVersion,
    config,
    questionGroups: questionGroupResult?.groups || [],
    questionGroupErrors: questionGroupResult?.errors || [],
  }
}

function buildSchedulerConfig(resolvedTopics, validatedInput, sourceVersion, questionGroups) {
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
    uworldSchedulingMode: validatedInput.uworldSchedulingMode || 'per_topic',
    questionGroups: questionGroups || undefined,
    questionStartRule: validatedInput.questionStartRule,
    preferredQuestionsPerDay: validatedInput.preferredQuestionsPerDay,
    minimumQuestionsPerSession: validatedInput.minimumQuestionsPerSession,
    maximumQuestionsPerDay: validatedInput.maximumQuestionsPerDay,
    averageMinutesPerQuestion: validatedInput.averageMinutesPerQuestion,
    bufferPercentage: validatedInput.bufferPercentage,
    maximumActiveTopics: Math.min(
      validatedInput.maximumActiveTopics,
      validatedInput.schedulingMode === 'efficient' ? 2 : 1
    ),
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
    topicBreakdownByDate: validatedInput.topicBreakdownByDate || {},
  }
}
