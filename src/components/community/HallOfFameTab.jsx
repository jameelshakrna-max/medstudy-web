import { useState, useEffect } from 'react'
import { apiGet } from '../../lib/api'
import { Loader2, Crown } from 'lucide-react'
import s from './HallOfFameTab.module.css'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getLast12Months() {
  const now = new Date()
  const months = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return months
}

export default function HallOfFameTab({ communityId }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiGet(`/communities/${communityId}/hall-of-fame`)
      .then(d => { if (!cancelled) setData(Array.isArray(d) ? d : []) })
      .catch(() => { if (!cancelled) setData([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [communityId])

  const last12 = getLast12Months()

  const winnersByYM = {}
  data.forEach(entry => {
    const key = `${entry.year}-${entry.month}`
    if (entry.rank === 1) winnersByYM[key] = entry
  })

  if (loading) {
    return (
      <div className={s.loading}>
        <Loader2 size={24} className={s.spinner} />
      </div>
    )
  }

  return (
    <div className={s.container}>
      <h2 className={s.heading}>Hall of Fame</h2>
      <div className={s.list}>
        {last12.map(({ year, month }) => {
          const key = `${year}-${month}`
          const winner = winnersByYM[key]
          return (
            <div key={key} className={s.card}>
              <div className={s.cardHeader}>
                <span className={s.monthLabel}>{MONTHS[month - 1]} {year}</span>
                <Crown size={14} className={s.crownIcon} />
              </div>
              {winner ? (
                <div className={s.winner}>
                  <div className={s.avatar}>
                    {winner.avatar_url ? (
                      <img src={winner.avatar_url} alt="" />
                    ) : (
                      <span>{winner.user_name?.[0]?.toUpperCase() || '?'}</span>
                    )}
                  </div>
                  <div className={s.winnerInfo}>
                    <span className={s.winnerName}>{winner.user_name}</span>
                    {winner.title && <span className={s.winnerTitle}>{winner.title}</span>}
                  </div>
                </div>
              ) : (
                <div className={s.noWinner}>No winner yet</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
