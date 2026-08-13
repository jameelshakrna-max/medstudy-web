import { useEffect, useState, useCallback, useRef } from 'react'
import { getTodayKey, getNextDateKey } from './todayUtils'
import { toStartOfDayUTC } from '../../../lib/dateUtils'

/**
 * Returns the current local-calendar date key for the resolved planner
 * timezone and keeps it fresh across local midnight.
 *
 * A timeout is scheduled for the next local midnight in the resolved
 * timezone (computed from the next local date via wall-clock conversion, so
 * DST transitions are respected) and rescheduled after it fires. The date is
 * also refreshed whenever the document becomes visible again, which recovers
 * from backgrounded/throttled tabs without relying on UTC slicing or a fixed
 * 24-hour interval.
 */
export function useTodayKey(timezone) {
  const [todayKey, setTodayKey] = useState(() => getTodayKey(new Date(), timezone))
  const timerRef = useRef(null)

  const refresh = useCallback(() => {
    clearTimeout(timerRef.current)
    const now = new Date()
    const currentKey = getTodayKey(now, timezone)
    setTodayKey(currentKey)
    const nextKey = getNextDateKey(currentKey)
    const nextMidnight = toStartOfDayUTC(nextKey, timezone).getTime()
    const delay = Math.max(0, nextMidnight - now.getTime())
    timerRef.current = setTimeout(() => refresh(), delay)
  }, [timezone])

  useEffect(() => {
    refresh()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refresh])

  return todayKey
}
