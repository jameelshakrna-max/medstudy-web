import { TASK_TYPE_LABELS } from './taskActionRules'

export const STATUS_LABELS = {
  locked: 'Locked',
  pending: 'Pending',
  in_progress: 'In Progress',
  partial: 'Partial',
  completed: 'Completed',
  skipped: 'Skipped',
};

const TERMINAL_STATUSES = new Set(['completed', 'partial', 'skipped']);

export function formatMinutes(mins) {
  if (!mins || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatProgress(task, status) {
  if (task.targetCount && task.targetCount > 0) {
    const completed = task.completedCount || 0;
    const percent = Math.round((completed / task.targetCount) * 100);
    return { percent, label: `${completed}/${task.targetCount} questions` };
  }

  if (task.completionPercentage != null && task.completionPercentage > 0) {
    return { percent: Math.round(task.completionPercentage), label: `${Math.round(task.completionPercentage)}%` };
  }

  if (status === 'in_progress') {
    return { percent: 0, label: 'In progress' };
  }

  return { percent: 0, label: 'Not started' };
}

export function getTaskDisplayModel(task, todayKey, topic = null) {
  const progress = formatProgress(task, task.status);
  const taskDate = task.taskDate || '';
  const isOverdue = todayKey ? taskDate < todayKey && !TERMINAL_STATUSES.has(task.status) : false;

  return {
    id: task.id,
    planId: task.planId,
    planTopicId: task.planTopicId,
    taskDate: task.taskDate,
    taskType: task.taskType,
    status: task.status,
    displayOrder: task.displayOrder,
    studyBlockId: task.studyBlockId ?? null,

    statusLabel: STATUS_LABELS[task.status] || task.status,
    typeLabel: TASK_TYPE_LABELS[task.taskType] || task.taskType,
    estimatedMinutes: task.estimatedMinutes || 0,
    actualMinutes: task.actualMinutes || 0,
    targetCount: task.targetCount,
    completedCount: task.completedCount || 0,
    completionPercentage: task.completionPercentage || 0,
    incorrectCount: task.incorrectCount || 0,

    progressPercent: progress.percent,
    progressLabel: progress.label,

    timeEstimate: formatMinutes(task.estimatedMinutes),
    timeActual: task.actualMinutes ? formatMinutes(task.actualMinutes) : '',

    isLocked: task.status === 'locked',
    isActive: task.status === 'in_progress',
    isCompleted: task.status === 'completed',
    isTerminal: TERMINAL_STATUSES.has(task.status),
    isOverdue,

    provider: task.provider,
    mode: task.mode,

    metadataJson: task.metadataJson,
    unlockCondition: task.unlockCondition ?? null,

    // Flashcard review fields (passed through from backend)
    dueCardCount: task.dueCardCount ?? task.metadataJson?.dueCardCount ?? 0,
    scheduledMinutes: task.scheduledMinutes ?? task.metadataJson?.scheduledMinutes ?? 0,
    unmetReviewMinutes: task.unmetReviewMinutes ?? task.metadataJson?.unmetReviewMinutes ?? 0,
    deckNames: task.deckNames ?? task.metadataJson?.deckNames ?? [],

    topicTitle: topic?.topicTitle || null,
    topicSection: topic?.groupId || null,
  };
}
