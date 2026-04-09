import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from './Page.module.css'

export default function Sessions() {
  const [sessions, setSessions] = useState([])
  const [form, setForm] = useState({ label:'', date:'', duration_min:60, session_type:'Study', energy_level:'High', focus_quality:'Deep focus', goals_met:false, notes:'' })
  const [view, setView] = useState('list')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions()
    setForm(f => ({...f, date: new Date().toISOString().split('T')[0]}))
  }, [])

  async function loadSessions() {
    const { data } = await supabase.from('study_sessions').select('*').order('date', {ascending:false}).order('created_at', {ascending:false}).limit(50)
    setSessions(data||[])
    setLoading(false)
  }

  async function addSession() {
    if (!form.label) return
    await supabase.from('study_sessions').insert({ ...form })
    setForm(f => ({...f, label:'', notes:'', goals_met:false}))
    loadSessions()
    setView('list')
  }

  const totalHours = sessions.reduce((s,ss) => s + (ss.duration_min||0), 0)
  const energyColor = e => e==='High'?'var(--sage)':e==='Medium'?'var(--gold)':'var(--coral)'

  if (loading) return <div className={styles.loading}>Loading sessions...</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>📖 Study Sessions</h1>
        <p className={styles.sub}>{sessions.length} sessions · {Math.round(totalHours/60)} total hours</p>
      </div>

      <div className={styles.tabs}>
        {[['list','Sessions'],['add','+ Log Session']].map(([v,l]) => (
          <button key={v} className={`${styles.tab} ${view===v?styles.tabActive:''}`} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>

      {view==='add' ? (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Log Study Session</h3>
          <div className={styles.field}><label>Session Title</label><input value={form.label} onChange={e=>setForm({...form,label:e.target.value})} placeholder="e.g. Cardiology Morning Block"/></div>
          <div className={styles.row2}>
            <div className={styles.field}><label>Date</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
            <div className={styles.field}><label>Duration (min)</label><input type="number" value={form.duration_min} onChange={e=>setForm({...form,duration_min:+e.target.value})}/></div>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}><label>Type</label>
              <select value={form.session_type} onChange={e=>setForm({...form,session_type:e.target.value})}>
                {['Study','Lectures','Anki','UWorld','Review','Reading'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className={styles.field}><label>Energy</label>
              <select value={form.energy_level} onChange={e=>setForm({...form,energy_level:e.target.value})}>
                {['High','Medium','Low'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.field}><label>Focus Quality</label>
            <select value={form.focus_quality} onChange={e=>setForm({...form,focus_quality:e.target.value})}>
              {['Deep focus','Moderate','Distracted'].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div className={styles.field}><label>Notes</label><textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="What you covered..."/></div>
          <label className={styles.checkRow}><input type="checkbox" checked={form.goals_met} onChange={e=>setForm({...form,goals_met:e.target.checked})}/> ✅ Goals Met</label>
          <button className={styles.primaryBtn} onClick={addSession}>Log Session</button>
        </div>
      ) : (
        <div className={styles.cardList}>
          {sessions.length===0 && <div className={styles.empty}>No sessions yet. Log your first study session!</div>}
          {sessions.map(s => (
            <div key={s.id} className={styles.sessionCard}>
              <div className={styles.sessTop}>
                <span className={styles.sessLabel}>{s.label}</span>
                <span className={styles.sessDur}>{s.duration_min} min</span>
              </div>
              <div className={styles.sessMeta}>
                <span>{s.date}</span>
                <span>{s.session_type}</span>
                <span style={{color:energyColor(s.energy_level)}}>⚡ {s.energy_level}</span>
                <span>{s.focus_quality}</span>
                {s.goals_met && <span style={{color:'var(--sage)'}}>✅ Goals Met</span>}
              </div>
              {s.notes && <div className={styles.sessNotes}>{s.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
