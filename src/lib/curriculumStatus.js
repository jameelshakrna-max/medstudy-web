export const TOPIC_STATUS = {
  not_started: 'not_started',
  in_progress: 'in_progress',
  reviewing: 'reviewing',
  complete: 'complete',
}

const STATUS_VALUE_MAP = {
  'Not Started': TOPIC_STATUS.not_started,
  'In Progress': TOPIC_STATUS.in_progress,
  Reviewing: TOPIC_STATUS.reviewing,
  Complete: TOPIC_STATUS.complete,
}

const STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  reviewing: 'Reviewing',
  complete: 'Complete',
}

export function resolveTopicStatus(topic) {
  if (!topic || typeof topic !== 'object') return TOPIC_STATUS.not_started
  const raw = topic.status
  if (Object.prototype.hasOwnProperty.call(STATUS_VALUE_MAP, raw)) return STATUS_VALUE_MAP[raw]
  if (typeof raw === 'number') {
    if (raw === 0) return TOPIC_STATUS.not_started
    if (raw === 1) return TOPIC_STATUS.in_progress
    if (raw === 2) return TOPIC_STATUS.complete
    if (raw === 3) return TOPIC_STATUS.reviewing
    return TOPIC_STATUS.not_started
  }
  const pct = topic.completion_pct
  if (typeof pct === 'number' && Number.isFinite(pct)) {
    if (pct >= 100) return TOPIC_STATUS.complete
    if (pct > 0) return TOPIC_STATUS.in_progress
  }
  return TOPIC_STATUS.not_started
}

export function aggregateStatus(topics) {
  const list = Array.isArray(topics) ? topics : []
  if (list.length === 0) return TOPIC_STATUS.not_started
  const statuses = list.map(resolveTopicStatus)
  if (statuses.every(s => s === TOPIC_STATUS.complete)) return TOPIC_STATUS.complete
  if (statuses.some(s => s === TOPIC_STATUS.reviewing)) return TOPIC_STATUS.reviewing
  if (statuses.some(s => s === TOPIC_STATUS.in_progress || s === TOPIC_STATUS.complete)) return TOPIC_STATUS.in_progress
  return TOPIC_STATUS.not_started
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.not_started
}

export function statusTone(status) {
  switch (status) {
    case TOPIC_STATUS.complete:
      return { color: 'var(--color-success)', soft: 'var(--color-success-soft)', badge: 'success' }
    case TOPIC_STATUS.reviewing:
      return { color: 'var(--color-info)', soft: 'var(--color-info-soft)', badge: 'info' }
    case TOPIC_STATUS.in_progress:
      return { color: 'var(--color-brand)', soft: 'var(--color-brand-soft)', badge: 'brand' }
    case TOPIC_STATUS.not_started:
    default:
      return { color: 'var(--mist)', soft: 'var(--input-bg)', badge: 'neutral' }
  }
}
