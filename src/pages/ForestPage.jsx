import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { Leaf } from 'lucide-react'
import {
  getDateBounds, getSubjectColor, getSubjectName, PAGE_SIZE,
} from '../lib/forestUtils'
import ForestLandscape from '../components/forest/ForestLandscape'
import TreeDetailsSheet from '../components/TreeDetailsSheet'
import LoadingScreen from '../components/LoadingScreen'
import styles from './Page.module.css'
import s from './ForestPage.module.css'

const TIME_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This Month' },
  { id: 'all', label: 'All Time' },
]

export default function ForestPage() {
  const { user } = useAuth()
  const [timeFilter, setTimeFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [selectedSession, setSelectedSession] = useState(null)
  const [page, setPage] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.forest.sessions(user?.id),
    queryFn: async () => {
      let query = supabase
        .from('study_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .eq('mode', 'study')
        .order('created_at', { ascending: false })

      const { start } = getDateBounds(timeFilter)
      if (start) query = query.gte('created_at', start)

      const { data: all } = await query.limit(500)
      return all || []
    },
    enabled: !!user,
    staleTime: 15_000,
  })

  const sessions = data || []

  const activeSubjects = useMemo(() => {
    const map = new Map()
    for (const s of sessions) {
      const id = s.subject_id || 'other'
      if (!map.has(id)) map.set(id, s.subject_name || getSubjectName(id))
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [sessions])

  const filteredSessions = useMemo(() => {
    if (subjectFilter === 'all') return sessions
    return sessions.filter(s => (s.subject_id || 'other') === subjectFilter)
  }, [sessions, subjectFilter])

  const displayedSessions = useMemo(() => filteredSessions.slice(0, (page + 1) * PAGE_SIZE), [filteredSessions, page])
  const hasMore = filteredSessions.length > displayedSessions.length

  const totalMinutes = useMemo(() => filteredSessions.reduce((sum, s) => sum + (s.duration_min || 0), 0), [filteredSessions])

  const totalHours = useMemo(() => {
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}` : `${m}m`
  }, [totalMinutes])

  const groveCount = useMemo(() => {
    const ids = new Set(filteredSessions.map(s => s.subject_id || 'other'))
    return ids.size
  }, [filteredSessions])

  const handleTreeClick = useCallback((session) => {
    setSelectedSession(session)
  }, [])

  const handleLoadMore = useCallback(() => {
    setPage(p => p + 1)
  }, [])

  if (isLoading) return <LoadingScreen fullPage={false} message="Loading your forest..." />

  const isEmpty = filteredSessions.length === 0

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Forest</h1>
        <p className={styles.sub}>
          {filteredSessions.length} tree{filteredSessions.length !== 1 ? 's' : ''} &middot; {totalHours} focused
          {groveCount > 1 && <> &middot; {groveCount} subjects</>}
        </p>
      </div>

      <div className={styles.filterRow}>
        {TIME_FILTERS.map(f => (
          <button
            key={f.id}
            className={`${styles.filterBtn} ${timeFilter === f.id ? styles.filterBtnActive : ''}`}
            onClick={() => { setTimeFilter(f.id); setPage(0); setSubjectFilter('all') }}>
            {f.label}
          </button>
        ))}
      </div>

      {activeSubjects.length > 1 && (
        <div className={s.subjectFilters}>
          <button
            className={`${s.subjectChip} ${subjectFilter === 'all' ? s.subjectChipActive : ''}`}
            onClick={() => { setSubjectFilter('all'); setPage(0) }}>
            All Subjects
          </button>
          {activeSubjects.map(sub => (
            <button
              key={sub.id}
              className={`${s.subjectChip} ${subjectFilter === sub.id ? s.subjectChipActive : ''}`}
              style={subjectFilter === sub.id ? {
                background: getSubjectColor(sub.id) + '18',
                borderColor: getSubjectColor(sub.id) + '40',
                color: getSubjectColor(sub.id),
              } : undefined}
              onClick={() => { setSubjectFilter(sub.id); setPage(0) }}>
              <span className={s.subjectDot} style={{ background: getSubjectColor(sub.id) }} />
              {sub.name}
            </button>
          ))}
        </div>
      )}

      <div className={s.landscapeWrapper}>
        <ForestLandscape
          trees={displayedSessions}
          environment="meadow"
          wind
          onTreeClick={handleTreeClick}
          empty={isEmpty}
          transitioning={subjectFilter !== 'all'}
        />
      </div>

      {hasMore && (
        <button className={s.loadMore} onClick={handleLoadMore}>
          <Leaf size={14} />
          Load older trees ({filteredSessions.length - displayedSessions.length} more)
        </button>
      )}

      <TreeDetailsSheet session={selectedSession} onClose={() => setSelectedSession(null)} />
    </div>
  )
}
