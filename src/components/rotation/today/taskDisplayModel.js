const TASK_TYPE_LABELS = {
  learning: 'Learning',
  questions: 'Questions',
  review: 'Review',
  assessment: 'Assessment',
  flashcards: 'Flashcards',
};

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

export function formatProgress(task) {
  if (task.targetCount && task.targetCount > 0) {
    const completed = task.completedCount || 0;
    const percent = Math.round((completed / task.targetCount) * 100);
    return { percent, label: `${completed}/${task.targetCount} questions` };
  }

  if (task.completionPercentage != null && task.completionPercentage > 0) {
    return { percent: Math.round(task.completionPercentage), label: `${Math.round(task.completionPercentage)}%` };
  }

  return { percent: 0, label: 'Not started' };
}

export function getTaskDisplayModel(task, todayKey) {
  const progress = formatProgress(task);
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
  };
}
