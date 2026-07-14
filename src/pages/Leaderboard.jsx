import { useState } from 'react'
import { Trophy, Clock, BookOpen, Flame, BarChart3 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, imageUrl } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { useAuth } from '../context/AuthContext'
import { useProfilePanel } from '../context/ProfilePanelContext'
import s from './Leaderboard.module.css'

const METRICS = [
  { key: 'study_hours', label: 'Study Hours', icon: Clock, unit: 'hrs' },
  { key: 'questions', label: 'Questions', icon: BookOpen, unit: '' },
  { key: 'cards', label: 'Cards', icon: BarChart3, unit: '' },
  { key: 'streak', label: 'Streak', icon: Flame, unit: 'days' },
]

export default function Leaderboard() {
  const { user } = useAuth()
  const { openProfile, preloadProfile, cancelPreload } = useProfilePanel()
  const [metric, setMetric] = useState('study_hours')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: queryKeys.leaderboard.global(metric, 50),
    queryFn: () => apiGet(`/leaderboard/global?metric=${metric}&limit=50`).then(d => Array.isArray(d) ? d : []),
    staleTime: 30_000,
  })

  const myRank = entries.find(e => e.is_me)

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Leaderboard</h1>
        <p className={s.subtitle}>Top learners across all communities</p>
      </div>

      <div className={s.tabs}>
        {METRICS.map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.key}
              className={`${s.tab} ${metric === m.key ? s.tabActive : ''}`}
              onClick={() => setMetric(m.key)}
            >
              <Icon size={16} />
              <span>{m.label}</span>
            </button>
          )
        })}
      </div>

      {myRank && (
        <div className={s.myCard}>
          <div className={s.myRank}>#{myRank.rank}</div>
          <div className={s.myName}>{myRank.user_name}</div>
          <div className={s.myValue}>{myRank.value} {METRICS.find(m => m.key === metric)?.unit}</div>
        </div>
      )}

      {isLoading ? (
        <div className={s.loading}>Loading rankings...</div>
      ) : entries.length === 0 ? (
        <div className={s.empty}>No rankings yet. Start studying to appear on the leaderboard!</div>
      ) : (
        <div className={s.list}>
          {entries.map((entry) => {
            const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null
            return (
              <div
                key={entry.user_id}
                className={`${s.row} ${entry.is_me ? s.rowMe : ''}`}
                onClick={() => openProfile(entry.user_id)}
                onMouseEnter={() => preloadProfile(entry.user_id)}
                onMouseLeave={cancelPreload}
                style={{ cursor: 'pointer' }}
              >
                <div className={s.rank}>
                  {medal ? <span className={s.medal}>{medal}</span> : <span className={s.rankNum}>{entry.rank}</span>}
                </div>
                <div className={s.avatar}>
                  {entry.avatar_url ? (
                    <img src={imageUrl(entry.avatar_url)} alt="" />
                  ) : (
                    <div className={s.avatarFallback}>{entry.user_name?.[0]?.toUpperCase() || '?'}</div>
                  )}
                </div>
                <div className={s.name}>{entry.user_name}</div>
                <div className={s.value}>{entry.value} {METRICS.find(m => m.key === metric)?.unit}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
