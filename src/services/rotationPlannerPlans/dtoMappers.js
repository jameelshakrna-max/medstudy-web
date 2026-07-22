const PLAN_SUMMARY_COLUMNS = [
  'id', 'user_id', 'rotation_id', 'source_id', 'source_version',
  'start_date', 'end_date', 'exam_date',
  'study_style', 'scheduling_mode', 'question_start_rule',
  'preferred_questions_per_day', 'minimum_questions_per_session',
  'maximum_questions_per_day', 'average_minutes_per_question',
  'buffer_percentage', 'maximum_active_topics',
  'status', 'settings_json', 'created_at', 'updated_at',
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
]
const TASK_COLUMNS = [
  'id', 'plan_id', 'plan_topic_id', 'task_date', 'task_type',
  'provider', 'estimated_minutes', 'actual_minutes',
  'target_count', 'completed_count', 'mode', 'question_pool',
  'status', 'unlock_condition', 'display_order',
  'metadata_json', 'created_at', 'updated_at',
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

function mapPlanSummaryDto(row, sourceTitle, counts = {}) {
  const columns = PLAN_SUMMARY_COLUMNS
  const dto = mapRow(row, columns)
  dto.sourceTitle = sourceTitle || null
  dto.settingsJson = safeParseJson(dto.settingsJson, {})
  dto.topicCount = counts.topicCount ?? 0
  dto.completedTopicCount = counts.completedTopicCount ?? 0
  dto.taskCount = counts.taskCount ?? 0
  dto.completedTaskCount = counts.completedTaskCount ?? 0
  return dto
}

function mapPlanDto(row) {
  const dto = mapRow(row, PLAN_NESTED_COLUMNS)
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
  toCamelCase,
  mapRow,
  safeParseJson,
  mapPlanSummaryDto,
  mapPlanDto,
  mapAvailabilityDto,
  mapTopicDto,
  mapTaskDto,
  toSnakeCaseKey,
  mapToSnakeCase,
}
