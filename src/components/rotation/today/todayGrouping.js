export const TODAY_SECTIONS = [
  { key: 'active', label: 'Active Task', filter: (task) => task.status === 'in_progress' },
  { key: 'overdue', label: 'Overdue', filter: (task, todayKey) => (task.status === 'pending' || task.status === 'locked') && task.taskDate < todayKey },
  { key: 'due_reviews', label: 'Due Reviews', filter: (task, todayKey) => task.taskType === 'flashcard_review' && task.taskDate === todayKey && task.status !== 'completed' && task.status !== 'skipped' },
  { key: 'learn', label: 'Learn', filter: (task, todayKey) => (task.taskType === 'learning' || task.taskType === 'consolidation') && task.taskDate === todayKey && task.status !== 'completed' && task.status !== 'skipped' && task.status !== 'in_progress' },
  { key: 'uworld', label: 'UWorld', filter: (task, todayKey) => task.taskType === 'uworld_questions' && task.taskDate === todayKey && task.status !== 'completed' && task.status !== 'skipped' && task.status !== 'in_progress' },
  { key: 'incorrect_review', label: 'Incorrect Review & Consolidation', filter: (task, todayKey) => task.taskType === 'incorrect_review' && task.taskDate === todayKey && task.status !== 'completed' && task.status !== 'skipped' && task.status !== 'in_progress' },
  { key: 'practice', label: 'Practice', filter: (task, todayKey) => (task.taskType === 'optional_book_questions' || task.taskType === 'mixed_review') && task.taskDate === todayKey && task.status !== 'completed' && task.status !== 'skipped' && task.status !== 'in_progress' },
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

export function claimActiveBlockSiblings(sections) {
  const activeSection = sections.find(s => s.key === 'active');
  if (!activeSection) return sections;

  const activeBlockIds = new Set();
  for (const task of activeSection.tasks) {
    if (task.taskType === 'learning' && task.studyBlockId) {
      activeBlockIds.add(task.studyBlockId);
    }
  }

  if (activeBlockIds.size === 0) return sections;

  const claimedTaskIds = new Set();
  const claimedTasks = [];

  for (const section of sections) {
    if (section.key === 'active') continue;
    for (const task of section.tasks) {
      if (task.studyBlockId && activeBlockIds.has(task.studyBlockId)) {
        claimedTasks.push(task);
        claimedTaskIds.add(task.id);
      }
    }
  }

  if (claimedTasks.length === 0) return sections;

  activeSection.tasks = sortTasksForSection([...activeSection.tasks, ...claimedTasks]);

  return sections
    .map(section => {
      if (section.key === 'active') return section;
      const filtered = section.tasks.filter(t => !claimedTaskIds.has(t.id));
      return { ...section, tasks: filtered };
    })
    .filter(section => section.tasks.length > 0);
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

export function getTodayRelevantTasks(displayTasks, todayKey) {
  return displayTasks.filter(t => {
    if (t.taskDate === todayKey) return true
    if (t.status === 'in_progress') return true
    if ((t.status === 'pending' || t.status === 'locked') && t.taskDate < todayKey) return true
    return false
  })
}

export function classifyTodayState({ todayKey, plan, displayTasks, sections }) {
  if (plan?.startDate && todayKey < plan.startDate) {
    return { state: 'PRE_START', startDate: plan.startDate }
  }

  const todayRelevantTasks = getTodayRelevantTasks(displayTasks, todayKey)

  if (todayRelevantTasks.length > 0 && sections.length === 0) {
    return { state: 'ALL_DONE' }
  }

  if (sections.length > 0) {
    return { state: 'HAS_WORK', todayRelevantTasks }
  }

  return { state: 'EMPTY_TODAY' }
}

const TERMINAL_STATUSES = new Set(['completed', 'partial', 'skipped'])

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseDateKey(dateKey) {
  const parts = String(dateKey).split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function formatDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysToKey(dateKey, days) {
  const d = parseDateKey(dateKey)
  d.setDate(d.getDate() + days)
  return formatDateKey(d)
}

function getWeekday(dateKey) {
  return parseDateKey(dateKey).getDay()
}

export function buildAvailabilityByWeekday(availability) {
  if (!Array.isArray(availability)) return new Map()
  const map = new Map()
  for (const entry of availability) {
    if (entry && entry.weekday != null) map.set(entry.weekday, entry)
  }
  return map
}

export function getDayAvailabilityEntry(dateKey, availabilityByWeekday) {
  if (!availabilityByWeekday || typeof availabilityByWeekday.get !== 'function') return null
  return availabilityByWeekday.get(getWeekday(dateKey)) || null
}

function isEligibleStudyDay(dateKey, availabilityByWeekday) {
  const entry = getDayAvailabilityEntry(dateKey, availabilityByWeekday)
  if (!entry) return false
  return entry.isDayOff !== true && (entry.availableMinutes ?? 0) > 0
}

export function findNextStudyDay({ todayKey, availabilityByWeekday, blockedDates = [], endDate = null }) {
  if (!availabilityByWeekday || availabilityByWeekday.size === 0) return null
  const blocked = new Set(Array.isArray(blockedDates) ? blockedDates : [])
  let cursor = addDaysToKey(todayKey, 1)
  const MAX_DAYS = 730
  for (let i = 0; i < MAX_DAYS; i++) {
    if (endDate && cursor > endDate) return null
    if (!blocked.has(cursor) && isEligibleStudyDay(cursor, availabilityByWeekday)) return cursor
    cursor = addDaysToKey(cursor, 1)
  }
  return null
}

export function formatStudyDay(dateKey) {
  const d = parseDateKey(dateKey)
  return `${WEEKDAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`
}

export function findNextFutureTask(displayTasks, todayKey) {
  const candidates = (Array.isArray(displayTasks) ? displayTasks : [])
    .filter(t => t && t.taskDate && t.taskDate > todayKey && !TERMINAL_STATUSES.has(t.status))
    .sort((a, b) => {
      if (a.taskDate !== b.taskDate) return a.taskDate < b.taskDate ? -1 : 1
      return (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
    })
  const task = candidates[0]
  if (!task) return null
  return {
    taskId: task.id,
    title: task.topicTitle || task.typeLabel || task.taskType || 'Upcoming task',
    dateKey: task.taskDate,
    dateLabel: formatStudyDay(task.taskDate),
  }
}

function parseUnlockCondition(condition) {
  if (!condition || typeof condition !== 'string') return null
  const idx = condition.indexOf(':')
  if (idx <= 0 || idx === condition.length - 1) return null
  return { type: condition.slice(0, idx), canonicalId: condition.slice(idx + 1) }
}

function topicTitleByCanonicalId(topicsById, canonicalId) {
  if (!topicsById || canonicalId == null) return null
  const values = topicsById instanceof Map
    ? Array.from(topicsById.values())
    : Array.isArray(topicsById)
      ? topicsById
      : (typeof topicsById === 'object' ? Object.values(topicsById) : [])
  const topic = values.find(t => t && t.canonicalTopicId === canonicalId)
  return topic?.topicTitle || topic?.title || null
}

export function getPrerequisiteName(task, topicsById = null) {
  const parsed = parseUnlockCondition(task?.unlockCondition)
  if (!parsed) return null
  const title = topicTitleByCanonicalId(topicsById, parsed.canonicalId)
  if (title) return title
  return parsed.canonicalId || null
}

export function classifyTodayReason({
  planStatus,
  todayKey,
  dayAvailability,
  tasksToday = [],
  nextTask = null,
  availabilityByWeekday = new Map(),
  blockedDates = [],
  endDate = null,
  topicsById = null,
}) {
  if (planStatus === 'draft') {
    return { reason: 'DRAFT', title: "This rotation starts today, but it isn't active yet." }
  }

  const dayEntry = dayAvailability || null
  const isUnavailable = dayEntry
    ? dayEntry.isDayOff === true || (dayEntry.availableMinutes ?? 0) <= 0
    : false
  if (isUnavailable) {
    const nextStudyDayKey = findNextStudyDay({ todayKey, availabilityByWeekday, blockedDates, endDate })
    return {
      reason: 'DAY_OFF',
      title: 'No study time is scheduled for today.',
      nextStudyDayKey,
      nextStudyDayLabel: nextStudyDayKey ? formatStudyDay(nextStudyDayKey) : null,
      nextTask,
    }
  }

  const todayTasks = Array.isArray(tasksToday) ? tasksToday : []

  if (todayTasks.length === 0) {
    if (nextTask) {
      return { reason: 'NEXT_TASK', title: 'Nothing is scheduled for today.', nextTask }
    }
    return { reason: 'NONE', title: 'Nothing scheduled for today' }
  }

  const nonTerminal = todayTasks.filter(t => !TERMINAL_STATUSES.has(t.status))

  if (nonTerminal.length === 0) {
    return {
      reason: 'ALL_DONE',
      title: "You're done for today.",
      doneCount: todayTasks.filter(t => t.status === 'completed').length,
    }
  }

  const allLocked = nonTerminal.every(t => t.status === 'locked' || t.isLocked === true)
  if (allLocked) {
    const prereqNames = Array.from(new Set(
      nonTerminal.map(t => getPrerequisiteName(t, topicsById)).filter(Boolean)
    ))
    return {
      reason: 'LOCKED',
      title: "Today's tasks are waiting on prerequisites.",
      prereqNames,
    }
  }

  if (nextTask) {
    return { reason: 'NEXT_TASK', title: 'Nothing is scheduled for today.', nextTask }
  }
  return { reason: 'NONE', title: 'Nothing scheduled for today' }
}

export function calculateDayProgress(allTasks, todayKey, taskFilter = null) {
  const tasks = (taskFilter ? allTasks.filter(taskFilter) : allTasks)
    .filter(t => t.taskType !== 'flashcard_review');
  let completedTasks = 0;
  let activeTasks = 0;
  let overdueTasks = 0;
  let totalMinutes = 0;
  let completedMinutes = 0;
  let weightedSum = 0;
  let weightSum = 0;

  for (const task of tasks) {
    const minutes = task.estimatedMinutes || 0;
    totalMinutes += minutes;

    if (task.status === 'completed' || task.status === 'partial') {
      completedTasks++;
      completedMinutes += minutes;
    } else if (task.status === 'in_progress') {
      activeTasks++;
    } else if ((task.status === 'pending' || task.status === 'locked') && task.taskDate < todayKey) {
      overdueTasks++;
    }

    const ratio = getTaskProgressRatio(task);
    weightedSum += ratio * minutes;
    weightSum += minutes;
  }

  return {
    totalTasks: tasks.length,
    completedTasks,
    activeTasks,
    overdueTasks,
    totalMinutes,
    completedMinutes,
    weightedProgress: weightSum === 0 ? 0 : weightedSum / weightSum,
  };
}

export function groupTasksByDate(tasks) {
  const map = new Map()
  for (const task of tasks) {
    const date = task.taskDate
    if (!date) continue
    if (!map.has(date)) map.set(date, [])
    map.get(date).push(task)
  }
  for (const [, dayTasks] of map) {
    dayTasks.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  }
  return map
}

export const TOPIC_STATUS_LABELS = {
  not_started: 'Not Started',
  learning: 'Learning',
  questions_locked: 'Questions Locked',
  uworld_in_progress: 'UWorld In Progress',
  incorrect_review: 'Incorrect Review',
  maintenance: 'Maintenance',
  completed: 'Completed',
}

const ACTIVE_STATUSES = new Set(['learning', 'uworld_in_progress'])

export function filterTopics(topics, filter) {
  if (filter === 'all') return topics
  if (filter === 'active') return topics.filter(t => ACTIVE_STATUSES.has(t.status))
  if (filter === 'not_started') return topics.filter(t => t.status === 'not_started')
  if (filter === 'locked') return topics.filter(t => t.status === 'questions_locked')
  if (filter === 'completed') return topics.filter(t => t.status === 'completed')
  return topics
}

export function groupTopicsByGroup(topics) {
  const map = new Map()
  for (const topic of topics) {
    const group = topic.groupId || null
    if (!map.has(group)) map.set(group, [])
    map.get(group).push(topic)
  }
  const groups = []
  for (const [groupId, groupTopics] of map) {
    groupTopics.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    groups.push({ groupId, topics: groupTopics })
  }
  groups.sort((a, b) => {
    if (a.groupId === null) return 1
    if (b.groupId === null) return 1
    return a.groupId.localeCompare(b.groupId)
  })
  return groups
}

export function summarizeTopics(topics) {
  const total = topics.length
  const completed = topics.filter(t => t.status === 'completed').length
  const active = topics.filter(t => ACTIVE_STATUSES.has(t.status)).length
  const remaining = total - completed - active
  let totalUworld = 0
  let completedUworld = 0
  for (const t of topics) {
    totalUworld += t.totalUworldQuestions || 0
    completedUworld += t.completedUworldQuestions || 0
  }
  return { total, completed, active, remaining, totalUworld, completedUworld }
}

const todayGrouping = {
  TODAY_SECTIONS,
  groupTasksBySection,
  sortTasksForSection,
  claimActiveBlockSiblings,
  calculateSectionProgress,
  calculateDayProgress,
  classifyTodayState,
  classifyTodayReason,
  getTodayRelevantTasks,
  buildAvailabilityByWeekday,
  getDayAvailabilityEntry,
  findNextStudyDay,
  formatStudyDay,
  findNextFutureTask,
  getPrerequisiteName,
  TOPIC_STATUS_LABELS,
  filterTopics,
  groupTopicsByGroup,
  summarizeTopics,
};

export default todayGrouping;
