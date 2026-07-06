import { useEffect, useState, memo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Timer, BookOpen, BrainCircuit, Target, Lightbulb, ArrowRight, Check, ChevronRight } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'
import { calculateGoalProgress } from '../services/goalProgress'
import styles from './Dashboard.module.css'

const STAT_ICONS = [Timer, BookOpen, BrainCircuit, Target]

const DashStatCards = memo(function DashStatCards({ stats }) {
  return (
    <div className={styles.statsGrid}>
      {[
        { n: stats.pomodoros, l: 'Pomodoros Today', c: 'var(--blue)' },
        { n: stats.sessions, l: 'Sessions Today', c: 'var(--emerald)' },
        { n: stats.topicsInProgress, l: 'Topics In Progress', c: 'var(--amber)' },
        { n: stats.cardsdue, l: 'Anki Cards Due', c: 'var(--indigo)' },
      ].map((s, i) => {
        const Icon = STAT_ICONS[i]
        return (
          <div className={styles.statCard} key={i} style={{ '--c': s.c }}>
            <div className={styles.statIconWrap}>
              <Icon size={22} strokeWidth={1.5} />
            </div>
            <div className={styles.statNum}>{s.n}</div>
            <div className={styles.statLabel}>{s.l}</div>
          </div>
        )
      })}
    </div>
  )
})

export default function Dashboard() {
  const { profile, user } = useAuth()
  const [stats, setStats] = useState({ sessions: 0, pomodoros: 0, topicsInProgress: 0, cardsdue: 0 })
  const [goalSummaries, setGoalSummaries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) loadStats() }, [user])

  async function loadStats() {
    try {
      const today = new Date().toISOString().split('T')[0]

      const [s, p, t, goalsRes, blocksRes, mrcpRes, boardRes] = await Promise.all([
        supabase.from('study_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('date', today),
        supabase.from('study_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('date', today).eq('session_type', 'Pomodoro'),
        supabase.from('curriculum_topics').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'In Progress'),
        supabase.from('goals').select('*').eq('user_id', user.id),
        supabase.from('uworld_blocks').select('total_questions,correct,time_minutes,subject_id,created_at').eq('user_id', user.id),
        supabase.from('mrcp_topics').select('status').eq('user_id', user.id),
        supabase.from('local_board_cases').select('id').eq('user_id', user.id),
      ])

      if (s.error) console.error('Dashboard sessions error:', s.error)
      if (p.error) console.error('Dashboard pomodoros error:', p.error)
      if (t.error) console.error('Dashboard topics error:', t.error)

      let cardsdue = 0
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/flashcards/due-count', {
          headers: { Authorization: 'Bearer ' + session.access_token }
        })
        const data = await res.json()
        cardsdue = data.count ?? 0
      } catch (e) {
        console.error('Dashboard due-count fetch error:', e)
      }

      setStats({
        sessions: s.count || 0,
        pomodoros: p.count || 0,
        topicsInProgress: t.count || 0,
        cardsdue
      })

      const goals = goalsRes.data || []
      if (goals.length > 0) {
        const blocks = blocksRes.data || []
        const mrcpTopics = mrcpRes.data || []
        const boardCases = boardRes.data || []

        const totalQuestions = blocks.reduce((sum, b) => sum + (b.total_questions || 0), 0)
        const totalMinutes = blocks.reduce((sum, b) => sum + (b.time_minutes || 0), 0)
        const currentStreak = 0

        const perf = { overallScore: 0 }
        const subjectsRankings = []
        const bySubject = {}
        for (const b of blocks) {
          if (b.subject_id && b.total_questions > 0 && b.correct != null) {
            if (!bySubject[b.subject_id]) bySubject[b.subject_id] = { scores: [], blocks: 0 }
            bySubject[b.subject_id].scores.push((b.correct / b.total_questions) * 100)
            bySubject[b.subject_id].blocks++
          }
        }
        for (const [subject, data] of Object.entries(bySubject)) {
          subjectsRankings.push({
            subject,
            avgScore: Math.round(data.scores.reduce((s, v) => s + v, 0) / data.scores.length),
            blocks: data.blocks,
          })
        }

        const report = {
          analytics: {
            totalQuestions,
            totalBlocks: blocks.length,
            totalMrcpTopics: mrcpTopics.length,
            totalMrcpMastered: mrcpTopics.filter(t => t.status === 'Mastered').length,
            totalCases: boardCases.length,
            currentStreak,
            totalStudyMinutes: totalMinutes,
          },
          subjects: { rankings: subjectsRankings },
          performance: perf,
        }

        setGoalSummaries(goals.map(g => calculateGoalProgress(g, report)).filter(g => g.status !== 'expired'))
      }
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

  if (loading) return <LoadingScreen fullPage={false} message="Loading..." />

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.greeting}>{greeting()}</div>
        <h1 className={styles.name}>{profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Doctor'}</h1>
        <p className={styles.sub}>Here is your study command centre for today.</p>
      </div>

      <DashStatCards stats={stats} />

      {/* Goal Summary */}
      {goalSummaries.length > 0 && (
        <div className={styles.section}>
          <div className={styles.goalSectionHeader}>
            <h2 className={styles.goalSectionTitle}>Study Goals</h2>
            <a href="/goals" className={styles.goalViewAll}>
              View All <ChevronRight size={12} />
            </a>
          </div>
          <div className={styles.goalList}>
            {goalSummaries.filter(g => g.status === 'active' || !g.status).slice(0, 3).map(g => (
              <div key={g.id} className={styles.goalItem}>
                <div className={styles.goalIcon} style={{ background: g.pct >= 100 ? 'var(--emerald)' : 'var(--blue)' }}>
                  {g.pct >= 100 ? <Check size={14} color="#0B1120" /> : <Target size={14} color="#0B1120" />}
                </div>
                <div className={styles.goalBody}>
                  <div className={styles.goalTitle}>{g.title}</div>
                  <div className={styles.goalTrack}>
                    <div className={styles.goalFill} style={{
                      width: `${Math.min(100, g.pct)}%`,
                      background: g.pct >= 100 ? 'var(--emerald)' : 'var(--blue)',
                    }} />
                  </div>
                  <div className={styles.goalMeta}>
                    {Math.round(g.current)} / {Math.round(g.target_value)} · {g.pct}%
                  </div>
                </div>
                <div className={styles.goalPct} style={{ color: g.pct >= 100 ? 'var(--emerald)' : 'var(--blue)' }}>
                  {g.pct}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Daily Routine</h2>
        <div className={styles.routineGrid}>
          {[
            { step: '01', title: 'Check Anki Cards Due', desc: 'Review all due cards before starting new material.', link: '/anki', cta: 'Open Anki', color: 'var(--indigo)' },
            { step: '02', title: 'Pick Your Topic', desc: 'Open Curriculum, study your topics, and track progress.', link: '/curriculum', cta: 'Open Curriculum', color: 'var(--blue)' },
            { step: '03', title: 'Start a Pomodoro', desc: '25 minutes focused study. Log each block.', link: '/pomodoro', cta: 'Open Timer', color: 'var(--red)' },
            { step: '04', title: 'Log Study Session', desc: 'Record duration, energy, and focus after each block.', link: '/sessions', cta: 'Log Session', color: 'var(--emerald)' },
          ].map((r, i) => (
            <a href={r.link} key={i} className={styles.routineCard} style={{ '--rc': r.color }}>
              <div className={styles.routineStep}>{r.step}</div>
              <div className={styles.routineTitle}>{r.title}</div>
              <div className={styles.routineDesc}>{r.desc}</div>
              <div className={styles.routineCta}>
                {r.cta}
                <ArrowRight size={12} strokeWidth={2} />
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className={styles.tip}>
        <Lightbulb size={18} strokeWidth={1.5} className={styles.tipIcon} />
        <div>
          <strong>Golden Rule:</strong> Update topic completion using the dropdown in Curriculum &rarr; Topics. Your progress is tracked automatically.
        </div>
      </div>
    </div>
  )
}