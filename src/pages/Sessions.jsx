import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Page.module.css'

export default function Sessions() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState([])
  const [form, setForm] = useState({ label: '', date: '', duration_min: 60, session_type: 'Study', energy_level: 'High', focus_quality: 'Deep focus', goals_met: false, notes: '' })
  const [view, setView] = useState('list')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('week')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => { loadSessions(); setForm(f => ({ ...f, date: new Date().toISOString().split('T')[0] })) }, [])

  async function loadSessions() {
    try {
      const { data, error } = await supabase.from('study_sessions').select('*').eq('user_id', user.id).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(200)
      if (error) console.error('Error loading sessions:', error)
      setSessions(data || [])
    } catch (err) { console.error('loadSessions error:', err) }
    setLoading(false)
  }

  async function addSession() {
    if (!form.label) return
    try {
      const { error } = await supabase.from('study_sessions').insert({ user_id: user.id, label: form.label, date: form.date, duration_min: form.duration_min, session_type: form.session_type, energy_level: form.energy_level, focus_quality: form.focus_quality, goals_met: form.goals_met, notes: form.notes || null })
      if (error) { alert('Error logging session: ' + error.message); return }
      setForm(f => ({ ...f, label: '', notes: '', goals_met: false }))
      loadSessions()
      setView('list')
    } catch (err) { console.error('addSession error:', err) }
  }

  async function deleteSession(id) {
    if (!confirm('Delete this session?')) return
    try {
      const { error } = await supabase.from('study_sessions').delete().eq('id', id)
      if (error) { alert('Error deleting: ' + error.message); return }
      loadSessions()
    } catch (err) { console.error('deleteSession error:', err) }
  }

  // ── Date filtering ──
  const now = useMemo(() => new Date(), [])
  const todayStr = now.toISOString().split('T')[0]

  const filteredByDate = useMemo(() => {
    if (filter === 'all') return sessions
    if (filter === 'today') return sessions.filter(s => s.date === todayStr)
    if (filter === 'week') {
      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 7)
      const weekStr = weekAgo.toISOString().split('T')[0]
      return sessions.filter(s => s.date >= weekStr)
    }
    if (filter === 'month') {
      const monthAgo = new Date(now)
      monthAgo.setDate(monthAgo.getDate() - 30)
      const monthStr = monthAgo.toISOString().split('T')[0]
      return sessions.filter(s => s.date >= monthStr)
    }
    return sessions
  }, [sessions, filter, todayStr, now])

  // ── Type filtering ──
  const sessionTypes = useMemo(() => {
    const types = new Set(sessions.map(s => s.session_type).filter(Boolean))
    return ['all', ...Array.from(types).sort()]
  }, [sessions])

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return filteredByDate
    return filteredByDate.filter(s => s.session_type === typeFilter)
  }, [filteredByDate, typeFilter])

  // ── Stats ──
  const totalMin = filtered.reduce((s, ss) => s + (ss.duration_min || 0), 0)
  const totalSessions = filtered.length
  const avgDuration = totalSessions > 0 ? Math.round(totalMin / totalSessions) : 0
  const goalsMet = filtered.filter(s => s.goals_met).length

  // ── Group sessions by date ──
  const grouped = useMemo(() => {
    const groups = {}
    filtered.forEach(s => {
      if (!groups[s.date]) groups[s.date] = []
      groups[s.date].push(s)
    })
    // Sort dates descending
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00')
    const today = new Date(); today.setHours(0,0,0,0)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    if (d.getTime() === today.getTime()) return 'Today'
    if (d.getTime() === yesterday.getTime()) return 'Yesterday'
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const energyColor = e => e === 'High' ? 'var(--sage)' : e === 'Medium' ? 'var(--gold)' : 'var(--coral)'

  // ── Streak calculation ──
  const streak = useMemo(() => {
    if (sessions.length === 0) return 0
    const dates = [...new Set(sessions.map(s => s.date))].sort().reverse()
    let count = 0
    const check = new Date(); check.setHours(0,0,0,0)
    for (const d of dates) {
      const sessionDate = new Date(d + 'T00:00:00')
      const diff = Math.round((check - sessionDate) / 86400000)
      if (diff <= 1) { count++; check.setTime(sessionDate.getTime()) }
      else break
    }
    return count
  }, [sessions])

  if (loading) return <div className={styles.loading}>Loading sessions...</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Study Sessions</h1>
        <p className={styles.sub}>
          {totalSessions} session{totalSessions !== 1 ? 's' : ''} &middot; {(totalMin / 60).toFixed(1)}h total &middot; {avgDuration}min avg
          {streak > 1 && <span style={{ color: 'var(--gold)', marginLeft: 8 }}>🔥 {streak} day streak</span>}
        </p>
      </div>

      <div className={styles.tabs}>
        {[['list', 'Sessions'], ['add', '+ Log Session']].map(([v, l]) => (
          <button key={v} className={`${styles.tab} ${view === v ? styles.tabActive : ''}`} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>

      {view === 'add' ? (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Log Study Session</h3>
          <div className={styles.field}><label>Session Title</label><input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Cardiology Morning Block" /></div>
          <div className={styles.row2}>
            <div className={styles.field}><label>Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className={styles.field}><label>Duration (min)</label><input type="number" value={form.duration_min} onChange={e => setForm({ ...form, duration_min: +e.target.value })} /></div>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}><label>Type</label><select value={form.session_type} onChange={e => setForm({ ...form, session_type: e.target.value })}>{['Study', 'Lectures', 'Anki', 'UWorld', 'Review', 'Reading', 'Pomodoro'].map(t => <option key={t}>{t}</option>)}</select></div>
            <div className={styles.field}><label>Energy</label><select value={form.energy_level} onChange={e => setForm({ ...form, energy_level: e.target.value })}>{['High', 'Medium', 'Low'].map(t => <option key={t}>{t}</option>)}</select></div>
          </div>
          <div className={styles.field}><label>Focus Quality</label><select value={form.focus_quality} onChange={e => setForm({ ...form, focus_quality: e.target.value })}>{['Deep focus', 'Moderate', 'Distracted'].map(t => <option key={t}>{t}</option>)}</select></div>
          <div className={styles.field}><label>Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="What you covered..." /></div>
          <label className={styles.checkRow}><input type="checkbox" checked={form.goals_met} onChange={e => setForm({ ...form, goals_met: e.target.checked })} /> Goals Met</label>
          <button className={styles.primaryBtn} onClick={addSession}>Log Session</button>
        </div>
      ) : (
        <>
          {/* ── Date Filter ── */}
          <div className={styles.filterRow}>
            {[['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['all', 'All Time']].map(([v, l]) => (
              <button key={v} className={`${styles.filterBtn} ${filter === v ? styles.filterBtnActive : ''}`} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>

          {/* ── Type Filter ── */}
          {sessionTypes.length > 2 && (
            <div className={styles.filterRow} style={{ marginTop: 8 }}>
              {sessionTypes.map(t => (
                <button key={t} className={`${styles.filterBtnSm} ${typeFilter === t ? styles.filterBtnSmActive : ''}`} onClick={() => setTypeFilter(t)}>
                  {t === 'all' ? 'All Types' : t}
                </button>
              ))}
            </div>
          )}

          {/* ── Stats Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(0,181,163,0.1), rgba(0,181,163,0.03))', border: '1px solid rgba(0,181,163,0.2)', borderRadius: '14px', padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: '24px', color: '#fff' }}>{(totalMin / 60).toFixed(1)}</div>
              <div style={{ fontSize: '10px', color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Hours</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, rgba(61,190,122,0.1), rgba(61,190,122,0.03))', border: '1px solid rgba(61,190,122,0.2)', borderRadius: '14px', padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: '24px', color: '#fff' }}>{totalSessions}</div>
              <div style={{ fontSize: '10px', color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Sessions</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.1), rgba(108,99,255,0.03))', border: '1px solid rgba(108,99,255,0.2)', borderRadius: '14px', padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: '24px', color: '#fff' }}>{avgDuration}</div>
              <div style={{ fontSize: '10px', color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Avg Min</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(212,175,55,0.03))', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '14px', padding: '14px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: '24px', color: '#fff' }}>{goalsMet}</div>
              <div style={{ fontSize: '10px', color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Goals Met</div>
            </div>
          </div>

          {/* ── Session List (grouped by date) ── */}
          <div className={styles.cardList}>
            {filtered.length === 0 && <div className={styles.empty}>No sessions found for this period.</div>}
            {grouped.map(([date, items]) => (
              <div key={date}>
                <div className={styles.dateGroup}>{formatDate(date)}</div>
                {items.map(s => (
                  <div key={s.id} className={styles.sessionCard}>
                    <div className={styles.sessTop}>
                      <span className={styles.sessLabel}>{s.label}</span>
                      <span className={styles.sessDur}>{s.duration_min} min</span>
                    </div>
                    <div className={styles.sessMeta}>
                      <span className={styles.sessType}>{s.session_type}</span>
                      <span style={{ color: energyColor(s.energy_level) }}>Energy: {s.energy_level}</span>
                      <span>{s.focus_quality}</span>
                      {s.goals_met && <span style={{ color: 'var(--sage)' }}>Goals Met</span>}
                    </div>
                    {s.notes && <div className={styles.sessNotes}>{s.notes}</div>}
                    <button className={styles.sessDelete} onClick={() => deleteSession(s.id)} title="Delete">✕</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
