import s from './CommunityPanel.module.css'

export default function ActivityCard({ communityId, heatmap }) {
  const now = new Date()
  const last7 = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    const entry = heatmap?.data?.find(e => e.date === key)
    last7.push({
      day: d.toLocaleDateString('en', { weekday: 'short' }),
      hours: entry?.hours || 0,
    })
  }

  const totalHours = last7.reduce((sum, d) => sum + d.hours, 0)
  const activeDays = last7.filter(d => d.hours > 0).length
  const maxHours = Math.max(...last7.map(d => d.hours), 1)

  return (
    <div className={s.section}>
      <h3 className={s.sectionTitle}>Last 7 Days</h3>
      {totalHours === 0 ? (
        <p className={s.emptyText}>No activity in the last 7 days</p>
      ) : (
        <>
          <div className={s.barChart}>
            {last7.map((d, i) => (
              <div key={i} className={s.barCol}>
                <div className={s.barWrapper}>
                  <div
                    className={s.bar}
                    style={{ height: `${(d.hours / maxHours) * 100}%` }}
                  />
                </div>
                <span className={s.barLabel}>{d.day}</span>
              </div>
            ))}
          </div>
          <p className={s.activitySummary}>
            {Math.round(totalHours * 10) / 10} hours studied · {activeDays} active days
          </p>
        </>
      )}
    </div>
  )
}
