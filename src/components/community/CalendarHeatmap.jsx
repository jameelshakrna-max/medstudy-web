import { useState, useEffect, useMemo } from 'react'
import { apiGet } from '../../lib/api'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']

function getColor(value, mode) {
  if (mode === 'active-days') {
    return value > 0 ? 'rgba(16,185,129,0.5)' : '#2a3448'
  }
  if (mode === 'focus-time') {
    const minutes = (value || 0) * 60
    if (minutes === 0) return '#2a3448'
    if (minutes <= 30) return 'rgba(16,185,129,0.2)'
    if (minutes <= 120) return 'rgba(16,185,129,0.4)'
    if (minutes <= 300) return 'rgba(16,185,129,0.6)'
    return 'rgba(16,185,129,0.9)'
  }
  // hours mode
  if (!value || value === 0) return '#2a3448'
  if (value <= 1) return 'rgba(16,185,129,0.2)'
  if (value <= 3) return 'rgba(16,185,129,0.4)'
  if (value <= 6) return 'rgba(16,185,129,0.6)'
  return 'rgba(16,185,129,0.9)'
}

function getStreaks(dataMap, year) {
  let current = 0
  let longest = 0
  let temp = 0
  const today = new Date()
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  // current streak: count back from today
  const d = new Date(today)
  d.setHours(0, 0, 0, 0)
  while (true) {
    const key = d.toISOString().slice(0, 10)
    if (dataMap[key] && dataMap[key] > 0) {
      current++
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
  }

  // longest streak: iterate all days in year
  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year, 11, 31)
  const iter = new Date(startDate)
  while (iter <= endDate) {
    const key = iter.toISOString().slice(0, 10)
    if (dataMap[key] && dataMap[key] > 0) {
      temp++
      if (temp > longest) longest = temp
    } else {
      temp = 0
    }
    iter.setDate(iter.getDate() + 1)
  }

  return { current, longest }
}

function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function CalendarHeatmap({ communityId }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState([])
  const [mode, setMode] = useState('hours')
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiGet(`/communities/${communityId}/stats/heatmap?year=${year}`)
      .then(res => {
        if (!cancelled) setData(Array.isArray(res?.data) ? res.data : [])
      })
      .catch(() => { if (!cancelled) setData([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [communityId, year])

  const dataMap = useMemo(() => {
    const m = {}
    for (const entry of data) {
      m[entry.date] = entry.hours
    }
    return m
  }, [data])

  const totalHours = useMemo(() => data.reduce((s, e) => s + (e.hours || 0), 0), [data])
  const activeDays = useMemo(() => data.filter(e => e.hours > 0).length, [data])
  const streaks = useMemo(() => getStreaks(dataMap, year), [dataMap, year])

  // Build the grid
  const grid = useMemo(() => {
    const start = new Date(year, 0, 1)
    // Pad start to Monday
    const dayOfWeek = start.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    start.setDate(start.getDate() + mondayOffset)

    const end = new Date(year, 11, 31)
    // Pad end to Sunday
    const endDow = end.getDay()
    const sundayPad = endDow === 0 ? 0 : 7 - endDow
    end.setDate(end.getDate() + sundayPad)

    const weeks = []
    const iter = new Date(start)
    while (iter <= end) {
      const week = []
      for (let d = 0; d < 7; d++) {
        const dateStr = iter.toISOString().slice(0, 10)
        const inYear = iter.getFullYear() === year
        week.push({ dateStr, inYear, value: inYear ? (dataMap[dateStr] || 0) : null })
        iter.setDate(iter.getDate() + 1)
      }
      weeks.push(week)
    }
    return weeks
  }, [year, dataMap])

  // Month label positions
  const monthPositions = useMemo(() => {
    const positions = []
    for (let m = 0; m < 12; m++) {
      const firstOfMonth = new Date(year, m, 1)
      const iter = new Date(year, 0, 1)
      const dayOfWeek = iter.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      iter.setDate(iter.getDate() + mondayOffset)

      // Find which week column contains the 1st of this month
      let weekIdx = 0
      const d = new Date(start)
      const startCopy = new Date(year, 0, 1)
      const dow = startCopy.getDay()
      const mo = dow === 0 ? -6 : 1 - dow
      startCopy.setDate(startCopy.getDate() + mo)
      let wIter = new Date(startCopy)
      while (wIter <= firstOfMonth) {
        if (wIter.getMonth() === firstOfMonth.getMonth() && wIter.getDate() === firstOfMonth.getDate()) break
        if (wIter > firstOfMonth) break
        weekIdx++
        wIter.setDate(wIter.getDate() + 7)
      }
      positions.push({ label: MONTH_LABELS[m], weekIdx })
    }
    return positions
  }, [year])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Year navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <button
          onClick={() => setYear(y => y - 1)}
          style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '6px',
            color: 'var(--text-primary)', padding: '6px', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '16px', minWidth: '60px', textAlign: 'center' }}>
          {year}
        </span>
        <button
          onClick={() => setYear(y => y + 1)}
          style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '6px',
            color: 'var(--text-primary)', padding: '6px', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Stats header */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Hours', value: totalHours.toFixed(1) },
          { label: 'Active Days', value: activeDays },
          { label: 'Current Streak', value: streaks.current + 'd' },
          { label: 'Longest Streak', value: streaks.longest + 'd' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px',
            padding: '12px 20px', minWidth: '100px',
          }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Dataset toggle */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {[
          { id: 'hours', label: 'Hours' },
          { id: 'active-days', label: 'Active Days' },
          { id: 'focus-time', label: 'Focus Time' },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              background: mode === m.id ? 'rgba(16,185,129,0.15)' : 'transparent',
              border: `1px solid ${mode === m.id ? 'rgba(16,185,129,0.4)' : 'var(--card-border)'}`,
              borderRadius: '6px', color: mode === m.id ? '#10b981' : 'var(--text-secondary)',
              padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {/* Day labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginRight: '6px', paddingTop: '18px' }}>
            {DAY_LABELS.map((label, i) => (
              <div key={i} style={{ width: '28px', height: '14px', fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '14px' }}>
                {label}
              </div>
            ))}
          </div>

          {/* Weeks grid */}
          <div>
            {/* Month labels */}
            <div style={{ display: 'flex', height: '18px', position: 'relative', marginLeft: '0' }}>
              {monthPositions.map((mp, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: mp.weekIdx * 17,
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {mp.label}
                </div>
              ))}
            </div>

            {/* Cells */}
            <div style={{ display: 'flex', gap: '3px' }}>
              {grid.map((week, wi) => (
                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {week.map((day, di) => {
                    const isFuture = !day.inYear
                    const bg = isFuture ? 'transparent' : getColor(day.value, mode)
                    return (
                      <div
                        key={di}
                        onMouseEnter={(e) => {
                          if (isFuture || day.value == null) return
                          const rect = e.target.getBoundingClientRect()
                          setTooltip({
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                            date: day.dateStr,
                            value: day.value,
                          })
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '2px',
                          background: bg,
                          cursor: isFuture ? 'default' : 'pointer',
                          transition: 'background 0.1s',
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <span>Less</span>
        {['#2a3448', 'rgba(16,185,129,0.2)', 'rgba(16,185,129,0.4)', 'rgba(16,185,129,0.6)', 'rgba(16,185,129,0.9)'].map((c, i) => (
          <div key={i} style={{ width: '14px', height: '14px', borderRadius: '2px', background: c }} />
        ))}
        <span>More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            background: '#1a2332',
            border: '1px solid var(--card-border)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            pointerEvents: 'none',
            zIndex: 9999,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '2px' }}>{formatDateLong(tooltip.date)}</div>
          <div style={{ color: 'var(--text-secondary)' }}>
            {mode === 'focus-time'
              ? `${(tooltip.value || 0) * 60} minutes studied`
              : mode === 'active-days'
                ? (tooltip.value > 0 ? 'Active' : 'No study')
                : `${(tooltip.value || 0).toFixed(1)} hours studied`}
          </div>
          <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
            <div style={{ width: '28px', height: '6px', borderRadius: '2px', background: getColor(tooltip.value, mode) }} />
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', marginTop: '12px' }}>
          Loading heatmap data...
        </div>
      )}
    </div>
  )
}
