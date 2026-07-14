import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import CalendarHeatmap from './charts/CalendarHeatmap'

export default function StudyHeatmap({ userId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    apiGet(`/users/${userId}/heatmap`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [userId])

  const year = new Date().getFullYear()

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--card-border)',
      borderRadius: 16,
      padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Study Activity</h3>
        {!loading && data?.stats && (
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--mist)' }}>
            <span>{data.stats.totalHours ?? 0}h total</span>
            <span>{data.stats.activeDays ?? 0} active days</span>
            <span>{year}</span>
          </div>
        )}
      </div>
      {loading ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mist)', fontSize: 14 }}>
          Loading...
        </div>
      ) : !data?.data?.length ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mist)', fontSize: 14 }}>
          No study activity yet
        </div>
      ) : (
        <CalendarHeatmap data={data.data} />
      )}
    </div>
  )
}
