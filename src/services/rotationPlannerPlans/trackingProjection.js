import { getDateKeyForTimezone } from '../../lib/dateUtils.js'
import { addDays } from '../rotationPlannerV2/dateUtils.js'
import { parseUnlockCondition, isUnlockConditionSatisfied } from './unlockRules.js'

const CANDIDATE_TASK_TYPES = new Set(['uworld_questions', 'incorrect_review'])
const STATUS_PRIORITY = {
  overdue: 0,
  due_today: 1,
  in_progress: 2,
  ready: 3,
  locked: 4,
  planned: 5,
}
const SELECTION_STATUS_ORDER = ['active', 'draft', 'paused', 'completed']
const SELECTION_REASON_BY_STATUS = {
  active: 'active',
  draft: 'newest_draft',
  paused: 'newest_paused',
  completed: 'newest_completed',
}

export function deriveTaskStatus(task, contextState, todayKey) {
  if (contextState?.excluded) return 'excluded'
  if (task.status === 'completed' || task.status === 'skipped') return 'completed'
  const target = task.targetCount ?? 0
  const completed = task.completedCount ?? 0
  const remaining = Math.max(0, target - completed)
  if (task.status === 'partial' && completed > 0 && remaining > 0) return 'partial'
  if (task.status === 'in_progress') return 'in_progress'
  const isLocked = parseUnlockCondition(task.unlockCondition) !== null &&
    !isUnlockConditionSatisfied(task.unlockCondition, contextState)
  if (!isLocked && task.status === 'pending' && task.taskDate < todayKey) return 'overdue'
  if (!isLocked && task.status === 'pending' && task.taskDate === todayKey) return 'due_today'
  if (isLocked) return 'locked'
  if (!isLocked && task.taskDate <= todayKey) return 'ready'
  return 'planned'
}

export function selectTrackingPlan(planSummaries) {
  const summaries = planSummaries || []
  for (const status of SELECTION_STATUS_ORDER) {
    const matches = summaries.filter(s => s.status === status)
    if (matches.length === 0) continue
    const best = [...matches].sort((a, b) => {
      const byUpdatedAt = (b.updatedAt || '').localeCompare(a.updatedAt || '')
      if (byUpdatedAt !== 0) return byUpdatedAt
      return (a.id || '').localeCompare(b.id || '')
    })[0]
    return { plan: best, selectionReason: SELECTION_REASON_BY_STATUS[status] }
  }
  return { plan: null, selectionReason: null }
}

function resolveContextState(task, maps) {
  if (task.planQuestionGroupId) return maps.groupStateByGroupId.get(task.planQuestionGroupId) || null
  if (task.planTopicId) return maps.topicStateByPlanTopicId.get(task.planTopicId) || null
  return null
}

function buildMaps(topics, questionGroups, topicStates, groupStates) {
  const groupByGroupId = new Map()
  const groupByKey = new Map()
  for (const g of questionGroups || []) {
    groupByGroupId.set(g.id, g)
    if (g.groupKey) groupByKey.set(g.groupKey, g)
  }
  const groupStateByGroupId = new Map((groupStates || []).map(s => [s.id, s]))
  const topicStateByPlanTopicId = new Map((topicStates || []).map(s => [s.planTopicId, s]))
  const topicByCanonicalId = new Map()
  const topicBySourceId = new Map()
  for (const t of topics || []) {
    if (t.canonicalTopicId) topicByCanonicalId.set(t.canonicalTopicId, t)
    if (t.sourceTopicId) topicBySourceId.set(t.sourceTopicId, t)
  }
  return { groupByGroupId, groupByKey, groupStateByGroupId, topicStateByPlanTopicId, topicByCanonicalId, topicBySourceId }
}

function displayOrderOf(task, maps) {
  const group = maps.groupByGroupId.get(task.planQuestionGroupId)
  return group ? (group.displayOrder ?? 0) : (task.displayOrder ?? 0)
}

function buildMissingPrereqs(task, status, maps) {
  if (status !== 'locked') return []
  const parsed = parseUnlockCondition(task.unlockCondition)
  if (!parsed) return []
  if (parsed.type === 'learning_completed' || parsed.type === 'uworld_completed') {
    const topic = maps.topicByCanonicalId.get(parsed.canonicalTopicId)
    if (!topic) return []
    return [{ planTopicId: topic.id, canonicalTopicId: topic.canonicalTopicId, title: topic.topicTitle }]
  }
  if (parsed.type === 'learning_group_completed' || parsed.type === 'uworld_group_completed') {
    const group = maps.groupByKey.get(parsed.canonicalTopicId)
    if (!group) return []
    const groupState = maps.groupStateByGroupId.get(group.id)
    const sourceIds = groupState?.unfinishedRequiredTopics || []
    const result = []
    for (const sourceId of sourceIds) {
      const topic = maps.topicBySourceId.get(sourceId)
      if (topic) result.push({ planTopicId: topic.id, canonicalTopicId: topic.canonicalTopicId, title: topic.topicTitle })
    }
    return result
  }
  return []
}

function buildScheduleItem(task, maps, todayKey, options = {}) {
  const group = maps.groupByGroupId.get(task.planQuestionGroupId) || null
  const contextState = resolveContextState(task, maps)
  const status = deriveTaskStatus(task, contextState, todayKey)
  const useGroupCounts = options.groupLevelCounts && group
  const groupState = group ? maps.groupStateByGroupId.get(group.id) : null
  const targetQuestions = useGroupCounts
    ? (groupState?.targetQuestions ?? group.targetQuestions ?? 0)
    : (task.targetCount ?? 0)
  const completedQuestions = useGroupCounts
    ? (groupState?.completedQuestions ?? 0)
    : (task.completedCount ?? 0)
  const remainingQuestions = Math.max(0, targetQuestions - completedQuestions)
  const isPlanned = task.taskDate > todayKey
  return {
    taskId: task.id,
    planQuestionGroupId: task.planQuestionGroupId ?? null,
    groupKey: group?.groupKey ?? null,
    groupTitle: group?.title ?? null,
    taskType: task.taskType,
    plannedDate: task.taskDate,
    targetQuestions,
    completedQuestions,
    remainingQuestions,
    status,
    missingLearningPrerequisites: buildMissingPrereqs(task, status, maps),
    isPlanned,
    mayMove: isPlanned,
  }
}

function compareTasks(a, b, maps) {
  if (a.taskDate !== b.taskDate) return a.taskDate < b.taskDate ? -1 : 1
  const da = displayOrderOf(a, maps)
  const db = displayOrderOf(b, maps)
  if (da !== db) return da - db
  return a.id < b.id ? -1 : 1
}

function computeNextBlock(tasks, maps, todayKey) {
  const candidates = tasks.filter(task => {
    if (!CANDIDATE_TASK_TYPES.has(task.taskType)) return false
    if (task.status === 'skipped') return false
    const contextState = resolveContextState(task, maps)
    const status = deriveTaskStatus(task, contextState, todayKey)
    if (status === 'completed' || status === 'excluded') return false
    return true
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const statusA = deriveTaskStatus(a, resolveContextState(a, maps), todayKey)
    const statusB = deriveTaskStatus(b, resolveContextState(b, maps), todayKey)
    const priorityA = STATUS_PRIORITY[statusA] ?? 5
    const priorityB = STATUS_PRIORITY[statusB] ?? 5
    if (priorityA !== priorityB) return priorityA - priorityB
    return compareTasks(a, b, maps)
  })
  const seenGroups = new Set()
  const winner = candidates.find(task => {
    const key = task.planQuestionGroupId ?? task.id
    if (seenGroups.has(key)) return false
    seenGroups.add(key)
    return true
  })
  if (!winner) return null
  return buildScheduleItem(winner, maps, todayKey, { groupLevelCounts: true })
}

export function buildTrackingProjection({ plan, topics, tasks, questionGroups, topicStates, groupStates, nowIso, timezone, windowDays }) {
  const todayKey = getDateKeyForTimezone(nowIso, timezone)
  const startDate = todayKey
  const endDate = addDays(todayKey, windowDays - 1)
  const window = { timezone, startDate, endDate, windowDays }
  const maps = buildMaps(topics, questionGroups, topicStates, groupStates)
  const inWindow = task => task.taskDate >= startDate && task.taskDate <= endDate

  const schedule = (tasks || [])
    .filter(task => task.taskType === 'uworld_questions' && inWindow(task))
    .sort((a, b) => compareTasks(a, b, maps))
    .map(task => buildScheduleItem(task, maps, todayKey))

  const incorrectReview = (tasks || [])
    .filter(task => task.taskType === 'incorrect_review' && inWindow(task))
    .sort((a, b) => compareTasks(a, b, maps))
    .map(task => buildScheduleItem(task, maps, todayKey))

  const nextBlock = computeNextBlock(tasks || [], maps, todayKey)

  return { window, nextBlock, schedule, incorrectReview }
}
