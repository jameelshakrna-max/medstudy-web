import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { FolderOpen, Plus, Minus, Trash2 } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'
import EmptyState from '../components/EmptyState'
import { getSubjectColor, getSubjectName } from '../lib/subjectColors'
import styles from './Page.module.css'

const MASTERY_LEVELS = ['Started', 'Reviewing', 'Mastered']
const MASTERY_COLORS = { Started: 'var(--amber)', Reviewing: 'var(--blue)', Mastered: 'var(--emerald)' }

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
  { id: 'mixed', name: 'Mixed' },
  { id: 'other', name: 'Other' },
]

export default function LocalBoardView({ onActivity }) {
  const { user } = useAuth()
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ case_name: '', subject_id: '', past_paper_year: '', repetition_count: 0, mastery_level: 'Started', notes: '' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const { data, error } = await supabase.from('local_board_cases').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (error) console.error('Error loading cases:', error)
      setCases(data || [])
    } catch (err) {
      console.error('loadData error:', err)
    }
    setLoading(false)
  }

  async function addCase() {
    if (!form.case_name.trim()) return
    try {
      const { data, error } = await supabase.from('local_board_cases').insert({
        user_id: user.id,
        case_name: form.case_name.trim(),
        subject_id: form.subject_id || null,
        past_paper_year: form.past_paper_year || null,
        repetition_count: form.repetition_count || 0,
        mastery_level: form.mastery_level || 'Started',
        notes: form.notes || null,
      }).select()

      if (error) { alert('Error: ' + error.message); return }

      if (onActivity && data?.[0]) {
        await onActivity({
          module: 'Local Board',
          action: 'case_added',
          entity_id: data[0].id,
          summary: `Added case "${form.case_name}" · ${form.subject_id ? getSubjectName(form.subject_id) : 'No subject'}`,
          metadata: JSON.stringify({ case_name: form.case_name, subject_id: form.subject_id }),
        })
      }

      setForm({ case_name: '', subject_id: '', past_paper_year: '', repetition_count: 0, mastery_level: 'Started', notes: '' })
      setShowAdd(false)
      loadData()
    } catch (err) {
      console.error('addCase error:', err)
    }
  }

  async function updateCase(id, updates) {
    const { error } = await supabase.from('local_board_cases').update(updates).eq('id', id)
    if (error) { console.error('Error updating case:', error); return }
    setCases(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))

    if (onActivity && updates.mastery_level) {
      const c = cases.find(cc => cc.id === id)
      await onActivity({
        module: 'Local Board',
        action: 'mastery_changed',
        entity_id: id,
        summary: `Case "${c?.case_name}" mastery: ${c?.mastery_level} → ${updates.mastery_level}`,
        metadata: JSON.stringify({ case_id: id, from: c?.mastery_level, to: updates.mastery_level }),
      })
    }
  }

  async function deleteCase(id) {
    if (!confirm('Delete this case?')) return
    const { error } = await supabase.from('local_board_cases').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    setCases(prev => prev.filter(c => c.id !== id))
  }

  if (loading) return <LoadingScreen fullPage={false} message="Loading cases..." />

  return (
    <div>
      <div className={styles.header} style={{ marginBottom: 16 }}>
        <h2 className={styles.title} style={{ fontSize: 'clamp(20px, 3vw, 28px)' }}>Local Board Tracker</h2>
        <p className={styles.sub}>{cases.length} clinical cases logged</p>
      </div>

      <div className={styles.tabs}>
        {[['cases', 'Clinical Cases'], ['add', '+ Log Case']].map(([v, l]) => (
          <button key={v} className={`${styles.tab} ${(v === 'add') === showAdd ? styles.tabActive : v === 'cases' && !showAdd ? styles.tabActive : ''}`}
            onClick={() => v === 'add' ? setShowAdd(!showAdd) : setShowAdd(false)}>
            {v === 'add' && showAdd ? <><Plus size={14} strokeWidth={2} /> Close</> : l}
          </button>
        ))}
      </div>

      {showAdd && (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Log Clinical Case</h3>
          <div className={styles.field}><label>Case Name</label><input value={form.case_name} onChange={e => setForm({ ...form, case_name: e.target.value })} placeholder="e.g. Acute Coronary Syndrome" /></div>
          <div className={styles.field}><label>Medical System</label>
            <select value={form.subject_id} onChange={e => setForm({ ...form, subject_id: e.target.value })}>
              {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}><label>Past Paper Year</label><input value={form.past_paper_year} onChange={e => setForm({ ...form, past_paper_year: e.target.value })} placeholder="e.g. 2023" /></div>
            <div className={styles.field}><label>Mastery Level</label>
              <select value={form.mastery_level} onChange={e => setForm({ ...form, mastery_level: e.target.value })}>
                {MASTERY_LEVELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.field}><label>Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Key findings, differentials, management..." /></div>
          <button className={styles.primaryBtn} onClick={addCase}>Log Case</button>
        </div>
      )}

      {cases.length === 0 && !showAdd ? (
        <EmptyState icon={FolderOpen} message="No clinical cases logged yet. Start tracking your Local Board cases!" action="+ Log Case" onAction={() => setShowAdd(true)} />
      ) : (
        <div className={styles.cardList}>
          {cases.map(c => (
            <div key={c.id} className={styles.uwCard}>
              <div className={styles.uwTop}>
                <span className={styles.uwName}>{c.case_name}</span>
                <span className={styles.uwGrade} style={{ color: MASTERY_COLORS[c.mastery_level] || 'var(--mist)' }}>{c.mastery_level}</span>
              </div>
              {c.subject_id && (
                <div style={{ fontSize: 12, color: getSubjectColor(c.subject_id), fontWeight: 600, marginBottom: 4 }}>
                  {getSubjectName(c.subject_id)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card-bg)', borderRadius: 8, padding: '4px 10px', border: '1px solid var(--input-bg)' }}>
                  <span style={{ fontSize: 12, color: 'var(--mist)' }}>Repetitions:</span>
                  <button className={styles.filterBtnSm} onClick={() => updateCase(c.id, { repetition_count: Math.max(0, (c.repetition_count || 0) - 1) })}>
                    <Minus size={12} />
                  </button>
                  <strong style={{ fontSize: 14, color: 'var(--text-primary)', minWidth: 20, textAlign: 'center' }}>{c.repetition_count || 0}</strong>
                  <button className={styles.filterBtnSm} onClick={() => updateCase(c.id, { repetition_count: (c.repetition_count || 0) + 1 })}>
                    <Plus size={12} />
                  </button>
                </div>
                {c.past_paper_year && (
                  <span style={{ fontSize: 12, color: 'var(--mist)', background: 'var(--card-bg)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--input-bg)' }}>
                    {c.past_paper_year}
                  </span>
                )}
                <select value={c.mastery_level}
                  onChange={e => updateCase(c.id, { mastery_level: e.target.value })}
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--input-bg)', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: MASTERY_COLORS[c.mastery_level] || 'var(--mist)', cursor: 'pointer', outline: 'none' }}>
                  {MASTERY_LEVELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {c.notes && <div className={styles.uwNotes}>{c.notes}</div>}
              <button onClick={() => deleteCase(c.id)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, padding: 4, borderRadius: 6, color: 'var(--red)' }}
                onMouseEnter={e => e.target.style.opacity = '1'} onMouseLeave={e => e.target.style.opacity = '0.3'}
                title="Delete"><Trash2 size={14} strokeWidth={1.5} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
