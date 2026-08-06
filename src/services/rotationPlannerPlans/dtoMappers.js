const PLAN_SUMMARY_COLUMNS = [
  'id', 'user_id', 'rotation_id', 'source_id', 'source_version',
  'start_date', 'end_date', 'exam_date',
  'study_style', 'scheduling_mode', 'question_start_rule',
  'preferred_questions_per_day', 'minimum_questions_per_session',
  'maximum_questions_per_day', 'average_minutes_per_question',
  'buffer_percentage', 'maximum_active_topics',
  'status', 'uses_flashcard_capacity', 'uworld_scheduling_mode', 'settings_json', 'created_at', 'updated_at',
  'revision', 'last_recalculated_at', 'stale_at',
  'display_name',
]

const PLAN_NESTED_COLUMNS = [...PLAN_SUMMARY_COLUMNS]
const AVAILABILITY_COLUMNS = ['id', 'plan_id', 'weekday', 'available_minutes', 'is_day_off']
const TOPIC_COLUMNS = [
  'id', 'plan_id', 'normalized_topic_id', 'canonical_topic_id',
  'source_topic_id', 'shared_topic_key',
  'topic_title', 'group_id',
  'base_learning_minutes', 'personalized_learning_minutes',
  'total_uworld_questions', 'completed_uworld_questions',
  'learning_completed_at', 'questions_unlocked_at',
  'status', 'mastery_score', 'display_order',
  'incorrect_questions_remaining',
]
const TASK_COLUMNS = [
  'id', 'plan_id', 'plan_topic_id', 'plan_question_group_id', 'task_date', 'task_type',
  'provider', 'estimated_minutes', 'actual_minutes',
  'target_count', 'completed_count', 'mode', 'question_pool',
  'status', 'unlock_condition', 'display_order',
  'is_pinned', 'metadata_json', 'created_at', 'updated_at',
  'completion_percentage', 'incorrect_count', 'completed_at', 'completed_on',
]
const QUESTION_GROUP_COLUMNS = [
  'id', 'plan_id', 'group_key', 'title', 'system',
  'target_questions', 'member_topic_ids_json', 'required_topic_ids_json',
  'excluded', 'display_order', 'created_at', 'updated_at',
]

function toCamelCase(snakeStr) {
  return snakeStr.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function mapRow(row, columns) {
  const result = {}
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]
    result[toCamelCase(col)] = row[col] ?? row[i] ?? null
  }
  return result
}

function safeParseJson(str, fallback = null) {
  if (str === null || str === undefined) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

// User-facing title for a plan. Never falls back to a technical sourceId or
// rotationId slug — null display_name resolves to sourceTitle, then to the
// human-readable rotation label, then to a generic fallback.
export function resolveDisplayName({ displayName, sourceTitle, rotationDisplayLabel }) {
  if (typeof displayName === 'string' && displayName.trim() !== '') return displayName.trim()
  if (typeof sourceTitle === 'string' && sourceTitle.trim() !== '') return sourceTitle.trim()
  if (typeof rotationDisplayLabel === 'string' && rotationDisplayLabel.trim() !== '') return rotationDisplayLabel.trim()
  return 'Rotation Plan'
}

function mapPlanSummaryDto(row, sourceTitle, counts = {}, rotationDisplayLabel = null) {
  const columns = PLAN_SUMMARY_COLUMNS
  const dto = mapRow(row, columns)
  dto.sourceTitle = sourceTitle || null
  dto.displayName = resolveDisplayName({ displayName: dto.displayName, sourceTitle, rotationDisplayLabel })
  dto.settingsJson = safeParseJson(dto.settingsJson, {})
  dto.topicCount = counts.topicCount ?? 0
  dto.completedTopicCount = counts.completedTopicCount ?? 0
  dto.taskCount = counts.taskCount ?? 0
  dto.completedTaskCount = counts.completedTaskCount ?? 0
  return dto
}

function mapPlanDto(row, sourceTitle = null, rotationDisplayLabel = null) {
  const dto = mapRow(row, PLAN_NESTED_COLUMNS)
  dto.sourceTitle = sourceTitle || null
  dto.displayName = resolveDisplayName({ displayName: dto.displayName, sourceTitle, rotationDisplayLabel })
  dto.settingsJson = safeParseJson(dto.settingsJson, {})
  return dto
}

function mapAvailabilityDto(row) {
  return mapRow(row, AVAILABILITY_COLUMNS)
}

function mapTopicDto(row) {
  return mapRow(row, TOPIC_COLUMNS)
}

function mapTaskDto(row) {
  const dto = mapRow(row, TASK_COLUMNS)
  dto.metadataJson = safeParseJson(dto.metadataJson, {})
  dto.studyBlockId = dto.metadataJson?.studyBlockId ?? null
  return dto
}

function mapQuestionGroupDto(row) {
  const dto = mapRow(row, QUESTION_GROUP_COLUMNS)
  dto.memberTopicIds = safeParseJson(dto.memberTopicIdsJson, [])
  dto.requiredTopicIds = safeParseJson(dto.requiredTopicIdsJson, [])
  delete dto.memberTopicIdsJson
  delete dto.requiredTopicIdsJson
  return dto
}

function toSnakeCaseKey(camelStr) {
  return camelStr.replace(/([A-Z])/g, '_$1').toLowerCase()
}

function mapToSnakeCase(obj) {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCaseKey(key)] = value
  }
  return result
}

export {
  PLAN_SUMMARY_COLUMNS,
  PLAN_NESTED_COLUMNS,
  AVAILABILITY_COLUMNS,
  TOPIC_COLUMNS,
  TASK_COLUMNS,
  QUESTION_GROUP_COLUMNS,
  toCamelCase,
  mapRow,
  safeParseJson,
  mapPlanSummaryDto,
  mapPlanDto,
  mapAvailabilityDto,
  mapTopicDto,
  mapTaskDto,
  mapQuestionGroupDto,
  toSnakeCaseKey,
  mapToSnakeCase,
}
