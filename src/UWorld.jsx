import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from './Page.module.css'

export default function UWorld() {
  const [blocks, setBlocks] = useState([])
  const [form, setForm] = useState({ block_name:'', total_questions:40, correct:0, mode:'Tutor', notes:'' })
  const [view, setView] = useState('blocks')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase.from('uworld_blocks').select('*').order('date_completed', { ascending: false })
    setBlocks(data||[])
    setLoading(false)
  }

  async function addBlock() {
    if (!form.block_name) return
    await supabase.from('uworld_blocks').insert({ ...form })
    setForm({ block_name:'', total_questions:40, correct:0, mode:'Tutor', notes:'' })
    loadData()
  }

  const avg = blocks.length ? Math.round(blocks.reduce((s,b) => s + Number(b.percent_correct), 0) / blocks.length) : 0
  const gradeColor = g => g==='Excellent'?'var(--sage)':g==='Good'?'var(--teal)':g==='Average'?'var(--gold)':'var(--coral)'

  if (loading) return <div className={styles.loading}>Loading UWorld...</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>📊 UWorld Tracker</h1>
        <p className={styles.sub}>{blocks.length} blocks logged · Average: {avg}%</p>
      </div>

      <div className={styles.tabs}>
        {[['blocks','Question Blocks'],['add','+ Log Block']].map(([v,l]) => (
          <button key={v} className={`${styles.tab} ${view===v?styles.tabActive:''}`} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>

      {view==='add' ? (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Log Question Block</h3>
          <div className={styles.field}><label>Block Name</label><input value={form.block_name} onChange={e=>setForm({...form,block_name:e.target.value})} placeholder="e.g. Cardiology Block 1" /></div>
          <div className={styles.row2}>
            <div className={styles.field}><label>Total Questions</label><input type="number" value={form.total_questions} onChange={e=>setForm({...form,total_questions:+e.target.value})} /></div>
            <div className={styles.field}><label>Correct</label><input type="number" value={form.correct} onChange={e=>setForm({...form,correct:+e.target.value})} /></div>
          </div>
          <div className={styles.field}><label>Mode</label>
            <select value={form.mode} onChange={e=>setForm({...form,mode:e.target.value})}>
              {['Tutor','Timed','Custom'].map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div className={styles.field}><label>Notes</label><textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Weak areas, patterns noticed..." /></div>
          <div className={styles.previewScore}>
            Predicted score: <strong style={{color:'var(--teal)'}}>{form.total_questions>0?Math.round(form.correct/form.total_questions*100):0}%</strong>
          </div>
          <button className={styles.primaryBtn} onClick={addBlock}>Log Block</button>
        </div>
      ) : (
        <div className={styles.cardList}>
          {blocks.length===0 && <div className={styles.empty}>No blocks logged yet. Log your first UWorld block!</div>}
          {blocks.map(b => (
            <div key={b.id} className={styles.uwCard}>
              <div className={styles.uwTop}>
                <span className={styles.uwName}>{b.block_name}</span>
                <span className={styles.uwGrade} style={{color:gradeColor(b.grade)}}>{b.grade}</span>
              </div>
              <div className={styles.uwScore}>{b.percent_correct}%</div>
              <div className={styles.progBar}><div className={styles.progFill} style={{width:`${b.percent_correct}%`,background:gradeColor(b.grade)}} /></div>
              <div className={styles.uwMeta}>
                <span>{b.correct}/{b.total_questions} correct</span>
                <span>{b.mode}</span>
                <span>{b.date_completed}</span>
              </div>
              {b.notes && <div className={styles.uwNotes}>{b.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
