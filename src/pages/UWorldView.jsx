import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { FolderOpen } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'
import EmptyState from '../components/EmptyState'
import { getSubjectColor, getSubjectName } from '../lib/subjectColors'
import styles from './Page.module.css'

function getGrade(pct) {
  if (pct >= 80) return 'Excellent'
  if (pct >= 65) return 'Good'
  if (pct >= 50) return 'Average'
  return 'Needs Improvement'
}

const SUBJECTS = [
  { id: '', name: 'None' },
  { id: 'cardiology', name: 'Cardiology' },
  { id: 'respiratory', name: 'Respiratory' },
  { id: 'gastroenterology', name: 'Gastroenterology' },
  { id: 'nephrology', name: 'Nephrology' },
  { id: 'neurology', name: 'Neurology' },
  { id: 'endocrinology', name: 'Endocrinology' },
  { id: 'infectious', name: 'Infectious Disease' },
  { id: 'hematology', name: 'Hematology' },
  { id: 'oncology', name: 'Oncology' },
  { id: 'rheumatology', name: 'Rheumatology' },
  { id: 'dermatology', name: 'Dermatology' },
  { id: 'psychiatry', name: 'Psychiatry' },
  { id: 'obgyn', name: 'Obstetrics & Gynecology' },
  { id: 'pediatrics', name: 'Pediatrics' },
  { id: 'emergency', name: 'Emergency Medicine' },
  { id: 'mixed', name: 'Mixed' },
  { id: 'self_assessment', name: 'Self Assessment' },
  { id: 'other', name: 'Other' },
]

export default function UWorldView({ onActivity }) {
  const { user } = useAuth()
  const [blocks, setBlocks] = useState([])
  const [form, setForm] = useState({ block_name: '', total_questions: 40, correct: 0, mode: 'Tutor', subject_id: '', time_minutes: '', notes: '' })
  const [view, setView] = useState('blocks')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const { data, error } = await supabase.from('uworld_blocks').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (error) console.error('Error loading blocks:', error)
      setBlocks(data || [])
    } catch (err) {
      console.error('loadData error:', err)
    }
    setLoading(false)
  }

  async function addBlock() {
    if (!form.block_name) return
    try {
      const pct = form.total_questions > 0 ? Math.round((form.correct / form.total_questions) * 100) : 0
      const grade = getGrade(pct)
      const today = new Date().toISOString().split('T')[0]

      const { data, error } = await supabase.from('uworld_blocks').insert({
        user_id: user.id,
        block_name: form.block_name,
        total_questions: form.total_questions,
        correct: form.correct,
        percent_correct: pct,
        grade: grade,
        mode: form.mode,
        subject_id: form.subject_id || null,
        time_minutes: form.time_minutes ? parseInt(form.time_minutes) : 0,
        notes: form.notes,
        date_completed: today,
      }).select()

      if (error) {
        console.error('Error adding block:', error)
        alert('Error logging block: ' + error.message)
        return
      }

      if (onActivity && data?.[0]) {
        await onActivity({
          module: 'UWorld',
          action: 'block_logged',
          entity_id: data[0].id,
          summary: `Completed UWorld block "${form.block_name}" · ${pct}% · ${form.subject_id ? getSubjectName(form.subject_id) : 'No subject'}`,
          metadata: JSON.stringify({ block_name: form.block_name, score: pct, subject_id: form.subject_id }),
        })
      }

      setForm({ block_name: '', total_questions: 40, correct: 0, mode: 'Tutor', subject_id: '', time_minutes: '', notes: '' })
      setView('blocks')
      loadData()
    } catch (err) {
      console.error('addBlock error:', err)
    }
  }

  const avg = blocks.length ? Math.round(blocks.reduce((s, b) => s + Number(b.percent_correct || 0), 0) / blocks.length) : 0
  const gradeColor = g => g === 'Excellent' ? 'var(--emerald)' : g === 'Good' ? 'var(--blue)' : g === 'Average' ? 'var(--amber)' : 'var(--red)'

  if (loading) return <LoadingScreen fullPage={false} message="Loading UWorld..." />

  return (
    <div>
      <div className={styles.header} style={{ marginBottom: 16 }}>
        <h2 className={styles.title} style={{ fontSize: 'clamp(20px, 3vw, 28px)' }}>UWorld Tracker</h2>
        <p className={styles.sub}>{blocks.length} blocks logged · Average: {avg}%</p>
      </div>

      <div className={styles.tabs}>
        {[['blocks', 'Question Blocks'], ['add', '+ Log Block']].map(([v, l]) => (
          <button key={v} className={`${styles.tab} ${view === v ? styles.tabActive : ''}`} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>

      {view === 'add' ? (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Log Question Block</h3>
          <div className={styles.field}><label>Block Name</label><input value={form.block_name} onChange={e => setForm({ ...form, block_name: e.target.value })} placeholder="e.g. Cardiology Block 1" /></div>
          <div className={styles.field}><label>Subject</label>
            <select value={form.subject_id} onChange={e => setForm({ ...form, subject_id: e.target.value })}>
              {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}><label>Total Questions</label><input type="number" value={form.total_questions} onChange={e => setForm({ ...form, total_questions: +e.target.value })} /></div>
            <div className={styles.field}><label>Correct</label><input type="number" value={form.correct} onChange={e => setForm({ ...form, correct: +e.target.value })} /></div>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}><label>Mode</label>
              <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
                {['Tutor', 'Timed', 'Custom'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className={styles.field}><label>Time (min)</label><input type="number" value={form.time_minutes} onChange={e => setForm({ ...form, time_minutes: e.target.value })} placeholder="Optional" /></div>
          </div>
          <div className={styles.field}><label>Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Weak areas, patterns noticed..." /></div>
          <div className={styles.previewScore}>
            Predicted score: <strong style={{ color: 'var(--blue)' }}>{form.total_questions > 0 ? Math.round(form.correct / form.total_questions * 100) : 0}%</strong>
          </div>
          <button className={styles.primaryBtn} onClick={addBlock}>Log Block</button>
        </div>
      ) : (
        <div className={styles.cardList}>
          {blocks.length === 0 && (
            <EmptyState icon={FolderOpen} message="No blocks logged yet. Log your first UWorld block!" action="+ Log Block" onAction={() => setView('add')} />
          )}
          {blocks.map(b => {
            const pct = b.percent_correct || (b.total_questions > 0 ? Math.round((b.correct / b.total_questions) * 100) : 0)
            const grade = b.grade || getGrade(pct)
            return (
              <div key={b.id} className={styles.uwCard}>
                <div className={styles.uwTop}>
                  <span className={styles.uwName}>{b.block_name}</span>
                  <span className={styles.uwGrade} style={{ color: gradeColor(grade) }}>{grade}</span>
                </div>
                {b.subject_id && (
                  <div style={{ fontSize: 12, color: getSubjectColor(b.subject_id), fontWeight: 600, marginBottom: 4 }}>
                    {getSubjectName(b.subject_id)}
                  </div>
                )}
                <div className={styles.uwScore}>{pct}%</div>
                <div className={styles.progBar}><div className={styles.progFill} style={{ width: `${pct}%`, background: gradeColor(grade) }} /></div>
                <div className={styles.uwMeta}>
                  <span>{b.correct}/{b.total_questions} correct</span>
                  <span>{b.mode}</span>
                  {b.time_minutes > 0 && <span>{b.time_minutes} min</span>}
                  <span>{b.date_completed || b.created_at?.split('T')[0]}</span>
                </div>
                {b.notes && <div className={styles.uwNotes}>{b.notes}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
