import { useMemo, useState, useRef } from 'react'

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
  const tooltipRef = useRef(null)
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
      <style>{`
        .hmWrap { display: flex; flex-direction: column; gap: 4px; width: 100%; overflow-x: auto; }
        .hmMonthRow { display: flex; margin-left: 36px; font-size: 10px; color: var(--mist); gap: 0; }
        .hmMonthLabel { flex-shrink: 0; }
        .hmBody { display: flex; gap: 3px; }
        .hmDayCol { display: flex; flex-direction: column; gap: 3px; }
        .hmDayLabel { width: 30px; flex-shrink: 0; font-size: 10px; color: var(--mist); line-height: 14px; text-align: right; padding-right: 6px; }
        .hmDayLabels { display: flex; flex-direction: column; gap: 3px; }
        .hmCell {
          width: 14px; height: 14px; border-radius: 3px; cursor: pointer;
          transition: all 0.15s ease; position: relative;
          background: rgba(255,255,255,0.03);
        }
        .hmCell:hover { transform: scale(1.3); z-index: 2; }
        .hmCell.hasData:hover { box-shadow: 0 0 8px rgba(79,140,255,0.4); }
        .hmLegend { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 10px; color: var(--mist); justify-content: flex-end; }
        .hmLegendSwatch { width: 12px; height: 12px; border-radius: 3px; }
        .hmTooltip {
          position: fixed; pointer-events: none; z-index: 1000;
          background: var(--card-bg); border: 1px solid var(--card-border);
          border-radius: 10px; padding: 10px 14px; font-size: 13px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          transform: translate(-50%, -100%);
          white-space: nowrap;
        }
        .hmTooltipDate { color: var(--text-primary); font-weight: 600; margin-bottom: 4px; }
        .hmTooltipRow { color: var(--mist); display: flex; gap: 12px; font-size: 12px; }
        .hmTooltipRow span { color: var(--text-secondary); }
        @media (max-width: 768px) {
          .hmCell { width: 10px; height: 10px; border-radius: 2px; }
          .hmDayLabel { font-size: 8px; width: 24px; }
          .hmBody { gap: 2px; }
          .hmDayCol { gap: 2px; }
          .hmMonthRow { margin-left: 30px; font-size: 9px; }
        }
      `}</style>
      {!hasData ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--mist)', fontSize: 14 }}>
          Log your first study session to see your contribution graph
        </div>
      ) : (
        <div className="hmWrap">
          <div className="hmMonthRow" style={{ marginBottom: 2 }}>
            {monthLabels.map((ml, i) => (
              <div key={i} className="hmMonthLabel" style={{ marginLeft: weeks[ml.week] ? ml.week * 17 : 0 }}>
                {ml.label}
              </div>
            ))}
          </div>
          <div className="hmBody">
            <div className="hmDayLabels">
              {DAY_LABELS.map((label, i) => (
                <div key={i} className="hmDayLabel" style={{ height: 14 }}>{label}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="hmDayCol">
                {week.map((day, di) => {
                  const level = day.entry?.level ?? 0
                  return (
                    <div
                      key={di}
                      className={`hmCell ${day.entry ? 'hasData' : ''}`}
                      style={{ background: LEVEL_COLORS[level] || LEVEL_COLORS[0] }}
                      onMouseEnter={(e) => handleMouseEnter(e, day.entry, day.date)}
                      onMouseLeave={handleMouseLeave}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <div className="hmLegend">
            Less
            {LEVEL_COLORS.map((c, i) => (
              <div key={i} className="hmLegendSwatch" style={{ background: c }} />
            ))}
            More
          </div>
        </div>
      )}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="hmTooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="hmTooltipDate">{tooltip.date}</div>
          <div className="hmTooltipRow">
            <span>{tooltip.count} event{tooltip.count !== 1 ? 's' : ''}</span>
            <span>{tooltip.questions} Q</span>
            <span>{tooltip.minutes} min</span>
          </div>
          <div className="hmTooltipRow" style={{ marginTop: 2 }}>
            <span>{tooltip.topics} topics</span>
            <span>{tooltip.cases} cases</span>
          </div>
        </div>
      )}
    </div>
  )
}
