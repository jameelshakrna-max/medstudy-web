import { useState, useEffect, useRef } from 'react'
import { apiGet } from '../../lib/api'
import confetti from 'canvas-confetti'
import { Trophy, Medal, TrendingUp, Clock, Users, BarChart3, ChevronUp, ChevronDown, Minus, Loader2, Search } from 'lucide-react'
import s from '../../pages/CommunityDetail.module.css'

const FILTERS = [
  { id: 'this_month', label: 'This Month' },
  { id: 'this_week', label: 'This Week' },
  { id: 'all_time', label: 'All Time' },
  { id: 'mentors', label: 'Mentors' },
  { id: 'scholars', label: 'Scholars' },
]

export default function LeaderboardTab({ communityId, myId, isAdmin, isMod }) {
  const [filter, setFilter] = useState('this_month')
  const [leaderboard, setLeaderboard] = useState([])
  const [position, setPosition] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingPosition, setLoadingPosition] = useState(true)
  const confettiFired = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const fetchLeaderboard = async () => {
      try {
        if (filter === 'all_time') {
          const data = await apiGet(`/communities/${communityId}/leaderboard/all-time`)
          if (!cancelled) setLeaderboard(data)
        } else {
          const now = new Date()
          const year = now.getFullYear()
          const month = now.getMonth() + 1
          const url = `/communities/${communityId}/leaderboard/monthly?year=${year}&month=${month}&filter=${filter}`
          const data = await apiGet(url)
          if (!cancelled) setLeaderboard(data)
        }
      } catch {
        if (!cancelled) setLeaderboard([])
      }
      if (!cancelled) setLoading(false)
    }
    fetchLeaderboard()
    return () => { cancelled = true }
  }, [communityId, filter])

  const fetchPosition = async () => {
    try {
      const data = await apiGet(`/communities/${communityId}/leaderboard/position`)
      setPosition(data)
    } catch {
      setPosition(null)
    }
    setLoadingPosition(false)
  }

  useEffect(() => {
    setLoadingPosition(true)
    fetchPosition()
    const interval = setInterval(fetchPosition, 30000)
    return () => clearInterval(interval)
  }, [communityId])

  useEffect(() => {
    if (position?.rank === 1 && !confettiFired.current) {
      confettiFired.current = true
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6, x: 1 } })
    }
  }, [position])

  const top3 = leaderboard.slice(0, 3)
  const rest = leaderboard.slice(3)
  const gold = top3.find(r => r.rank === 1)
  const silver = top3.find(r => r.rank === 2)
  const bronze = top3.find(r => r.rank === 3)

  const renderChange = (placesChanged) => {
    if (!placesChanged || placesChanged === 0) {
      return <span className={`${s.positionChange} ${s.positionChangeNeutral}`}><Minus size={14} strokeWidth={1.5} /></span>
    }
    if (placesChanged > 0) {
      return <span className={`${s.positionChange} ${s.positionChangeUp}`}><ChevronUp size={14} strokeWidth={1.5} /> {placesChanged}</span>
    }
    return <span className={`${s.positionChange} ${s.positionChangeDown}`}><ChevronDown size={14} strokeWidth={1.5} /> {Math.abs(placesChanged)}</span>
  }

  return (
    <div className={s.leaderboardArea}>
      <div className={s.compsToolbar}>
        <div className={s.compsFilters}>
          {FILTERS.map(f => (
            <button key={f.id} className={`${s.compFilterBtn} ${filter === f.id ? s.compFilterActive : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loadingPosition ? (
        <div className={s.loading}><Loader2 size={20} className={s.spinner} /></div>
      ) : position && (
        <div className={s.positionCard}>
          <div className={s.positionHeader}>
            <Trophy size={18} strokeWidth={1.5} />
            <span className={s.positionRank}>#{position.rank ?? '—'} of {position.total_participants}</span>
            {renderChange(position.places_changed)}
          </div>
          <div className={s.positionStats}>
            <div className={s.positionStat}>
              <BarChart3 size={14} strokeWidth={1.5} />
              <div>
                <div className={s.positionStatValue}>{Math.round(position.hours)}h</div>
                <div className={s.positionStatLabel}>Total Hours</div>
              </div>
            </div>
            <div className={s.positionStat}>
              <Clock size={14} strokeWidth={1.5} />
              <div>
                <div className={s.positionStatValue}>{Math.round(position.today_hours)}h</div>
                <div className={s.positionStatLabel}>Today</div>
              </div>
            </div>
            {position.hours_to_next != null && (
              <div className={s.positionStat}>
                <TrendingUp size={14} strokeWidth={1.5} />
                <div>
                  <div className={s.positionStatValue}>{Math.round(position.hours_to_next)}h</div>
                  <div className={s.positionStatLabel}>To Next Rank</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className={s.loading}><Loader2 size={20} className={s.spinner} /></div>
      ) : leaderboard.length === 0 ? (
        <div className={s.empty}>No study hours recorded this month</div>
      ) : (
        <>
          {(gold || silver || bronze) && (
            <div className={s.podium}>
              <div className={`${s.podiumColumn} ${s.podiumSilver}`}>
                {silver && (
                  <>
                    <div className={s.podiumAvatar}>{silver.badge?.emoji || '\u{1F948}'}</div>
                    <div className={s.podiumName}>{silver.user_name}</div>
                    <div className={s.podiumHours}>{silver.hours}h</div>
                    {silver.badge?.title && <div className={s.podiumTitle}>{silver.badge.title}</div>}
                  </>
                )}
              </div>
              <div className={`${s.podiumColumn} ${s.podiumGold}`}>
                {gold && (
                  <>
                    <div className={s.podiumAvatar}>{gold.badge?.emoji || '\u{1F947}'}</div>
                    <div className={s.podiumName}>{gold.user_name}</div>
                    <div className={s.podiumHours}>{gold.hours}h</div>
                    {gold.badge?.title && <div className={s.podiumTitle}>{gold.badge.title}</div>}
                  </>
                )}
              </div>
              <div className={`${s.podiumColumn} ${s.podiumBronze}`}>
                {bronze && (
                  <>
                    <div className={s.podiumAvatar}>{bronze.badge?.emoji || '\u{1F949}'}</div>
                    <div className={s.podiumName}>{bronze.user_name}</div>
                    <div className={s.podiumHours}>{bronze.hours}h</div>
                    {bronze.badge?.title && <div className={s.podiumTitle}>{bronze.badge.title}</div>}
                  </>
                )}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div className={s.lbList}>
              {rest.map(r => (
                <div key={r.user_id} className={`${s.lbRow} ${r.is_me ? s.lbRowMe : ''}`}>
                  <span className={s.lbRank}>#{r.rank}</span>
                  <span className={`${s.lbName} ${r.is_me ? s.lbNameMe : ''}`}>
                    {r.is_me ? 'You' : r.user_name}
                  </span>
                  <span className={s.lbHours}>{r.hours}h</span>
                  {r.badge?.emoji && <span className={s.lbBadge}>{r.badge.emoji}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
