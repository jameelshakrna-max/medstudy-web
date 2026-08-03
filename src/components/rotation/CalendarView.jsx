import { useState, useMemo, useCallback, useId, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Drawer from '../ui/Drawer/Drawer'
import DailyTaskPanel from './DailyTaskPanel'
import ScheduleView from './today/ScheduleView'
import {
  buildMonthGrid,
  getNextMonth,
  getPrevMonth,
  getMonthLabel,
  groupTasksByDate,
  getDayAvailability,
  isDayOff as checkDayOff,
  computeDayWorkload,
  isHardOverload,
  formatMonthGridForA11y,
} from './calendarUtils'
import { formatMinutes } from './today/taskDisplayModel'
import { TASK_TYPE_COLORS } from './today/taskActionRules'
import styles from './CalendarView.module.css'

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function parseTodayKey(todayKey) {
  if (!todayKey) return null
  const parts = todayKey.split('-')
  return { year: Number(parts[0]), month: Number(parts[1]) - 1, day: Number(parts[2]) }
}

export default function CalendarView({
  tasks,
  topics,
  topicsById,
  plan,
  availability,
  sourceTitle,
  todayKey,
  onReschedule,
  isMutating,
}) {
  const parsed = useMemo(() => parseTodayKey(todayKey), [todayKey])

  const [viewMode, setViewMode] = useState('month')
  const [currentYear, setCurrentYear] = useState(parsed?.year ?? new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(parsed?.month ?? new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState(null)

  const baseId = useId()
  const monthTabId = `${baseId}-tab-month`
  const weekTabId = `${baseId}-tab-week`
  const monthPanelId = `${baseId}-panel-month`
  const weekPanelId = `${baseId}-panel-week`

  const monthTabRef = useRef(null)
  const weekTabRef = useRef(null)

  const tasksByDate = useMemo(() => groupTasksByDate(tasks), [tasks])

  const availabilityByWeekday = useMemo(() => {
    if (!availability || !Array.isArray(availability)) return null
    const map = new Map()
    for (const entry of availability) {
      map.set(entry.weekday, entry)
    }
    return map
  }, [availability])

  const grid = useMemo(() => buildMonthGrid(currentYear, currentMonth), [currentYear, currentMonth])

  const ariaLabel = useMemo(
    () => formatMonthGridForA11y(currentYear, currentMonth, tasksByDate),
    [currentYear, currentMonth, tasksByDate]
  )

  const handlePrevMonth = useCallback(() => {
    const prev = getPrevMonth(currentYear, currentMonth)
    setCurrentYear(prev.year)
    setCurrentMonth(prev.month)
  }, [currentYear, currentMonth])

  const handleNextMonth = useCallback(() => {
    const next = getNextMonth(currentYear, currentMonth)
    setCurrentYear(next.year)
    setCurrentMonth(next.month)
  }, [currentYear, currentMonth])

  const handleToday = useCallback(() => {
    if (parsed) {
      setCurrentYear(parsed.year)
      setCurrentMonth(parsed.month)
      setSelectedDate(todayKey)
    }
  }, [parsed, todayKey])

  const handleCellClick = useCallback((dateKey) => {
    setSelectedDate(dateKey)
  }, [])

  const handleDrawerClose = useCallback(() => {
    setSelectedDate(null)
  }, [])

  const handleTablistKeyDown = useCallback(
    (event) => {
      const tabs = [monthTabRef, weekTabRef]
      const currentIndex = viewMode === 'month' ? 0 : 1
      let nextIndex = null

      switch (event.key) {
        case 'ArrowRight':
          nextIndex = (currentIndex + 1) % tabs.length
          break
        case 'ArrowLeft':
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
          break
        case 'Home':
          nextIndex = 0
          break
        case 'End':
          nextIndex = tabs.length - 1
          break
        default:
          return
      }

      event.preventDefault()
      setViewMode(nextIndex === 0 ? 'month' : 'week')
      tabs[nextIndex].current?.focus()
    },
    [viewMode]
  )

  const isTodayDisabled = parsed && currentYear === parsed.year && currentMonth === parsed.month && selectedDate === todayKey

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {viewMode === 'month' && (
          <div className={styles.navGroup}>
            <button className={styles.navBtn} onClick={handlePrevMonth} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <span className={styles.monthLabel}>{getMonthLabel(currentYear, currentMonth)}</span>
            <button className={styles.navBtn} onClick={handleNextMonth} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
            {!isTodayDisabled && (
              <button className={styles.todayBtn} onClick={handleToday}>Today</button>
            )}
          </div>
        )}

        <div className={styles.viewToggle} role="tablist" aria-label="Calendar view mode" onKeyDown={handleTablistKeyDown}>
          <button
            role="tab"
            id={monthTabId}
            ref={monthTabRef}
            aria-selected={viewMode === 'month'}
            aria-controls={monthPanelId}
            tabIndex={viewMode === 'month' ? 0 : -1}
            className={`${styles.viewToggleBtn} ${viewMode === 'month' ? styles.viewToggleActive : ''}`}
            onClick={() => setViewMode('month')}
          >
            Month
          </button>
          <button
            role="tab"
            id={weekTabId}
            ref={weekTabRef}
            aria-selected={viewMode === 'week'}
            aria-controls={weekPanelId}
            tabIndex={viewMode === 'week' ? 0 : -1}
            className={`${styles.viewToggleBtn} ${viewMode === 'week' ? styles.viewToggleActive : ''}`}
            onClick={() => setViewMode('week')}
          >
            Week
          </button>
        </div>
      </div>

      {viewMode === 'month' ? (
        <div id={monthPanelId} role="tabpanel" aria-labelledby={monthTabId}>
          <div className={styles.weekdayHeader}>
            {WEEKDAY_HEADERS.map((label) => (
              <div key={label} className={styles.weekdayLabel}>{label}</div>
            ))}
          </div>

          <div className={styles.monthGrid} role="grid" aria-label={`Calendar for ${getMonthLabel(currentYear, currentMonth)}`}>
            {grid.map((cell) => {
              const dayTasks = tasksByDate.get(cell.dateKey) || []
              const { totalMinutes, taskTypes } = computeDayWorkload(dayTasks)
              const dayAvail = getDayAvailability(cell.dateKey, availabilityByWeekday)
              const isDayOff = checkDayOff(cell.dateKey, availabilityByWeekday)
              const overload = isHardOverload(totalMinutes, dayAvail)
              const isToday = cell.dateKey === todayKey
              const isSelected = cell.dateKey === selectedDate

              const classNames = [
                styles.dayCell,
                cell.isCurrentMonth ? styles.dayCellCurrentMonth : styles.dayCellOutsideMonth,
                isToday ? styles.dayCellToday : '',
                isDayOff ? styles.dayCellDayOff : '',
                overload ? styles.dayCellOverload : '',
                isSelected ? styles.dayCellSelected : '',
              ].filter(Boolean).join(' ')

              const displayDots = taskTypes.slice(0, 5)

              return (
                <button
                  key={cell.dateKey}
                  className={classNames}
                  onClick={() => handleCellClick(cell.dateKey)}
                  aria-label={ariaLabel(cell.dateKey)}
                >
                  <span className={styles.dayNumber}>{cell.day}</span>
                  {totalMinutes > 0 && (
                    <span className={styles.dayMinutes}>{formatMinutes(totalMinutes)}</span>
                  )}
                  {overload && <span className={styles.overloadIcon}>⚠</span>}
                  {displayDots.length > 0 && (
                    <div className={styles.taskDots}>
                      {displayDots.map((type) => (
                        <span
                          key={type}
                          className={styles.taskDot}
                          style={{ background: TASK_TYPE_COLORS[type] || 'var(--text-secondary)' }}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div id={weekPanelId} role="tabpanel" aria-labelledby={weekTabId}>
          <ScheduleView
            tasks={tasks}
            topicsById={topicsById}
            sourceTitle={sourceTitle}
            availability={availability}
            todayKey={todayKey}
          />
        </div>
      )}

      {viewMode === 'month' && (
        <Drawer open={selectedDate !== null} onOpenChange={(open) => { if (!open) handleDrawerClose() }}>
          {selectedDate && (
            <DailyTaskPanel
              dateKey={selectedDate}
              tasks={tasksByDate.get(selectedDate) || []}
              topicsById={topicsById}
              availability={availability}
              todayKey={todayKey}
              onReschedule={onReschedule}
              isMutating={isMutating}
              plan={plan}
              onClose={handleDrawerClose}
            />
          )}
        </Drawer>
      )}
    </div>
  )
}
