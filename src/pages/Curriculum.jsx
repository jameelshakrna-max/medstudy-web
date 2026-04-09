import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Page.module.css'

export default function Curriculum() {
  const { user } = useAuth()
  const [systems, setSystems] = useState([])
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [view, setView] = useState('systems')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [sysRes, subRes, topRes] = await Promise.all([
        supabase.from('curriculum_systems').select('*').order('name'),
        supabase.from('curriculum_subjects').select('*').order('name'),
        supabase.from('curriculum_topics').select('*').order('name').limit(200),
      ])
      if (sysRes.error) console.error('Error loading systems:', sysRes.error)
      if (subRes.error) console.error('Error loading subjects:', subRes.error)
      if (topRes.error) console.error('Error loading topics:', topRes.error)
      setSystems(sysRes.data || [])
      setSubjects(subRes.data || [])
      setTopics(topRes.data || [])
    } catch (err) {
      console.error('loadData error:', err)
    }
    setLoading(false)
  }

  async function updateTopicStatus(id, status) {
    try {
      const completionPct = status === 'Complete' ? 100 : status === 'In Progress' ? 50 : 0
      const { error } = await supabase.from('curriculum_topics')
        .update({ status, completion_pct: completionPct })
        .eq('id', id)
      if (error) {
        console.error('Error updating topic:', error)
        alert('Error updating topic: ' + error.message)
        return
      }
      setTopics(prev => prev.map(t => t.id === id ? { ...t, status, completion_pct: completionPct } : t))
    } catch (err) {
      console.error('updateTopicStatus error:', err)
    }
  }

  // Compute system completion from its topics
  function getSystemCompletion(systemId) {
    const systemTopics = topics.filter(t => {
      const subject = subjects.find(s => s.id === t.subject_id)
      return subject && subject.system_id === systemId
    })
    if (systemTopics.length === 0) return 0
    const total = systemTopics.reduce((sum, t) => sum + (t.completion_pct || 0), 0)
    return Math.round(total / systemTopics.length)
  }

  const statusColor = s => s === 'In Progress' ? 'var(--teal)' : s === 'Complete' ? 'var(--sage)' : s === 'Reviewing' ? 'var(--violet)' : 'var(--mist)'

  if (loading) return <div className={styles.loading}>Loading curriculum...</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>📚 Curriculum</h1>
        <p className={styles.sub}>Your complete 5-level medical curriculum — sorted by priority.</p>
      </div>

      <div className={styles.tabs}>
        {['systems', 'subjects', 'topics'].map(v => (
          <button key={v} className={`${styles.tab} ${view === v ? styles.tabActive : ''}`} onClick={() => setView(v)}>
            {v === 'systems' ? '🫀 Systems' : v === 'subjects' ? '📋 Subjects' : '🔖 Topics'}
          </button>
        ))}
      </div>

      {view === 'systems' && (
        <div className={styles.grid}>
          {systems.length === 0 && <div className={styles.empty}>No systems yet.</div>}
          {systems.map(s => {
            const comp = getSystemCompletion(s.id)
            return (
              <div key={s.id} className={styles.card} style={{ '--c': statusColor(s.status) }}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{s.name}</span>
                  {s.high_yield && <span className={styles.hyBadge}>⭐ HY</span>}
                </div>
                <div className={styles.statusDot} style={{ background: statusColor(s.status) }} />
                <div className={styles.cardStatus}>{s.status}</div>
                <div className={styles.progBar}><div className={styles.progFill} style={{ width: `${comp}%`, background: statusColor(s.status) }} /></div>
                <div className={styles.progNum}>{comp}%</div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'subjects' && (
        <div className={styles.grid}>
          {subjects.length === 0 && <div className={styles.empty}>No subjects yet.</div>}
          {subjects.map(s => (
            <div key={s.id} className={styles.card} style={{ '--c': statusColor(s.status) }}>
              <div className={styles.cardTop}>
                <span className={styles.cardName}>{s.name}</span>
                {s.high_yield && <span className={styles.hyBadge}>⭐ HY</span>}
              </div>
              <div className={styles.statusDot} style={{ background: statusColor(s.status) }} />
              <div className={styles.cardStatus}>{s.status}</div>
              {s.difficulty && <div className={styles.cardStatus}>Difficulty: {s.difficulty}</div>}
            </div>
          ))}
        </div>
      )}

      {view === 'topics' && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Topic</th><th>Status</th><th>Difficulty</th><th>Completion</th><th>High Yield</th>
              </tr>
            </thead>
            <tbody>
              {topics.length === 0 && <tr><td colSpan={5} className={styles.empty}>No topics yet.</td></tr>}
              {topics.map(t => (
                <tr key={t.id}>
                  <td className={styles.topicName}>{t.name}</td>
                  <td>
                    <select className={styles.statusSel} value={t.status} onChange={e => updateTopicStatus(t.id, e.target.value)}
                      style={{ color: statusColor(t.status) }}>
                      {['Not Started', 'In Progress', 'Reviewing', 'Complete'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><span className={styles.diff} data-d={t.difficulty}>{t.difficulty || '—'}</span></td>
                  <td>
                    <div className={styles.progBar}><div className={styles.progFill} style={{ width: `${t.completion_pct || 0}%`, background: statusColor(t.status) }} /></div>
                    <span className={styles.progNum}>{t.completion_pct || 0}%</span>
                  </td>
                  <td>{t.high_yield ? '⭐' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
