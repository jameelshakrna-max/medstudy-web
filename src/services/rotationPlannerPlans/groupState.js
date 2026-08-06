import { getCompletionFraction } from './recalculation.js'

function field(row, ...names) {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null) return row[name]
  }
  return null
}

// Derive per-group progress purely from persisted task history and the
// immutable question-group snapshot. Nothing is re-derived from the registry:
// targets come from the snapshot, and completed/incorrect progress comes from
// the group's uworld_questions and incorrect_review tasks.
//
// incorrectQuestionsRemaining is NOT optional at group level:
//   max(0, Σ incorrect_count on group uworld_questions tasks
//        − Σ completed_count on group incorrect_review tasks)
export function deriveActualGroupStates(groups, topics, tasks, { asOfDate } = {}) {
  const topicBySourceId = new Map()
  const topicById = new Map()
  for (const topic of topics) {
    const sourceId = field(topic, 'source_topic_id', 'sourceTopicId')
    if (sourceId) topicBySourceId.set(sourceId, topic)
    const id = field(topic, 'id', 'planTopicId')
    if (id) topicById.set(id, topic)
  }

  // Per-topic learning completion from learning task history (same semantics as
  // deriveActualTopicStates): a topic's learning is complete once completed
  // learning minutes reach its personalized learning minutes.
  const completedLearningMinutesByTopic = new Map()
  const unfinishedLearningByTopic = new Map()
  for (const task of tasks) {
    const planTopicId = field(task, 'plan_topic_id', 'planTopicId')
    const taskType = field(task, 'task_type', 'taskType')
    if (!planTopicId || taskType !== 'learning') continue
    const fraction = getCompletionFraction(task)
    if (fraction < 1) unfinishedLearningByTopic.set(planTopicId, true)
    if (fraction <= 0) continue
    const current = completedLearningMinutesByTopic.get(planTopicId) || 0
    completedLearningMinutesByTopic.set(planTopicId, current + (field(task, 'estimated_minutes', 'estimatedMinutes') || 0) * fraction)
  }

  const completedByGroup = new Map()
  const targetByGroup = new Map()
  const incorrectFromUworldByGroup = new Map()
  const reviewedByGroup = new Map()

  for (const task of tasks) {
    const gid = field(task, 'plan_question_group_id', 'planQuestionGroupId')
    if (!gid) continue
    const taskType = field(task, 'task_type', 'taskType')
    if (taskType === 'uworld_questions') {
      completedByGroup.set(gid, (completedByGroup.get(gid) || 0) + (field(task, 'completed_count', 'completedCount') || 0))
      targetByGroup.set(gid, (targetByGroup.get(gid) || 0) + (field(task, 'target_count', 'targetCount') || 0))
      incorrectFromUworldByGroup.set(gid, (incorrectFromUworldByGroup.get(gid) || 0) + (field(task, 'incorrect_count', 'incorrectCount') || 0))
    } else if (taskType === 'incorrect_review') {
      reviewedByGroup.set(gid, (reviewedByGroup.get(gid) || 0) + (field(task, 'completed_count', 'completedCount') || 0))
    }
  }

  return groups.map(group => {
    const gid = group.id
    const targetQuestions = group.targetQuestions || 0
    const completedQuestions = completedByGroup.get(gid) || 0
    const scheduledTarget = targetByGroup.get(gid) || 0
    const remainingQuestions = Math.max(0, targetQuestions - completedQuestions)
    const incorrectFromUworld = incorrectFromUworldByGroup.get(gid) || 0
    const incorrectFromReview = reviewedByGroup.get(gid) || 0
    const incorrectQuestionsRemaining = Math.max(0, incorrectFromUworld - incorrectFromReview)

    const requiredTopics = (group.requiredTopicIds || [])
      .map(id => topicBySourceId.get(id))
      .filter(Boolean)

    const unfinishedRequiredTopics = requiredTopics.filter(topic => {
      const topicId = field(topic, 'id', 'planTopicId')
      const personalizedMinutes = field(topic, 'personalized_learning_minutes', 'personalizedLearningMinutes') || 0
      const completedEquivalent = topicId ? completedLearningMinutesByTopic.get(topicId) || 0 : 0
      if (field(topic, 'learning_completed_at', 'learningCompletedAt')) {
        return topicId ? unfinishedLearningByTopic.has(topicId) : false
      }
      return Math.max(0, personalizedMinutes - completedEquivalent) > 0
    })
    const requiredLearningCompleted = unfinishedRequiredTopics.length === 0

    const unlockedAt = requiredLearningCompleted
      ? requiredTopics.reduce((latest, topic) => {
          const d = field(topic, 'learning_completed_at', 'learningCompletedAt')
          return d && (!latest || d > latest) ? d : latest
        }, null)
      : null

    const allScheduledQuestionsDone = scheduledTarget > 0 && completedQuestions >= scheduledTarget
    const reviewDone = incorrectQuestionsRemaining === 0

    let status
    if (group.excluded) {
      status = 'excluded'
    } else if (!requiredLearningCompleted) {
      status = 'locked'
    } else if (allScheduledQuestionsDone && reviewDone) {
      status = 'completed'
    } else if (completedQuestions > 0 || incorrectFromReview > 0) {
      status = 'in_progress'
    } else {
      status = 'pending'
    }

    return {
      id: gid,
      key: field(group, 'key', 'groupKey'),
      title: group.title,
      system: group.system,
      targetQuestions,
      completedQuestions,
      remainingQuestions,
      incorrectQuestionsRemaining,
      requiredLearningCompleted,
      unfinishedRequiredTopics: unfinishedRequiredTopics.map(t => field(t, 'source_topic_id', 'sourceTopicId')),
      status,
      unlockedAt,
      excluded: !!group.excluded,
      displayOrder: group.displayOrder || 0,
    }
  })
}
