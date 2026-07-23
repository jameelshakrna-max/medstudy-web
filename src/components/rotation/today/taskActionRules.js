export const TASK_TYPE_LABELS = {
  learning: 'Learning',
  consolidation: 'Consolidation',
  uworld_questions: 'UWorld Questions',
  incorrect_review: 'Incorrect Review',
  mixed_review: 'Mixed Review',
  optional_book_questions: 'Optional Book Questions',
  flashcard_review: 'Flashcard Review',
};

export const TASK_TYPE_ICONS = {
  learning: 'BookOpen',
  consolidation: 'Brain',
  uworld_questions: 'FileQuestion',
  incorrect_review: 'RotateCcw',
  mixed_review: 'Layers',
  optional_book_questions: 'Bookmark',
  flashcard_review: 'GraduationCap',
};

const PERCENTAGE_TASK_TYPES = ['learning', 'consolidation'];
const COUNT_TASK_TYPES = ['uworld_questions', 'incorrect_review'];
const OPTIONAL_COUNT_TASK_TYPES = ['mixed_review', 'optional_book_questions', 'flashcard_review'];

export function getAvailableTaskActions(task) {
  const { status } = task;
  switch (status) {
    case 'locked':
      return [];
    case 'pending':
      return ['start', 'complete', 'partial', 'skip'];
    case 'in_progress':
      return ['complete', 'partial', 'record_time', 'record_questions'];
    case 'partial':
    case 'completed':
    case 'skipped':
      return [];
    default:
      return [];
  }
}

export function getCompletionFields(taskType) {
  switch (taskType) {
    case 'uworld_questions':
      return {
        completedCount: 'required',
        incorrectCount: 'required',
        actualMinutes: 'optional',
      };
    case 'incorrect_review':
      return {
        completedCount: 'required',
        actualMinutes: 'optional',
      };
    case 'learning':
    case 'consolidation':
      return {
        actualMinutes: 'optional',
      };
    case 'mixed_review':
    case 'optional_book_questions':
    case 'flashcard_review':
      return {
        actualMinutes: 'optional',
      };
    default:
      return {};
  }
}

export function getPartialFields(taskType) {
  switch (taskType) {
    case 'learning':
    case 'consolidation':
      return {
        completedPercentage: 'required (1-99)',
        actualMinutes: 'optional',
      };
    case 'uworld_questions':
      return {
        completedCount: 'required',
        incorrectCount: 'required',
        actualMinutes: 'optional',
      };
    case 'incorrect_review':
      return {
        completedCount: 'required',
        actualMinutes: 'optional',
      };
    case 'mixed_review':
    case 'optional_book_questions':
    case 'flashcard_review':
      return {
        completedCount: 'conditional (if targetCount exists)',
        actualMinutes: 'optional',
      };
    default:
      return {};
  }
}

export function getTaskProgressRatio(task) {
  const { taskType } = task;

  if (PERCENTAGE_TASK_TYPES.includes(taskType)) {
    return Math.min(1, Math.max(0, (task.completionPercentage ?? 0) / 100));
  }

  if (COUNT_TASK_TYPES.includes(taskType) || OPTIONAL_COUNT_TASK_TYPES.includes(taskType)) {
    const target = task.targetCount ?? 0;
    if (target <= 0) return 0;
    const completed = task.completedCount ?? 0;
    return Math.min(1, Math.max(0, completed / target));
  }

  return 0;
}

export function calculatePlannerTime(tasks) {
  let totalEstimatedMinutes = 0;
  let totalActualMinutes = 0;
  let completedMinutes = 0;

  for (const task of tasks) {
    const estimated = task.estimatedMinutes ?? 0;
    totalEstimatedMinutes += estimated;
    totalActualMinutes += task.actualMinutes ?? 0;

    const ratio = getTaskProgressRatio(task);
    completedMinutes += ratio * estimated;
  }

  const weightedProgress =
    totalEstimatedMinutes > 0 ? completedMinutes / totalEstimatedMinutes : 0;

  return {
    totalEstimatedMinutes,
    totalActualMinutes,
    completedMinutes,
    weightedProgress,
  };
}
