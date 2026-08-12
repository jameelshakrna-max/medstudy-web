import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { Trash2, Star, Plus, X, Search, BookOpen, AlertCircle } from 'lucide-react'
import { EmptyState, Badge, Button, Input } from '../components/ui'
import LoadingScreen from '../components/LoadingScreen'
import { resolveTopicStatus, aggregateStatus, statusLabel, statusTone } from '../lib/curriculumStatus'
import pageStyles from './Page.module.css'
import styles from './Curriculum.module.css'

const STATUS_FILTERS = ['all', 'not_started', 'in_progress', 'reviewing', 'complete']
const TOPIC_STATUS_VALUES = ['Not Started', 'In Progress', 'Reviewing', 'Complete']

export default function Curriculum() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [view, setView] = useState('systems')
  const [showAdd, setShowAdd] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [sysForm, setSysForm] = useState({ name: '', high_yield: false })
  const [subForm, setSubForm] = useState({ name: '', system_id: '', high_yield: false, difficulty: 'Medium' })
  const [topForm, setTopForm] = useState({ name: '', subject_id: '', high_yield: false, difficulty: 'Medium' })

  const { data: systems = [], isLoading: systemsLoading, isError: systemsError, refetch: refetchSystems } = useQuery({
    queryKey: queryKeys.curriculum.systems(),
    queryFn: () => supabase.from('curriculum_systems').select('*').eq('user_id', user.id).order('name').then(d => Array.isArray(d.data) ? d.data : []),
    enabled: !!user,
    staleTime: 15000,
  })

  const { data: subjects = [], isLoading: subjectsLoading, isError: subjectsError, refetch: refetchSubjects } = useQuery({
    queryKey: queryKeys.curriculum.subjects(),
    queryFn: () => supabase.from('curriculum_subjects').select('*').eq('user_id', user.id).order('name').then(d => Array.isArray(d.data) ? d.data : []),
    enabled: !!user,
    staleTime: 15000,
  })

  const { data: topics = [], isLoading: topicsLoading, isError: topicsError, refetch: refetchTopics } = useQuery({
    queryKey: queryKeys.curriculum.topics(200),
    queryFn: () => supabase.from('curriculum_topics').select('*').eq('user_id', user.id).order('name').limit(200).then(d => Array.isArray(d.data) ? d.data : []),
    enabled: !!user,
    staleTime: 15000,
  })

  async function addSystem() {
    if (!sysForm.name.trim()) return
    const { data, error } = await supabase.from('curriculum_systems').insert({
      user_id: user.id,
      name: sysForm.name.trim(),
      high_yield: sysForm.high_yield,
      status: 'Not Started',
      priority: 1,
    }).select()
    if (error) { alert('Error: ' + error.message); return }
    setSysForm({ name: '', high_yield: false })
    setShowAdd(false)
    queryClient.invalidateQueries({ queryKey: queryKeys.curriculum.all })
  }

  async function addSubject() {
    if (!subForm.name.trim() || !subForm.system_id) return
    const { data, error } = await supabase.from('curriculum_subjects').insert({
      user_id: user.id,
      name: subForm.name.trim(),
      system_id: subForm.system_id,
      high_yield: subForm.high_yield,
      difficulty: subForm.difficulty,
      status: 'Not Started',
    }).select()
    if (error) { alert('Error: ' + error.message); return }
    setSubForm({ name: '', system_id: '', high_yield: false, difficulty: 'Medium' })
    setShowAdd(false)
    queryClient.invalidateQueries({ queryKey: queryKeys.curriculum.all })
  }

  async function addTopic() {
    if (!topForm.name.trim() || !topForm.subject_id) return
    const { data, error } = await supabase.from('curriculum_topics').insert({
      user_id: user.id,
      name: topForm.name.trim(),
      subject_id: topForm.subject_id,
      high_yield: topForm.high_yield,
      difficulty: topForm.difficulty,
      status: 'Not Started',
      completion_pct: 0,
      confidence: 0,
    }).select()
    if (error) { alert('Error: ' + error.message); return }
    setTopForm({ name: '', subject_id: '', high_yield: false, difficulty: 'Medium' })
    setShowAdd(false)
    queryClient.invalidateQueries({ queryKey: queryKeys.curriculum.all })
  }

  async function deleteItem(table, id) {
    if (!confirm('Delete this item?')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    queryClient.invalidateQueries({ queryKey: queryKeys.curriculum.all })
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
      queryClient.invalidateQueries({ queryKey: queryKeys.curriculum.all })
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

  function getSubjectCompletion(subjectId) {
    const subjectTopics = topics.filter(t => t.subject_id === subjectId)
    if (subjectTopics.length === 0) return 0
    const total = subjectTopics.reduce((sum, t) => sum + (t.completion_pct || 0), 0)
    return Math.round(total / subjectTopics.length)
  }

  function retryAll() {
    refetchSystems()
    refetchSubjects()
    refetchTopics()
  }

  if (systemsLoading) return <LoadingScreen fullPage={false} message="Loading curriculum..." />

  if (systemsError || subjectsError || topicsError) {
    return (
      <div className={pageStyles.page}>
        <div className={pageStyles.header}>
          <h1 className={pageStyles.title}>Curriculum</h1>
          <p className={pageStyles.sub}>Your complete medical curriculum — add, organize, and track progress.</p>
        </div>
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load your curriculum"
          description="Something went wrong while loading your curriculum. Check your connection and try again."
          action={<Button onClick={retryAll}>Retry</Button>}
        />
      </div>
    )
  }

  const filteredTopics = topics.filter(t => {
    const matchesStatus = statusFilter === 'all' || resolveTopicStatus(t) === statusFilter
    const subject = subjects.find(s => s.id === t.subject_id)
    const query = search.trim().toLowerCase()
    const matchesSearch = !query
      || t.name.toLowerCase().includes(query)
      || (subject && subject.name.toLowerCase().includes(query))
    return matchesStatus && matchesSearch
  })

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <h1 className={pageStyles.title}>Curriculum</h1>
        <p className={pageStyles.sub}>Your complete medical curriculum — add, organize, and track progress.</p>
      </div>

      <div className={pageStyles.tabs}>
        {['systems', 'subjects', 'topics'].map(v => (
          <button key={v} className={`${pageStyles.tab} ${view === v ? pageStyles.tabActive : ''}`} onClick={() => { setView(v); setShowAdd(false) }}>
            {v === 'systems' ? 'Systems' : v === 'subjects' ? 'Subjects' : 'Topics'}
          </button>
        ))}
        <button className={`${pageStyles.tab} ${styles.addBtn}`} onClick={() => setShowAdd(!showAdd)} style={{ marginLeft: 'auto' }}>
          {showAdd ? <><X size={14} strokeWidth={2} /> Close</> : <><Plus size={14} strokeWidth={2} /> Add New</>}
        </button>
      </div>

      {/* ADD FORMS */}
      {showAdd && view === 'systems' && (
        <div className={pageStyles.formCard}>
          <h3 className={pageStyles.formTitle}>Add New System</h3>
          <div className={pageStyles.field}>
            <label htmlFor="system-name">System Name</label>
            <input id="system-name" value={sysForm.name} onChange={e => setSysForm({ ...sysForm, name: e.target.value })} placeholder="e.g. Cardiovascular System" />
          </div>
          <label className={pageStyles.checkRow}><input type="checkbox" checked={sysForm.high_yield} onChange={e => setSysForm({ ...sysForm, high_yield: e.target.checked })} /> <Star size={14} strokeWidth={1.5} /> High Yield</label>
          <button className={pageStyles.primaryBtn} onClick={addSystem}>Add System</button>
        </div>
      )}

      {showAdd && view === 'subjects' && (
        <div className={pageStyles.formCard}>
          <h3 className={pageStyles.formTitle}>Add New Subject</h3>
          <div className={pageStyles.field}>
            <label htmlFor="subject-system">Parent System</label>
            <select id="subject-system" value={subForm.system_id} onChange={e => setSubForm({ ...subForm, system_id: e.target.value })}>
              <option value="">Select system...</option>
              {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className={pageStyles.field}>
            <label htmlFor="subject-name">Subject Name</label>
            <input id="subject-name" value={subForm.name} onChange={e => setSubForm({ ...subForm, name: e.target.value })} placeholder="e.g. Cardiac Pharmacology" />
          </div>
          <div className={pageStyles.row2}>
            <div className={pageStyles.field}>
              <label htmlFor="subject-difficulty">Difficulty</label>
              <select id="subject-difficulty" value={subForm.difficulty} onChange={e => setSubForm({ ...subForm, difficulty: e.target.value })}>
                {['Easy', 'Medium', 'Hard'].map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '14px' }}>
              <label className={pageStyles.checkRow}><input type="checkbox" checked={subForm.high_yield} onChange={e => setSubForm({ ...subForm, high_yield: e.target.checked })} /> <Star size={14} strokeWidth={1.5} /> High Yield</label>
            </div>
          </div>
          <button className={pageStyles.primaryBtn} onClick={addSubject}>Add Subject</button>
        </div>
      )}

      {showAdd && view === 'topics' && (
        <div className={pageStyles.formCard}>
          <h3 className={pageStyles.formTitle}>Add New Topic</h3>
          <div className={pageStyles.field}>
            <label htmlFor="topic-subject">Parent Subject</label>
            <select id="topic-subject" value={topForm.subject_id} onChange={e => setTopForm({ ...topForm, subject_id: e.target.value })}>
              <option value="">Select subject...</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className={pageStyles.field}>
            <label htmlFor="topic-name">Topic Name</label>
            <input id="topic-name" value={topForm.name} onChange={e => setTopForm({ ...topForm, name: e.target.value })} placeholder="e.g. Atrial Fibrillation" />
          </div>
          <div className={pageStyles.row2}>
            <div className={pageStyles.field}>
              <label htmlFor="topic-difficulty">Difficulty</label>
              <select id="topic-difficulty" value={topForm.difficulty} onChange={e => setTopForm({ ...topForm, difficulty: e.target.value })}>
                {['Easy', 'Medium', 'Hard'].map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '14px' }}>
              <label className={pageStyles.checkRow}><input type="checkbox" checked={topForm.high_yield} onChange={e => setTopForm({ ...topForm, high_yield: e.target.checked })} /> ⭐ High Yield</label>
            </div>
          </div>
          <button className={pageStyles.primaryBtn} onClick={addTopic}>Add Topic</button>
        </div>
      )}

      {/* SYSTEMS VIEW */}
      {view === 'systems' && (
        <div className={pageStyles.grid}>
          {systems.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No content yet"
              description="Click “+ Add New” to create your first system."
              action={<Button onClick={() => setShowAdd(true)}>Add New System</Button>}
            />
          ) : (
            systems.map(s => {
              const comp = getSystemCompletion(s.id)
              const sysTopics = topics.filter(t => {
                const subject = subjects.find(x => x.id === t.subject_id)
                return subject && subject.system_id === s.id
              })
              const agg = aggregateStatus(sysTopics)
              const tone = statusTone(agg)
              return (
                <div key={s.id} className={pageStyles.card} style={{ '--c': tone.color }}>
                  <div className={pageStyles.cardTop}>
                    <span className={pageStyles.cardName}>{s.name}</span>
                    <div className={styles.cardActions}>
                      {s.high_yield && <span className={styles.hyBadge}>⭐ HY</span>}
                      <button className={styles.deleteBtn} onClick={() => deleteItem('curriculum_systems', s.id)} aria-label={`Delete system ${s.name}`} title="Delete"><Trash2 size={14} strokeWidth={1.5} /></button>
                    </div>
                  </div>
                  <div className={styles.chipRow}>
                    <Badge tone={tone.badge} size="sm">{statusLabel(agg)}</Badge>
                  </div>
                  <div className={pageStyles.progBar}><div className={pageStyles.progFill} style={{ width: `${comp}%`, background: tone.color }} /></div>
                  <div className={pageStyles.progNum}>{comp}% complete · {subjects.filter(sub => sub.system_id === s.id).length} subjects</div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* SUBJECTS VIEW */}
      {view === 'subjects' && (
        <div className={pageStyles.grid}>
          {subjects.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No content yet"
              description="Click “+ Add New” to create your first subject."
              action={<Button onClick={() => setShowAdd(true)}>Add New Subject</Button>}
            />
          ) : (
            subjects.map(s => {
              const parentSystem = systems.find(sys => sys.id === s.system_id)
              const subjectTopics = topics.filter(t => t.subject_id === s.id)
              const comp = getSubjectCompletion(s.id)
              const agg = aggregateStatus(subjectTopics)
              const tone = statusTone(agg)
              return (
                <div key={s.id} className={pageStyles.card} style={{ '--c': tone.color }}>
                  <div className={pageStyles.cardTop}>
                    <span className={pageStyles.cardName}>{s.name}</span>
                    <div className={styles.cardActions}>
                      {s.high_yield && <span className={styles.hyBadge}>⭐ HY</span>}
                      <button className={styles.deleteBtn} onClick={() => deleteItem('curriculum_subjects', s.id)} aria-label={`Delete subject ${s.name}`} title="Delete"><Trash2 size={14} strokeWidth={1.5} /></button>
                    </div>
                  </div>
                  <div className={styles.chipRow}>
                    <Badge tone={tone.badge} size="sm">{statusLabel(agg)}</Badge>
                  </div>
                  <div className={pageStyles.cardStatus}>{parentSystem ? parentSystem.name : ''} · {s.difficulty || '—'}</div>
                  <div className={pageStyles.progBar}><div className={pageStyles.progFill} style={{ width: `${comp}%`, background: tone.color }} /></div>
                  <div className={pageStyles.progNum}>{comp}% · {subjectTopics.length} topics</div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* TOPICS VIEW */}
      {view === 'topics' && (
        <>
          {topics.length > 0 && (
            <div className={styles.controls}>
              <div className={styles.filters} role="group" aria-label="Filter topics by status">
                {STATUS_FILTERS.map(f => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={statusFilter === f}
                    className={styles.filterBtn}
                    onClick={() => setStatusFilter(f)}
                  >
                    {f === 'all' ? 'All' : statusLabel(f)}
                  </button>
                ))}
              </div>
              <Input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search topics or subjects..."
                aria-label="Search topics"
                className={styles.search}
              />
            </div>
          )}
          {topics.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No content yet"
              description="Click “+ Add New” to create your first topic."
              action={<Button onClick={() => setShowAdd(true)}>Add New Topic</Button>}
            />
          ) : filteredTopics.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No topics match your filter"
              description="Try a different status or search term."
            />
          ) : (
            <div className={styles.topicGrid}>
              {filteredTopics.map(t => {
                const parentSubject = subjects.find(s => s.id === t.subject_id)
                const status = resolveTopicStatus(t)
                const tone = statusTone(status)
                return (
                  <article key={t.id} className={styles.topicCard}>
                    <div className={styles.topicTop}>
                      <div className={styles.topicHeadings}>
                        <h3 className={styles.topicName}>{t.name}</h3>
                        <p className={styles.topicMeta}>{parentSubject ? parentSubject.name : '—'}{t.difficulty ? ` · ${t.difficulty}` : ''}</p>
                      </div>
                      <button className={styles.deleteBtn} onClick={() => deleteItem('curriculum_topics', t.id)} aria-label={`Delete topic ${t.name}`} title="Delete"><Trash2 size={15} strokeWidth={1.5} /></button>
                    </div>
                    <div className={styles.topicRow}>
                      <Badge tone={tone.badge} size="sm">{statusLabel(status)}</Badge>
                      {t.high_yield && <span className={styles.hyBadge}>⭐ HY</span>}
                    </div>
                    <div className={styles.completionRow}>
                      <label className={styles.selectLabel} htmlFor={`topic-status-${t.id}`}>Status</label>
                      <select
                        id={`topic-status-${t.id}`}
                        className={styles.statusSel}
                        value={t.status}
                        onChange={e => updateTopicStatus(t.id, e.target.value)}
                      >
                        {TOPIC_STATUS_VALUES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className={styles.progBar}><div className={styles.progFill} style={{ width: `${t.completion_pct || 0}%`, background: tone.color }} /></div>
                    <div className={styles.progNum}>{t.completion_pct || 0}% complete</div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
