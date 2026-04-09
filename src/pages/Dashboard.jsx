import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { profile, user } = useAuth()
  const [stats, setStats] = useState({ sessions: 0, pomodoros: 0, topicsInProgress: 0, cardsdue: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const today = new Date().toISOString().split('T')[0]
      const [s, p, t, a] = await Promise.all([
        supabase.from('study_sessions').select('id', { count: 'exact', head: true }).eq('date', today),
        supabase.from('pomodoro_sessions').select('id', { count: 'exact', head: true }).eq('date', today).eq('completed', true),
        supabase.from('curriculum_topics').select('id', { count: 'exact', head: true }).eq('status', 'In Progress'),
        supabase.from('anki_cards').select('id', { count: 'exact', head: true }).lte('next_review_date', today),
      ])
      if (s.error) console.error('Dashboard sessions error:', s.error)
      if (p.error) console.error('Dashboard pomodoros error:', p.error)
      if (t.error) console.error('Dashboard topics error:', t.error)
      if (a.error) console.error('Dashboard anki error:', a.error)
      setStats({
        sessions: s.count || 0,
        pomodoros: p.count || 0,
        topicsInProgress: t.count || 0,
        cardsdue: a.count || 0
      })
    } catch (err) {
      console.error('loadStats error:', err)
    }
    setLoading(false)
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  if (loading) return <div className={styles.loading}>Loading...</div>

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.greeting}>{greeting()},</div>
        <h1 className={styles.name}>{profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Doctor'} 👋</h1>
        <p className={styles.sub}>Here is your study command centre for today.</p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {[
          { n: stats.pomodoros, l: 'Pomodoros Today', c: 'var(--teal)', icon: '🍅' },
          { n: stats.sessions, l: 'Sessions Today', c: 'var(--sage)', icon: '📖' },
          { n: stats.topicsInProgress, l: 'Topics In Progress', c: 'var(--gold)', icon: '🔖' },
          { n: stats.cardsdue, l: 'Anki Cards Due', c: 'var(--coral)', icon: '🃏' },
        ].map((s, i) => (
          <div className={styles.statCard} key={i} style={{ '--c': s.c }}>
            <div className={styles.statIcon}>{s.icon}</div>
            <div className={styles.statNum}>{s.n}</div>
            <div className={styles.statLabel}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Daily Routine */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>🌅 Daily Routine</h2>
        <div className={styles.routineGrid}>
          {[
            { step: '1', title: 'Check Anki Cards Due', desc: 'Review all due cards before starting new material.', link: '/anki', cta: 'Open Anki →', color: 'var(--violet)' },
            { step: '2', title: 'Pick Your Topic', desc: 'Open Curriculum → study your topics and track progress.', link: '/curriculum', cta: 'Open Curriculum →', color: 'var(--teal)' },
            { step: '3', title: 'Start a Pomodoro', desc: '25 minutes focused study. Log each block.', link: '/pomodoro', cta: 'Open Timer →', color: 'var(--coral)' },
            { step: '4', title: 'Log Study Session', desc: 'Record duration, energy, and focus after each block.', link: '/sessions', cta: 'Log Session →', color: 'var(--sage)' },
          ].map((r, i) => (
            <a href={r.link} key={i} className={styles.routineCard} style={{ '--rc': r.color }}>
              <div className={styles.routineStep}>{r.step}</div>
              <div className={styles.routineTitle}>{r.title}</div>
              <div className={styles.routineDesc}>{r.desc}</div>
              <div className={styles.routineCta}>{r.cta}</div>
            </a>
          ))}
        </div>
      </div>

      {/* Quick tip */}
      <div className={styles.tip}>
        <span className={styles.tipIcon}>💡</span>
        <div>
          <strong>Golden Rule:</strong> Update topic completion using the dropdown in Curriculum → Topics. Your progress is tracked automatically.
        </div>
      </div>
    </div>
  )
}
