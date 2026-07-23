export const TODAY_SECTIONS = [
  { key: 'active', label: 'Active Task', filter: (task) => task.status === 'in_progress' },
  { key: 'overdue', label: 'Overdue', filter: (task, todayKey) => task.status !== 'completed' && task.status !== 'skipped' && task.status !== 'in_progress' && task.taskDate < todayKey },
  { key: 'due_reviews', label: 'Due Reviews', filter: (task, todayKey) => task.taskType === 'flashcard_review' && task.taskDate === todayKey && task.status !== 'completed' && task.status !== 'skipped' },
  { key: 'learn', label: 'Learn', filter: (task, todayKey) => (task.taskType === 'learning' || task.taskType === 'consolidation') && task.taskDate === todayKey && task.status !== 'completed' && task.status !== 'skipped' && task.status !== 'in_progress' },
  { key: 'uworld', label: 'UWorld', filter: (task, todayKey) => task.taskType === 'uworld_questions' && task.taskDate === todayKey && task.status !== 'completed' && task.status !== 'skipped' && task.status !== 'in_progress' },
  { key: 'incorrect_review', label: 'Incorrect Review & Consolidation', filter: (task, todayKey) => task.taskType === 'incorrect_review' && task.taskDate === todayKey && task.status !== 'completed' && task.status !== 'skipped' && task.status !== 'in_progress' },
  { key: 'practice', label: 'Practice', filter: (task, todayKey) => task.taskType === 'optional_book_questions' && task.taskDate === todayKey && task.status !== 'completed' && task.status !== 'skipped' && task.status !== 'in_progress' },
];

export function sortTasksForSection(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
    if (a.status !== 'in_progress' && b.status === 'in_progress') return 1;
    return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  });
}

export function groupTasksBySection(tasks, todayKey) {
  return TODAY_SECTIONS
    .map((section) => ({
      key: section.key,
      label: section.label,
      tasks: sortTasksForSection(tasks.filter((task) => section.filter(task, todayKey))),
    }))
    .filter((section) => section.tasks.length > 0);
}

export function calculateSectionProgress(tasks) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed' || t.status === 'partial').length;
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
  return { completed, total, percent: total === 0 ? 0 : completed / total, totalMinutes };
}

function getTaskProgressRatio(task) {
  if (task.status === 'completed') return 1;
  if (task.status === 'partial') return (task.completionPercentage ?? 50) / 100;
  if (task.status === 'in_progress') return (task.completionPercentage ?? 0) / 100;
  return 0;
}

export function calculateDayProgress(allTasks, todayKey) {
  let completedTasks = 0;
  let activeTasks = 0;
  let overdueTasks = 0;
  let totalMinutes = 0;
  let completedMinutes = 0;
  let weightedSum = 0;
  let weightSum = 0;

  for (const task of allTasks) {
    const minutes = task.estimatedMinutes || 0;
    totalMinutes += minutes;

    if (task.status === 'completed' || task.status === 'partial') {
      completedTasks++;
      completedMinutes += minutes;
    } else if (task.status === 'in_progress') {
      activeTasks++;
    } else if (task.taskDate < todayKey && task.status !== 'skipped') {
      overdueTasks++;
    }

    const ratio = getTaskProgressRatio(task);
    weightedSum += ratio * minutes;
    weightSum += minutes;
  }

  return {
    totalTasks: allTasks.length,
    completedTasks,
    activeTasks,
    overdueTasks,
    totalMinutes,
    completedMinutes,
    weightedProgress: weightSum === 0 ? 0 : weightedSum / weightSum,
  };
}

const todayGrouping = {
  TODAY_SECTIONS,
  groupTasksBySection,
  sortTasksForSection,
  calculateSectionProgress,
  calculateDayProgress,
};

export default todayGrouping;
