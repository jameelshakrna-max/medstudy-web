export const PLANNER_TABLES = {
  plans: 'rotation_planner_plans',
  availability: 'rotation_planner_availability',
  topics: 'rotation_planner_topics',
  dailyTasks: 'rotation_planner_daily_tasks',
  taskSessions: 'rotation_planner_task_sessions',
  userSourcePace: 'user_source_pace',
}

export const PLAN_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived']

export const STUDY_STYLES = ['focused', 'active', 'detailed_notes']

export const SCHEDULING_MODES = ['focused', 'efficient']

export const QUESTION_START_RULES = ['next_available_day', 'same_day_if_capacity']

export const TOPIC_STATUSES = [
  'not_started',
  'learning',
  'questions_locked',
  'uworld_in_progress',
  'incorrect_review',
  'maintenance',
  'completed',
]

export const TASK_TYPES = [
  'learning',
  'consolidation',
  'flashcard_review',
  'uworld_questions',
  'incorrect_review',
  'mixed_review',
  'optional_book_questions',
]

export const TASK_STATUSES = [
  'locked',
  'pending',
  'in_progress',
  'partial',
  'completed',
  'skipped',
]

export const V1_TABLES = [
  'rotation_plans',
  'rotation_availability',
  'rotation_schedule',
  'rotation_topic_progress',
]

export const ALL_PLANNER_COLUMNS = {
  plans: [
    'id', 'user_id', 'rotation_id', 'source_id', 'source_version',
    'start_date', 'end_date', 'exam_date',
    'study_style', 'scheduling_mode', 'question_start_rule',
    'preferred_questions_per_day', 'minimum_questions_per_session',
    'maximum_questions_per_day', 'average_minutes_per_question',
    'buffer_percentage', 'maximum_active_topics',
    'status', 'settings_json', 'created_at', 'updated_at',
  ],
  availability: [
    'id', 'plan_id', 'weekday', 'available_minutes', 'is_day_off',
  ],
  topics: [
    'id', 'plan_id', 'canonical_topic_id', 'source_topic_id',
    'topic_title', 'group_id',
    'base_learning_minutes', 'personalized_learning_minutes',
    'total_uworld_questions', 'completed_uworld_questions',
    'learning_completed_at', 'questions_unlocked_at',
    'status', 'mastery_score', 'display_order',
  ],
  dailyTasks: [
    'id', 'plan_id', 'plan_topic_id', 'task_date', 'task_type',
    'provider', 'estimated_minutes', 'actual_minutes',
    'target_count', 'completed_count', 'mode', 'question_pool',
    'status', 'unlock_condition', 'display_order',
    'metadata_json', 'created_at', 'updated_at',
  ],
  taskSessions: [
    'id', 'user_id', 'task_id', 'source_id',
    'planned_minutes', 'active_minutes', 'completion_percentage',
    'interrupted', 'valid_for_calibration', 'created_at',
  ],
  userSourcePace: [
    'user_id', 'source_id', 'activity_type',
    'pace_multiplier', 'sample_count', 'updated_at',
  ],
}

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function getMigrationSql() {
  return readFileSync(
    resolve(__dirname, '../../schema-migration13.sql'),
    'utf8'
  )
}
