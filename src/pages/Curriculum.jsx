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
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)

  // Add forms
  const [sysForm, setSysForm] = useState({ name: '', high_yield: false })
  const [subForm, setSubForm] = useState({ name: '', system_id: '', high_yield: false, difficulty: 'Medium' })
  const [topForm, setTopForm] = useState({ name: '', subject_id: '', high_yield: false, difficulty: 'Medium' })

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

  async function addSystem() {
    if (!sysForm.name.trim()) return
    const { error } = await supabase.from('curriculum_systems').insert({
      user_id: user.id,
      name: sysForm.name.trim(),
      high_yield: sysForm.high_yield,
      status: 'Not Started',
      priority: 1,
    })
    if (error) { alert('Error: ' + error.message); return }
    setSysForm({ name: '', high_yield: false })
    setShowAdd(false)
    loadData()
  }

  async function addSubject() {
    if (!subForm.name.trim() || !subForm.system_id) return
    const { error } = await supabase.from('curriculum_subjects').insert({
      user_id: user.id,
      name: subForm.name.trim(),
      system_id: subForm.system_id,
      high_yield: subForm.high_yield,
      difficulty: subForm.difficulty,
      status: 'Not Started',
    })
    if (error) { alert('Error: ' + error.message); return }
    setSubForm({ name: '', system_id: '', high_yield: false, difficulty: 'Medium' })
    setShowAdd(false)
    loadData()
  }

  async function addTopic() {
    if (!topForm.name.trim() || !topForm.subject_id) return
    const { error } = await supabase.from('curriculum_topics').insert({
      user_id: user.id,
      name: topForm.name.trim(),
      subject_id: topForm.subject_id,
      high_yield: topForm.high_yield,
      difficulty: topForm.difficulty,
      status: 'Not Started',
      completion_pct: 0,
      confidence: 0,
    })
    if (error) { alert('Error: ' + error.message); return }
    setTopForm({ name: '', subject_id: '', high_yield: false, difficulty: 'Medium' })
    setShowAdd(false)
    loadData()
  }

  async function deleteItem(table, id) {
    if (!confirm('Delete this item?')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    loadData()
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
        <p className={styles.sub}>Your complete medical curriculum — add, organize, and track progress.</p>
      </div>

      <div className={styles.tabs}>
        {['systems', 'subjects', 'topics'].map(v => (
          <button key={v} className={`${styles.tab} ${view === v ? styles.tabActive : ''}`} onClick={() => { setView(v); setShowAdd(false) }}>
            {v === 'systems' ? '🫀 Systems' : v === 'subjects' ? '📋 Subjects' : '🔖 Topics'}
          </button>
        ))}
        <button className={styles.tab} onClick={() => setShowAdd(!showAdd)} style={{ marginLeft: 'auto', background: 'var(--tealL)', border: '1px solid rgba(0,181,163,0.3)', color: 'var(--teal)' }}>
          {showAdd ? '✕ Close' : '+ Add New'}
        </button>
      </div>

      {/* ADD FORMS */}
      {showAdd && view === 'systems' && (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>➕ Add New System</h3>
          <div className={styles.field}><label>System Name</label><input value={sysForm.name} onChange={e => setSysForm({ ...sysForm, name: e.target.value })} placeholder="e.g. Cardiovascular System" /></div>
          <label className={styles.checkRow}><input type="checkbox" checked={sysForm.high_yield} onChange={e => setSysForm({ ...sysForm, high_yield: e.target.checked })} /> ⭐ High Yield</label>
          <button className={styles.primaryBtn} onClick={addSystem}>Add System</button>
        </div>
      )}

      {showAdd && view === 'subjects' && (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>➕ Add New Subject</h3>
          <div className={styles.field}><label>Parent System</label>
            <select value={subForm.system_id} onChange={e => setSubForm({ ...subForm, system_id: e.target.value })}>
              <option value="">Select system...</option>
              {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className={styles.field}><label>Subject Name</label><input value={subForm.name} onChange={e => setSubForm({ ...subForm, name: e.target.value })} placeholder="e.g. Cardiac Pharmacology" /></div>
          <div className={styles.row2}>
            <div className={styles.field}><label>Difficulty</label>
              <select value={subForm.difficulty} onChange={e => setSubForm({ ...subForm, difficulty: e.target.value })}>
                {['Easy', 'Medium', 'Hard'].map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '14px' }}>
              <label className={styles.checkRow}><input type="checkbox" checked={subForm.high_yield} onChange={e => setSubForm({ ...subForm, high_yield: e.target.checked })} /> ⭐ High Yield</label>
            </div>
          </div>
          <button className={styles.primaryBtn} onClick={addSubject}>Add Subject</button>
        </div>
      )}

      {showAdd && view === 'topics' && (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>➕ Add New Topic</h3>
          <div className={styles.field}><label>Parent Subject</label>
            <select value={topForm.subject_id} onChange={e => setTopForm({ ...topForm, subject_id: e.target.value })}>
              <option value="">Select subject...</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className={styles.field}><label>Topic Name</label><input value={topForm.name} onChange={e => setTopForm({ ...topForm, name: e.target.value })} placeholder="e.g. Atrial Fibrillation" /></div>
          <div className={styles.row2}>
            <div className={styles.field}><label>Difficulty</label>
              <select value={topForm.difficulty} onChange={e => setTopForm({ ...topForm, difficulty: e.target.value })}>
                {['Easy', 'Medium', 'Hard'].map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '14px' }}>
              <label className={styles.checkRow}><input type="checkbox" checked={topForm.high_yield} onChange={e => setTopForm({ ...topForm, high_yield: e.target.checked })} /> ⭐ High Yield</label>
            </div>
          </div>
          <button className={styles.primaryBtn} onClick={addTopic}>Add Topic</button>
        </div>
      )}

      {/* SYSTEMS VIEW */}
      {view === 'systems' && (
        <div className={styles.grid}>
          {systems.length === 0 && <div className={styles.empty}>No systems yet. Click "+ Add New" to create one!</div>}
          {systems.map(s => {
            const comp = getSystemCompletion(s.id)
            return (
              <div key={s.id} className={styles.card} style={{ '--c': statusColor(s.status) }}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{s.name}</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {s.high_yield && <span className={styles.hyBadge}>⭐ HY</span>}
                    <button onClick={() => deleteItem('curriculum_systems', s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.4, padding: '2px' }} title="Delete">🗑</button>
                  </div>
                </div>
                <div className={styles.statusDot} style={{ background: statusColor(s.status) }} />
                <div className={styles.cardStatus}>{s.status}</div>
                <div className={styles.progBar}><div className={styles.progFill} style={{ width: `${comp}%`, background: statusColor(s.status) }} /></div>
                <div className={styles.progNum}>{comp}% complete · {subjects.filter(sub => sub.system_id === s.id).length} subjects</div>
              </div>
            )
          })}
        </div>
      )}

      {/* SUBJECTS VIEW */}
      {view === 'subjects' && (
        <div className={styles.grid}>
          {subjects.length === 0 && <div className={styles.empty}>No subjects yet. Click "+ Add New" to create one!</div>}
          {subjects.map(s => {
            const parentSystem = systems.find(sys => sys.id === s.system_id)
            const subjectTopics = topics.filter(t => t.subject_id === s.id)
            const comp = subjectTopics.length > 0 ? Math.round(subjectTopics.reduce((sum, t) => sum + (t.completion_pct || 0), 0) / subjectTopics.length) : 0
            return (
              <div key={s.id} className={styles.card} style={{ '--c': statusColor(s.status) }}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{s.name}</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {s.high_yield && <span className={styles.hyBadge}>⭐ HY</span>}
                    <button onClick={() => deleteItem('curriculum_subjects', s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.4, padding: '2px' }} title="Delete">🗑</button>
                  </div>
                </div>
                <div className={styles.cardStatus}>{parentSystem ? parentSystem.name : ''} · {s.difficulty || '—'}</div>
                <div className={styles.progBar}><div className={styles.progFill} style={{ width: `${comp}%`, background: statusColor(s.status) }} /></div>
                <div className={styles.progNum}>{comp}% · {subjectTopics.length} topics</div>
              </div>
            )
          })}
        </div>
      )}

      {/* TOPICS VIEW */}
      {view === 'topics' && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Topic</th><th>Subject</th><th>Status</th><th>Difficulty</th><th>Completion</th><th>High Yield</th><th></th>
              </tr>
            </thead>
            <tbody>
              {topics.length === 0 && <tr><td colSpan={7} className={styles.empty}>No topics yet. Click "+ Add New" to create one!</td></tr>}
              {topics.map(t => {
                const parentSubject = subjects.find(s => s.id === t.subject_id)
                return (
                  <tr key={t.id}>
                    <td className={styles.topicName}>{t.name}</td>
                    <td><span style={{ fontSize: '12px', color: 'var(--mist)' }}>{parentSubject ? parentSubject.name : '—'}</span></td>
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
                    <td>
                      <button onClick={() => deleteItem('curriculum_topics', t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', opacity: 0.3 }} title="Delete">🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
