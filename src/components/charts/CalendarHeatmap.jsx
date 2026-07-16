import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import s from './CalendarHeatmap.module.css'

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']
const LEVEL_COLORS = [
  'rgba(255,255,255,0.03)',
  'rgba(79,140,255,0.12)',
  'rgba(79,140,255,0.30)',
  'rgba(79,140,255,0.55)',
  '#4F8CFF',
]

function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function CalendarHeatmap({ data = [] }) {
  const [tooltip, setTooltip] = useState(null)
  const dataMap = useMemo(() => {
    const m = {}
    for (const d of data) m[d.date] = d
    return m
  }, [data])

  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date()
    const yearEnd = new Date(today.getFullYear(), 11, 31)
    const yearStart = getMonday(new Date(today.getFullYear(), 0, 1))
    const end = getMonday(yearEnd)
    end.setDate(end.getDate() + 7)

    const weeks = []
    const cursor = new Date(yearStart)
    while (cursor < end) {
      const week = []
      for (let i = 0; i < 7; i++) {
        const dateStr = formatDate(cursor)
        week.push({
          date: dateStr,
          day: cursor.getDay(),
          entry: dataMap[dateStr] || null,
        })
        cursor.setDate(cursor.getDate() + 1)
      }
      weeks.push(week)
    }

    const monthLabels = []
    let lastMonth = -1
    for (let w = 0; w < weeks.length; w++) {
      const midDay = weeks[w][3]
      if (!midDay) continue
      const month = new Date(midDay.date + 'T00:00:00').getMonth()
      if (month !== lastMonth) {
        monthLabels.push({ week: w, label: new Date(midDay.date + 'T00:00:00').toLocaleString('en-US', { month: 'short' }) })
        lastMonth = month
      }
    }

    return { weeks, monthLabels }
  }, [dataMap])

  function handleMouseEnter(e, entry, date) {
    if (!entry) return
    const rect = e.target.getBoundingClientRect()
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      date: formatDisplayDate(date),
      questions: entry.questions,
      topics: entry.topics,
      cases: entry.cases,
      minutes: entry.minutes,
      count: entry.count,
    })
  }

  function handleMouseLeave() {
    setTooltip(null)
  }

  const hasData = data.length > 0

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      {!hasData ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--mist)', fontSize: 14 }}>
          Log your first study session to see your contribution graph
        </div>
      ) : (
        <div className={s.wrap}>
          <div className={s.monthRow} style={{ marginBottom: 2 }}>
            {monthLabels.map((ml, i) => (
              <div key={i} className={s.monthLabel} style={{ marginLeft: weeks[ml.week] ? ml.week * 17 : 0 }}>
                {ml.label}
              </div>
            ))}
          </div>
          <div className={s.body}>
            <div className={s.dayLabels}>
              {DAY_LABELS.map((label, i) => (
                <div key={i} className={s.dayLabel} style={{ height: 14 }}>{label}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className={s.dayCol}>
                {week.map((day, di) => {
                  const level = day.entry?.level ?? 0
                  return (
                    <div
                      key={di}
                      className={`${s.cell} ${day.entry ? s.hasData : ''}`}
                      style={{ background: LEVEL_COLORS[level] || LEVEL_COLORS[0] }}
                      onMouseEnter={(e) => handleMouseEnter(e, day.entry, day.date)}
                      onMouseLeave={handleMouseLeave}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <div className={s.legend}>
            Less
            {LEVEL_COLORS.map((c, i) => (
              <div key={i} className={s.legendSwatch} style={{ background: c }} />
            ))}
            More
          </div>
        </div>
      )}
      {tooltip && createPortal(
        <div
          className={s.tooltip}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className={s.tooltipDate}>{tooltip.date}</div>
          <div className={s.tooltipRow}>
            <span>{tooltip.count} event{tooltip.count !== 1 ? 's' : ''}</span>
            <span>{tooltip.questions} Q</span>
            <span>{tooltip.minutes} min</span>
          </div>
          <div className={s.tooltipRow} style={{ marginTop: 2 }}>
            <span>{tooltip.topics} topics</span>
            <span>{tooltip.cases} cases</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
