export const SUPPORTED_RESCHEDULE_TYPES = new Set(['learning', 'uworld_questions'])

export function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  let startWeekday = firstDay.getDay()
  if (startWeekday === 0) startWeekday = 7

  const startDate = new Date(year, month, 1 - (startWeekday - 1))

  const grid = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i)
    const day = d.getDate()
    const isCurrentMonth = d.getMonth() === month && d.getFullYear() === year
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const dateKey = `${d.getFullYear()}-${mm}-${dd}`
    grid.push({ dateKey, day, isCurrentMonth })
  }

  return grid
}

export function getNextMonth(year, month) {
  if (month === 11) return { year: year + 1, month: 0 }
  return { year, month: month + 1 }
}

export function getPrevMonth(year, month) {
  if (month === 0) return { year: year - 1, month: 11 }
  return { year, month: month - 1 }
}

export function getMonthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export function groupTasksByDate(tasks) {
  const map = new Map()
  for (const task of tasks) {
    if (!task.taskDate) continue
    const bucket = map.get(task.taskDate) || []
    bucket.push(task)
    map.set(task.taskDate, bucket)
  }
  for (const [, list] of map) {
    list.sort((a, b) => (a.displayOrder ?? Infinity) - (b.displayOrder ?? Infinity))
  }
  return map
}

export function getDayAvailability(dateKey, availabilityByWeekday) {
  if (!availabilityByWeekday) return null
  const parts = dateKey.split('-')
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  const weekday = d.getDay()
  return availabilityByWeekday.get(weekday) || null
}

export function isDayOff(dateKey, availabilityByWeekday) {
  const entry = getDayAvailability(dateKey, availabilityByWeekday)
  return entry ? entry.isDayOff : false
}

export function computeDayWorkload(tasks) {
  let totalMinutes = 0
  const types = new Set()
  for (const task of tasks) {
    totalMinutes += task.estimatedMinutes || 0
    if (task.taskType) types.add(task.taskType)
  }
  return { totalMinutes, taskTypes: Array.from(types) }
}

export function isHardOverload(totalMinutes, availability) {
  if (!availability) return false
  if (availability.isDayOff) return totalMinutes > 0
  return totalMinutes > availability.availableMinutes
}

export function canMoveTask(task) {
  return SUPPORTED_RESCHEDULE_TYPES.has(task.taskType) && task.status === 'pending'
}

export function getSuggestedDates(dateKey, plan, availabilityByWeekday, count = 5) {
  if (!plan || !availabilityByWeekday) return []
  const results = []
  const parts = dateKey.split('-')
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + 1)
  const planEndParts = plan.endDate.split('-')
  const planEnd = new Date(Number(planEndParts[0]), Number(planEndParts[1]) - 1, Number(planEndParts[2]))

  while (d <= planEnd && results.length < count) {
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const key = `${d.getFullYear()}-${mm}-${dd}`
    const weekday = d.getDay()
    const avail = availabilityByWeekday.get(weekday)
    if (avail && !avail.isDayOff) {
      results.push(key)
    }
    d.setDate(d.getDate() + 1)
  }
  return results
}

export function formatMonthGridForA11y(year, month, tasksByDate) {
  const _monthLabel = getMonthLabel(year, month)
  return function ariaLabel(dateKey) {
    const parts = dateKey.split('-')
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    const dateStr = d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const tasks = tasksByDate?.get(dateKey) || []
    const { totalMinutes } = computeDayWorkload(tasks)
    const taskCount = tasks.length
    if (taskCount === 0) return `${dateStr}. No tasks planned.`
    return `${dateStr}. ${taskCount} task${taskCount > 1 ? 's' : ''}, ${totalMinutes} minutes planned.`
  }
}
