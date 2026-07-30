import { describe, it, expect } from 'vitest'
import {
  buildMonthGrid,
  getNextMonth,
  getPrevMonth,
  getMonthLabel,
  groupTasksByDate,
  getDayAvailability,
  isDayOff,
  computeDayWorkload,
  isHardOverload,
  canMoveTask,
  getSuggestedDates,
  formatMonthGridForA11y,
} from '../calendarUtils'

describe('buildMonthGrid', () => {
  it('starts on Monday June 29 for July 2026 (first day is Wednesday)', () => {
    const grid = buildMonthGrid(2026, 6)
    expect(grid[0].dateKey).toBe('2026-06-29')
    expect(grid[0].isCurrentMonth).toBe(false)
  })

  it('always produces exactly 42 cells', () => {
    for (let m = 0; m < 12; m++) {
      expect(buildMonthGrid(2026, m)).toHaveLength(42)
    }
  })

  it('contains all 31 days of July 2026 with isCurrentMonth true', () => {
    const grid = buildMonthGrid(2026, 6)
    const julyDays = grid.filter((c) => c.isCurrentMonth)
    expect(julyDays).toHaveLength(31)
    for (let d = 1; d <= 31; d++) {
      expect(julyDays[d - 1].day).toBe(d)
      expect(julyDays[d - 1].isCurrentMonth).toBe(true)
    }
  })

  it('grid index 2 is July 1 2026', () => {
    const grid = buildMonthGrid(2026, 6)
    expect(grid[2].dateKey).toBe('2026-07-01')
    expect(grid[2].day).toBe(1)
    expect(grid[2].isCurrentMonth).toBe(true)
  })
})

describe('February leap year', () => {
  it('leap year 2028 contains Feb 29', () => {
    const grid = buildMonthGrid(2028, 1)
    const keys = grid.map((c) => c.dateKey)
    expect(keys).toContain('2028-02-29')
  })

  it('non-leap year 2027 does not contain Feb 29', () => {
    const grid = buildMonthGrid(2027, 1)
    const keys = grid.map((c) => c.dateKey)
    expect(keys).not.toContain('2027-02-29')
  })
})

describe('getNextMonth / getPrevMonth', () => {
  it('getNextMonth wraps year from Dec 2026 to Jan 2027', () => {
    expect(getNextMonth(2026, 11)).toEqual({ year: 2027, month: 0 })
  })

  it('getPrevMonth wraps year from Jan 2026 to Dec 2025', () => {
    expect(getPrevMonth(2026, 0)).toEqual({ year: 2025, month: 11 })
  })

  it('getNextMonth increments month within same year', () => {
    expect(getNextMonth(2026, 5)).toEqual({ year: 2026, month: 6 })
  })
})

describe('getMonthLabel', () => {
  it('returns July 2026 for month index 6', () => {
    expect(getMonthLabel(2026, 6)).toBe('July 2026')
  })

  it('returns January 2026 for month index 0', () => {
    expect(getMonthLabel(2026, 0)).toBe('January 2026')
  })
})

describe('groupTasksByDate', () => {
  it('groups tasks by taskDate', () => {
    const tasks = [
      { id: 1, taskDate: '2026-07-27', displayOrder: 2 },
      { id: 2, taskDate: '2026-07-27', displayOrder: 1 },
      { id: 3, taskDate: '2026-07-28', displayOrder: 0 },
    ]
    const map = groupTasksByDate(tasks)
    expect(map).toBeInstanceOf(Map)
    expect(map.get('2026-07-27')).toHaveLength(2)
    expect(map.get('2026-07-28')).toHaveLength(1)
  })

  it('sorts tasks by displayOrder within each day', () => {
    const tasks = [
      { id: 1, taskDate: '2026-07-27', displayOrder: 5 },
      { id: 2, taskDate: '2026-07-27', displayOrder: 1 },
      { id: 3, taskDate: '2026-07-27', displayOrder: 3 },
    ]
    const map = groupTasksByDate(tasks)
    const ids = map.get('2026-07-27').map((t) => t.id)
    expect(ids).toEqual([2, 3, 1])
  })

  it('treats missing displayOrder as Infinity (sorts to end)', () => {
    const tasks = [
      { id: 1, taskDate: '2026-07-27', displayOrder: 2 },
      { id: 2, taskDate: '2026-07-27' },
    ]
    const map = groupTasksByDate(tasks)
    const ids = map.get('2026-07-27').map((t) => t.id)
    expect(ids).toEqual([1, 2])
  })

  it('skips tasks without taskDate', () => {
    const tasks = [
      { id: 1, taskDate: '2026-07-27' },
      { id: 2 },
      { id: 3, taskDate: null },
    ]
    const map = groupTasksByDate(tasks)
    expect(map.size).toBe(1)
    expect(map.get('2026-07-27')).toHaveLength(1)
  })
})

describe('getDayAvailability / isDayOff', () => {
  it('returns availability entry for a known weekday', () => {
    const avail = new Map([
      [1, { isDayOff: false, availableMinutes: 120 }],
    ])
    const result = getDayAvailability('2026-07-27', avail)
    expect(result).toEqual({ isDayOff: false, availableMinutes: 120 })
  })

  it('isDayOff returns false for a working day', () => {
    const avail = new Map([
      [1, { isDayOff: false, availableMinutes: 120 }],
    ])
    expect(isDayOff('2026-07-27', avail)).toBe(false)
  })

  it('isDayOff returns true for a day-off entry', () => {
    const avail = new Map([
      [0, { isDayOff: true, availableMinutes: 0 }],
    ])
    expect(isDayOff('2026-07-26', avail)).toBe(true)
  })

  it('getDayAvailability returns null when map is null', () => {
    expect(getDayAvailability('2026-07-27', null)).toBe(null)
  })

  it('getDayAvailability returns null for weekday not in map', () => {
    const avail = new Map([
      [1, { isDayOff: false, availableMinutes: 120 }],
    ])
    expect(getDayAvailability('2026-07-26', avail)).toBe(null)
  })
})

describe('computeDayWorkload', () => {
  it('returns zero minutes and empty types for empty array', () => {
    expect(computeDayWorkload([])).toEqual({ totalMinutes: 0, taskTypes: [] })
  })

  it('sums estimatedMinutes across tasks', () => {
    const tasks = [
      { estimatedMinutes: 30, taskType: 'learning' },
      { estimatedMinutes: 45, taskType: 'uworld_questions' },
    ]
    expect(computeDayWorkload(tasks)).toEqual({
      totalMinutes: 75,
      taskTypes: ['learning', 'uworld_questions'],
    })
  })

  it('deduplicates task types', () => {
    const tasks = [
      { estimatedMinutes: 10, taskType: 'learning' },
      { estimatedMinutes: 20, taskType: 'learning' },
    ]
    expect(computeDayWorkload(tasks)).toEqual({
      totalMinutes: 30,
      taskTypes: ['learning'],
    })
  })

  it('treats missing estimatedMinutes as 0', () => {
    const tasks = [{ taskType: 'learning' }, { taskType: 'learning' }]
    expect(computeDayWorkload(tasks)).toEqual({
      totalMinutes: 0,
      taskTypes: ['learning'],
    })
  })
})

describe('isHardOverload', () => {
  it('true when totalMinutes exceeds availableMinutes', () => {
    expect(isHardOverload(100, { availableMinutes: 60, isDayOff: false })).toBe(true)
  })

  it('false when totalMinutes within availableMinutes', () => {
    expect(isHardOverload(30, { availableMinutes: 60, isDayOff: false })).toBe(false)
  })

  it('true when any tasks on a day off', () => {
    expect(isHardOverload(10, { availableMinutes: 60, isDayOff: true })).toBe(true)
  })

  it('false when no tasks on a day off', () => {
    expect(isHardOverload(0, { availableMinutes: 60, isDayOff: true })).toBe(false)
  })

  it('false when availability is null', () => {
    expect(isHardOverload(100, null)).toBe(false)
  })
})

describe('canMoveTask', () => {
  it('pending learning task is movable', () => {
    expect(canMoveTask({ status: 'pending', taskType: 'learning' })).toBe(true)
  })

  it('pending uworld_questions task is movable', () => {
    expect(canMoveTask({ status: 'pending', taskType: 'uworld_questions' })).toBe(true)
  })

  it('completed task is not movable', () => {
    expect(canMoveTask({ status: 'completed', taskType: 'learning' })).toBe(false)
  })

  it('incorrect_review type is not movable even if pending', () => {
    expect(canMoveTask({ status: 'pending', taskType: 'incorrect_review' })).toBe(false)
  })

  it('locked task is not movable', () => {
    expect(canMoveTask({ status: 'locked', taskType: 'learning' })).toBe(false)
  })

  it('in_progress task is not movable', () => {
    expect(canMoveTask({ status: 'in_progress', taskType: 'learning' })).toBe(false)
  })
})

describe('getSuggestedDates', () => {
  const plan = { startDate: '2026-07-27', endDate: '2026-08-10' }
  const availabilityByWeekday = new Map([
    [0, { isDayOff: true, availableMinutes: 0 }],
    [1, { isDayOff: false, availableMinutes: 120 }],
    [2, { isDayOff: false, availableMinutes: 120 }],
    [3, { isDayOff: false, availableMinutes: 120 }],
    [4, { isDayOff: false, availableMinutes: 120 }],
    [5, { isDayOff: false, availableMinutes: 120 }],
    [6, { isDayOff: true, availableMinutes: 0 }],
  ])

  it('returns 3 dates starting from next day, skipping weekends', () => {
    const dates = getSuggestedDates('2026-07-27', plan, availabilityByWeekday, 3)
    expect(dates).toHaveLength(3)
    expect(dates[0]).toBe('2026-07-28')
    expect(dates[1]).toBe('2026-07-29')
    expect(dates[2]).toBe('2026-07-30')
  })

  it('skips Saturday and Sunday', () => {
    const dates = getSuggestedDates('2026-07-31', plan, availabilityByWeekday, 3)
    expect(dates).toHaveLength(3)
    expect(dates[0]).toBe('2026-08-03')
    expect(dates[1]).toBe('2026-08-04')
    expect(dates[2]).toBe('2026-08-05')
  })

  it('does not return dates beyond plan endDate', () => {
    const dates = getSuggestedDates('2026-08-08', plan, availabilityByWeekday, 5)
    expect(dates.every((d) => d <= '2026-08-10')).toBe(true)
  })

  it('returns empty array when plan is null', () => {
    expect(getSuggestedDates('2026-07-27', null, availabilityByWeekday, 3)).toEqual([])
  })

  it('returns empty array when availabilityByWeekday is null', () => {
    expect(getSuggestedDates('2026-07-27', plan, null, 3)).toEqual([])
  })

  it('defaults count to 5', () => {
    const dates = getSuggestedDates('2026-07-27', plan, availabilityByWeekday)
    expect(dates.length).toBeLessThanOrEqual(5)
  })
})

describe('formatMonthGridForA11y', () => {
  it('returns a function', () => {
    const fn = formatMonthGridForA11y(2026, 6, new Map())
    expect(typeof fn).toBe('function')
  })

  it('includes "No tasks planned" for a date with no tasks', () => {
    const tasksByDate = new Map()
    const ariaLabel = formatMonthGridForA11y(2026, 6, tasksByDate)
    const label = ariaLabel('2026-07-27')
    expect(label).toContain('No tasks planned')
  })

  it('includes task count and minutes for dates with tasks', () => {
    const tasksByDate = new Map([
      [
        '2026-07-27',
        [
          { estimatedMinutes: 20, taskType: 'learning' },
          { estimatedMinutes: 40, taskType: 'uworld_questions' },
        ],
      ],
    ])
    const ariaLabel = formatMonthGridForA11y(2026, 6, tasksByDate)
    const label = ariaLabel('2026-07-27')
    expect(label).toContain('2 tasks')
    expect(label).toContain('60 minutes')
    expect(label).toContain('planned')
  })

  it('uses singular "task" for a single task', () => {
    const tasksByDate = new Map([
      ['2026-07-27', [{ estimatedMinutes: 30, taskType: 'learning' }]],
    ])
    const ariaLabel = formatMonthGridForA11y(2026, 6, tasksByDate)
    const label = ariaLabel('2026-07-27')
    expect(label).toContain('1 task,')
    expect(label).not.toContain('1 tasks')
  })

  it('handles null tasksByDate gracefully', () => {
    const ariaLabel = formatMonthGridForA11y(2026, 6, null)
    const label = ariaLabel('2026-07-27')
    expect(label).toContain('No tasks planned')
  })
})
