import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from './Page.module.css'

export default function Curriculum() {
  const [systems, setSystems] = useState([])
  const [topics, setTopics] = useState([])
  const [view, setView] = useState('systems')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [s, t] = await Promise.all([
      supabase.from('curriculum_systems').select('*').order('name'),
      supabase.from('curriculum_topics').select('*').order('sort_priority').order('name').limit(100),
    ])
    setSystems(s.data || [])
    setTopics(t.data || [])
    setLoading(false)
  }

  async function updateTopicStatus(id, status) {
    const sp = status==='In Progress'?1:status==='Reviewing'?2:status==='Not Started'?3:4
    await supabase.from('curriculum_topics').update({ status, sort_priority: sp }).eq('id', id)
    setTopics(prev => prev.map(t => t.id===id ? {...t, status, sort_priority: sp} : t)
      .sort((a,b) => a.sort_priority - b.sort_priority))
  }

  const statusColor = s => s==='In Progress'?'var(--teal)':s==='Complete'?'var(--sage)':s==='Reviewing'?'var(--violet)':'var(--mist)'

  if (loading) return <div className={styles.loading}>Loading curriculum...</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>📚 Curriculum</h1>
        <p className={styles.sub}>Your complete 5-level medical curriculum — sorted by priority.</p>
      </div>

      <div className={styles.tabs}>
        {['systems','topics'].map(v => (
          <button key={v} className={`${styles.tab} ${view===v?styles.tabActive:''}`} onClick={() => setView(v)}>
            {v==='systems'?'🫀 Systems':'🔖 Topics'}
          </button>
        ))}
      </div>

      {view === 'systems' && (
        <div className={styles.grid}>
          {systems.map(s => (
            <div key={s.id} className={styles.card} style={{'--c': statusColor(s.status)}}>
              <div className={styles.cardTop}>
                <span className={styles.cardName}>{s.name}</span>
                {s.high_yield && <span className={styles.hyBadge}>⭐ HY</span>}
              </div>
              <div className={styles.statusDot} style={{background: statusColor(s.status)}} />
              <div className={styles.cardStatus}>{s.status}</div>
              <div className={styles.progBar}><div className={styles.progFill} style={{width: `${s.completion_pct||0}%`, background: statusColor(s.status)}} /></div>
              <div className={styles.progNum}>{s.completion_pct||0}%</div>
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
              {topics.map(t => (
                <tr key={t.id}>
                  <td className={styles.topicName}>{t.name}</td>
                  <td>
                    <select className={styles.statusSel} value={t.status} onChange={e => updateTopicStatus(t.id, e.target.value)}
                      style={{color: statusColor(t.status)}}>
                      {['Not Started','In Progress','Reviewing','Complete'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><span className={styles.diff} data-d={t.difficulty}>{t.difficulty}</span></td>
                  <td>
                    <div className={styles.progBar}><div className={styles.progFill} style={{width:`${t.completion_pct||0}%`,background:statusColor(t.status)}} /></div>
                    <span className={styles.progNum}>{t.completion_pct||0}%</span>
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
