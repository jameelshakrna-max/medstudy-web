import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Virtuoso } from 'react-virtuoso'
import {
  Trophy, Clock, BookOpen, Flame, BarChart3, Users, Building2, TrendingUp,
  ChevronLeft, ChevronRight, Search, Star, Medal, Crown
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, imageUrl } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { useAuth } from '../context/AuthContext'
import { useProfilePanel } from '../context/ProfilePanelContext'
import { useCommunityPanel } from '../context/CommunityPanelContext'
import s from './Leaderboard.module.css'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const CATEGORY_CONFIG = {
  general: { label: 'General', color: 'var(--blue)' },
  clinical: { label: 'Clinical', color: 'var(--emerald)' },
  exam_prep: { label: 'Exam Prep', color: '#F59E0B' },
  anatomy: { label: 'Anatomy', color: '#8B5CF6' },
  pharmacology: { label: 'Pharmacology', color: '#EC4899' },
  pathology: { label: 'Pathology', color: '#EF4444' },
  research: { label: 'Research', color: '#06B6D4' },
  wellness: { label: 'Wellness', color: '#F97316' },
}

const COMMUNITY_CATEGORIES = [
  { key: 'all', label: 'All' },
  ...Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => ({ key, ...cfg })),
]

function formatNum(n) {
  if (n == null) return '—'
  if (n >= 1000) return n.toLocaleString()
  return String(n)
}

function RankChange({ change }) {
  if (!change || change === 0) return <span className={`${s.rankChange} ${s.rankNeutral}`}>—</span>
  if (change > 0) return <span className={`${s.rankChange} ${s.rankUp}`}>↑{change}</span>
  return <span className={`${s.rankChange} ${s.rankDown}`}>↓{Math.abs(change)}</span>
}

function ScoreBadge({ score }) {
  if (score == null) return null
  const cls = score >= 80 ? s.scoreHigh : score >= 50 ? s.scoreMid : s.scoreLow
  return <span className={`${s.communityScore} ${cls}`}>{Math.round(score)}</span>
}

function PodiumCard({ entry, place, medals, showStreak, onClick }) {
  if (!entry) return <div className={`${s.podiumPlace} ${s['podium' + place]}`} />
  const medal = medals[place]
  return (
    <div className={`${s.podiumPlace} ${s['podium' + place]} ${s.podiumClickable}`} onClick={onClick}>
      <div className={s.podiumMedal}>{medal}</div>
      <div className={s.podiumAvatar}>
        {entry.avatar_url ? (
          <img src={imageUrl(entry.avatar_url)} alt="" loading="lazy" />
        ) : (
          <span>{entry.user_name?.[0]?.toUpperCase() || entry.name?.[0]?.toUpperCase() || '?'}</span>
        )}
      </div>
      <div className={s.podiumName}>{entry.user_name || entry.name}</div>
      <div className={s.podiumValue}>{Math.round(entry.hours ?? entry.total_hours ?? entry.value ?? 0)}h</div>
      {showStreak && entry.streak != null && (
        <div className={s.podiumStreak}><Flame size={12} /> {entry.streak}d streak</div>
      )}
      {!showStreak && entry.active_members != null && (
        <div className={s.podiumStreak}><Users size={12} /> {entry.active_members} active</div>
      )}
    </div>
  )
}

export default function Leaderboard() {
  const { user } = useAuth()
  const { openProfile, preloadProfile, cancelPreload } = useProfilePanel()
  const { openCommunity, preloadCommunity, cancelPreload: cancelCommPreload } = useCommunityPanel()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const now = new Date()
  const [scope, setScope] = useState('individuals')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchRef = useRef(null)
  const [joinedIds, setJoinedIds] = useState(new Set())

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const isCurrentMonth = year === currentYear && month === currentMonth

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    if (debouncedSearch.length < 2) { setShowSearch(false); return }
    setShowSearch(true)
  }, [debouncedSearch])

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  const goNext = () => {
    if (isCurrentMonth) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const goCurrent = () => { setYear(currentYear); setMonth(currentMonth) }

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.leaderboard.stats(year, month),
    queryFn: () => apiGet(`/leaderboard/stats?year=${year}&month=${month}`),
    enabled: scope === 'individuals',
    staleTime: 30_000,
  })

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: queryKeys.leaderboard.usersMonthly(year, month, 100),
    queryFn: () => apiGet(`/leaderboard/users/monthly?year=${year}&month=${month}&limit=100`),
    enabled: scope === 'individuals',
    staleTime: 30_000,
  })

  const { data: commsData, isLoading: commsLoading } = useQuery({
    queryKey: queryKeys.leaderboard.communitiesMonthly(year, month, 'all', 100),
    queryFn: () => apiGet(`/leaderboard/communities/monthly?year=${year}&month=${month}&limit=100`),
    enabled: scope === 'communities',
    staleTime: 30_000,
  })

  const { data: searchData } = useQuery({
    queryKey: queryKeys.leaderboard.search(debouncedSearch, year, month, scope === 'individuals' ? 'user' : 'community'),
    queryFn: () => apiGet(`/leaderboard/search?q=${encodeURIComponent(debouncedSearch)}&year=${year}&month=${month}&type=${scope === 'individuals' ? 'user' : 'community'}`),
    enabled: showSearch && debouncedSearch.length >= 2,
    staleTime: 10_000,
  })

  const userEntries = usersData?.entries || []
  const myRank = usersData?.my_rank || null
  const commEntries = commsData?.entries || []
  const searchResults = searchData?.results || []

  const top3Users = userEntries.slice(0, 3)
  const restUsers = userEntries.slice(3)
  const top3Comms = commEntries.slice(0, 3)
  const restComms = commEntries.slice(3)

  const medals = { First: '🥇', Second: '🥈', Third: '🥉' }

  const handleQuickJoin = async (e, entry) => {
    e.stopPropagation()
    try {
      await apiPost(`/communities/${entry.id}/join`, {})
      setJoinedIds(prev => new Set([...prev, entry.id]))
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.communitiesMonthly })
    } catch (err) {
      // ignore errors
    }
  }

  const isLoading = scope === 'individuals' ? usersLoading : commsLoading

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Study Rankings</h1>
        <p className={s.subtitle}>Monthly leaderboards across the platform</p>
      </div>

      {/* Scope Tabs */}
      <div className={s.scopeTabs}>
        <button className={`${s.tab} ${scope === 'individuals' ? s.tabActive : ''}`} onClick={() => setScope('individuals')}>
          <Users size={15} /> Individuals
        </button>
        <button className={`${s.tab} ${scope === 'communities' ? s.tabActive : ''}`} onClick={() => setScope('communities')}>
          <Building2 size={15} /> Communities
        </button>
      </div>

      {/* Month Picker */}
      <div className={s.monthPicker}>
        <button className={s.monthNav} onClick={goPrev}><ChevronLeft size={18} /></button>
        <span className={s.monthLabel}>{MONTHS[month - 1]} {year}</span>
        <button className={s.monthNav} onClick={goNext} disabled={isCurrentMonth}><ChevronRight size={18} /></button>
        {!isCurrentMonth && <button className={s.currentBtn} onClick={goCurrent}>Current</button>}
      </div>

      {/* Stats Bar (Individuals only) */}
      {scope === 'individuals' && (
        <div className={s.statsBar}>
          <div className={s.statItem}>
            <BarChart3 size={16} strokeWidth={1.5} />
            <div>
              <div className={s.statValue}>{statsLoading ? '—' : formatNum(statsData?.total_hours)}</div>
              <div className={s.statLabel}>Studied</div>
            </div>
          </div>
          <div className={s.statItem}>
            <Users size={16} strokeWidth={1.5} />
            <div>
              <div className={s.statValue}>{statsLoading ? '—' : formatNum(statsData?.active_students)}</div>
              <div className={s.statLabel}>Active</div>
            </div>
          </div>
          <div className={s.statItem}>
            <Building2 size={16} strokeWidth={1.5} />
            <div>
              <div className={s.statValue}>{statsLoading ? '—' : formatNum(statsData?.total_communities)}</div>
              <div className={s.statLabel}>Comm</div>
            </div>
          </div>
          <div className={s.statItem}>
            <TrendingUp size={16} strokeWidth={1.5} />
            <div>
              <div className={s.statValue}>{statsLoading ? '—' : statsData?.avg_hours != null ? statsData.avg_hours.toFixed(1) : '—'}</div>
              <div className={s.statLabel}>Avg hrs</div>
            </div>
          </div>
        </div>
      )}

      {/* My Rank (Individuals only, when user has hours) */}
      {scope === 'individuals' && myRank && (
        <div className={s.myRankCard}>
          <div className={s.myRankRank}>#{myRank.rank}</div>
          <div className={s.myRankInfo}>
            <div className={s.myRankName}>Your Ranking</div>
            <div className={s.myRankStats}>
              <span>{Math.round(myRank.hours ?? myRank.value ?? 0)} hrs</span>
              {myRank.percentile != null && <span className={s.percentile}>Top {Math.round(myRank.percentile)}%</span>}
              <RankChange change={myRank.rank_change} />
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={s.loading}>Loading rankings...</div>
      ) : scope === 'individuals' && userEntries.length === 0 ? (
        <div className={s.emptyState}>
          <Trophy size={40} strokeWidth={1} />
          <p>Nobody has logged study time this month.</p>
          <a href="/pomodoro" className={s.emptyAction}>Be the first! Start studying →</a>
        </div>
      ) : scope === 'communities' && commEntries.length === 0 ? (
        <div className={s.emptyState}>
          <Building2 size={40} strokeWidth={1} />
          <p>No community activity this month.</p>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className={s.searchWrapper} ref={searchRef}>
            <Search size={16} strokeWidth={1.5} className={s.searchIcon} />
            <input
              className={s.searchInput}
              type="text"
              placeholder={`Search ${scope === 'individuals' ? 'users' : 'communities'}...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {showSearch && searchResults.length > 0 && (
              <div className={s.searchResults}>
                {searchResults.map(r => (
                  <div
                    key={r.id || r.user_id}
                    className={s.searchResult}
                    onClick={() => {
                      setShowSearch(false)
                      setSearchQuery('')
                      if (scope === 'individuals') openProfile(r.user_id || r.id)
                      else navigate(`/communities/${r.id}`)
                    }}
                  >
                    <div className={s.avatar}>
                      {r.avatar_url ? (
                        <img src={imageUrl(r.avatar_url)} alt="" loading="lazy" />
                      ) : (
                        <div className={s.avatarFallback}>{(r.user_name || r.name || '?')[0].toUpperCase()}</div>
                      )}
                    </div>
                    <span className={s.name}>{r.user_name || r.name}</span>
                    <span className={s.value}>{Math.round(r.hours ?? r.total_hours ?? 0)}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Podium */}
          {scope === 'individuals' && top3Users.length > 0 && (
            <div className={s.podium}>
              <PodiumCard entry={top3Users[1]} place="Second" medals={medals} showStreak onClick={() => openProfile(top3Users[1].user_id)} />
              <PodiumCard entry={top3Users[0]} place="First" medals={medals} showStreak onClick={() => openProfile(top3Users[0].user_id)} />
              <PodiumCard entry={top3Users[2]} place="Third" medals={medals} showStreak onClick={() => openProfile(top3Users[2].user_id)} />
            </div>
          )}
          {scope === 'communities' && top3Comms.length > 0 && (
            <div className={s.podium}>
              <PodiumCard entry={top3Comms[1]} place="Second" medals={medals} showStreak={false} onClick={() => openCommunity(top3Comms[1].id)} />
              <PodiumCard entry={top3Comms[0]} place="First" medals={medals} showStreak={false} onClick={() => openCommunity(top3Comms[0].id)} />
              <PodiumCard entry={top3Comms[2]} place="Third" medals={medals} showStreak={false} onClick={() => openCommunity(top3Comms[2].id)} />
            </div>
          )}

          {/* Ranked List */}
          {scope === 'individuals' ? (
            <Virtuoso
              style={{ height: Math.min(restUsers.length * 56 + 20, 600) }}
              totalCount={restUsers.length}
              itemContent={(index) => {
                const entry = restUsers[index]
                const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null
                return (
                  <div
                    key={entry.user_id}
                    className={`${s.row} ${entry.is_me ? s.rowMe : ''}`}
                    onClick={() => openProfile(entry.user_id)}
                    onMouseEnter={() => preloadProfile(entry.user_id)}
                    onMouseLeave={cancelPreload}
                  >
                    <div className={s.rank}>
                      {medal ? <span className={s.medal}>{medal}</span> : <span className={s.rankNum}>{entry.rank}</span>}
                    </div>
                    <div className={s.avatar}>
                      {entry.avatar_url ? (
                        <img src={imageUrl(entry.avatar_url)} alt="" loading="lazy" />
                      ) : (
                        <div className={s.avatarFallback}>{entry.user_name?.[0]?.toUpperCase() || '?'}</div>
                      )}
                    </div>
                    <div className={s.name}>{entry.user_name}</div>
                    <div className={s.value}>{Math.round(entry.hours ?? entry.value ?? 0)}h</div>
                    <RankChange change={entry.rank_change} />
                  </div>
                )
              }}
            />
          ) : (
            <Virtuoso
              style={{ height: Math.min(restComms.length * 60 + 20, 600) }}
              totalCount={restComms.length}
              itemContent={(index) => {
                const entry = restComms[index]
                const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null
                const catCfg = CATEGORY_CONFIG[entry.category]
                const isJoined = entry.is_member || joinedIds.has(entry.id)
                const isApproval = entry.join_type === 'approval'
                const isInviteOnly = entry.join_type === 'invite_only'
                return (
                  <div
                    key={entry.id}
                    className={`${s.row} ${s.communityRow}`}
                    onClick={() => openCommunity(entry.id)}
                    onMouseEnter={() => preloadCommunity(entry.id)}
                    onMouseLeave={cancelCommPreload}
                  >
                    <div className={s.rank}>
                      {medal ? <span className={s.medal}>{medal}</span> : <span className={s.rankNum}>{entry.rank}</span>}
                    </div>
                    <div className={s.avatar}>
                      {entry.avatar_url ? (
                        <img src={imageUrl(entry.avatar_url)} alt="" loading="lazy" />
                      ) : (
                        <div className={s.avatarFallback}>{entry.name?.[0]?.toUpperCase() || '?'}</div>
                      )}
                    </div>
                    <div className={s.communityInfo}>
                      <div className={s.name}>{entry.name}</div>
                      <div className={s.memberInfo}>
                        {catCfg && <span className={s.categoryBadge} style={{ color: catCfg.color, borderColor: catCfg.color }}>{catCfg.label}</span>}
                        <span>{entry.active_members ?? 0} / {entry.member_count ?? 0} members</span>
                      </div>
                    </div>
                    <div className={s.value}>{Math.round(entry.total_hours ?? entry.hours ?? 0)}h</div>
                    <ScoreBadge score={entry.community_score} />
                    {!isJoined && !isInviteOnly && (
                      <button
                        className={`${s.communityJoinBtn} ${isJoined ? s.communityJoinBtnJoined : ''}`}
                        onClick={(e) => handleQuickJoin(e, entry)}
                      >
                        {isApproval ? 'Request' : 'Join'}
                      </button>
                    )}
                    {isJoined && (
                      <span className={s.communityJoinBtnJoined}>Joined!</span>
                    )}
                    {isInviteOnly && !isJoined && (
                      <span className={s.communityJoinBtnDisabled}>Invite Only</span>
                    )}
                  </div>
                )
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
