import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { FolderOpen, Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import LoadingScreen from '../components/LoadingScreen'
import EmptyState from '../components/EmptyState'
import ProgressCard from '../components/ProgressCard'
import styles from './Page.module.css'

const STATUSES = ['Not Started', 'In Progress', 'Reviewing', 'Mastered']
const STATUS_COLORS = {
  'Not Started': 'var(--mist)',
  'In Progress': 'var(--blue)',
  Reviewing: 'var(--indigo)',
  Mastered: 'var(--emerald)',
}

export default function MRCPView({ onActivity }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [expandedSystem, setExpandedSystem] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addSystem, setAddSystem] = useState('')
  const [addTopic, setAddTopic] = useState({ name: '', syllabus_id: '' })

  const { data: systems = [], isLoading: systemsLoading } = useQuery({
    queryKey: queryKeys.mrcp.systems(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('mrcp_syllabus').select('*').eq('user_id', user.id).order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!user,
    staleTime: 15000,
  })

  const { data: topics = [], isLoading: topicsLoading } = useQuery({
    queryKey: queryKeys.mrcp.topics(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('mrcp_topics').select('*').eq('user_id', user.id).order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!user,
    staleTime: 15000,
  })

  const addSystemMutation = useMutation({
    mutationFn: async () => {
      if (!addSystem.trim()) return
      const { data, error } = await supabase.from('mrcp_syllabus').insert({
        id: crypto.randomUUID(), user_id: user.id, name: addSystem.trim(), status: 'Not Started',
      }).select()
      if (error) throw error
      return data[0]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mrcp.all })
      setAddSystem('')
      setShowAdd(false)
    },
    onError: (err) => alert('Error: ' + err.message),
  })

  const addTopicMutation = useMutation({
    mutationFn: async () => {
      if (!addTopic.name.trim() || !addTopic.syllabus_id) return
      const { data, error } = await supabase.from('mrcp_topics').insert({
        id: crypto.randomUUID(), user_id: user.id, syllabus_id: addTopic.syllabus_id, name: addTopic.name.trim(),
        status: 'Not Started', confidence: 0, repetitions: 0,
      }).select()
      if (error) throw error
      return data[0]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mrcp.all })
      setAddTopic({ name: '', syllabus_id: '' })
      setShowAdd(false)
    },
    onError: (err) => alert('Error: ' + err.message),
  })

  const updateTopicMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { error } = await supabase.from('mrcp_topics').update(updates).eq('id', id)
      if (error) throw error
      return { id, updates }
    },
    onSuccess: async ({ id, updates }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mrcp.all })

      if (onActivity && updates.status) {
        const topic = topics.find(t => t.id === id)
        await onActivity({
          module: 'MRCP',
          action: 'topic_reviewed',
          entity_id: id,
          summary: `Reviewed MRCP topic "${topic?.name || id}" · Status: ${updates.status} · Confidence: ${updates.confidence ?? topic?.confidence ?? 0}`,
          metadata: JSON.stringify({ topic_id: id, status: updates.status, confidence: updates.confidence }),
        })
      }
    },
    onError: (err) => console.error('Error updating topic:', err),
  })

  function getSystemProgress(systemId) {
    const sysTopics = topics.filter(t => t.syllabus_id === systemId)
    if (!sysTopics.length) return 0
    const completed = sysTopics.filter(t => t.status === 'Mastered').length
    return Math.round((completed / sysTopics.length) * 100)
  }

  const isLoading = systemsLoading || topicsLoading

  if (isLoading) return <LoadingScreen fullPage={false} message="Loading MRCP syllabus..." />

  return (
    <div>
      <div className={styles.header} style={{ marginBottom: 16 }}>
        <h2 className={styles.title} style={{ fontSize: 'clamp(20px, 3vw, 28px)' }}>MRCP Progress</h2>
        <p className={styles.sub}>{systems.length} systems · {topics.length} topics</p>
      </div>

      <div className={styles.tabs}>
        {[['systems', 'Systems'], ['add', '+ Add']].map(([v, l]) => (
          <button key={v} className={`${styles.tab} ${(v === 'add') === showAdd ? styles.tabActive : v === 'systems' && !showAdd ? styles.tabActive : ''}`}
            onClick={() => v === 'add' ? setShowAdd(!showAdd) : setShowAdd(false)}>
            {v === 'add' && showAdd ? <><X size={14} strokeWidth={2} /> Close</> : l}
          </button>
        ))}
      </div>

      {showAdd && (
        <div className={styles.formCard} style={{ marginBottom: 24 }}>
          <h3 className={styles.formTitle}>Add to MRCP Syllabus</h3>
          <div className={styles.field}>
            <label>New System</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={addSystem} onChange={e => setAddSystem(e.target.value)} placeholder="e.g. Cardiology" style={{ flex: 1 }} />
               <button className={styles.tab} style={{ background: 'var(--blueL)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--blue)' }} onClick={() => addSystemMutation.mutate()}>
                <Plus size={14} strokeWidth={2} /> Add
              </button>
            </div>
          </div>
          <div className={styles.field}>
            <label>Parent System</label>
            <select value={addTopic.syllabus_id} onChange={e => setAddTopic({ ...addTopic, syllabus_id: e.target.value })}>
              <option value="">Select system...</option>
              {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>New Topic</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={addTopic.name} onChange={e => setAddTopic({ ...addTopic, name: e.target.value })} placeholder="e.g. Heart Failure" style={{ flex: 1 }} />
               <button className={styles.tab} style={{ background: 'var(--blueL)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--blue)' }} onClick={() => addTopicMutation.mutate()}>
                <Plus size={14} strokeWidth={2} /> Add
              </button>
            </div>
          </div>
        </div>
      )}

      {systems.length === 0 ? (
        <EmptyState icon={FolderOpen} message="No MRCP systems yet. Add your first system and topic above." action="+ Add System" onAction={() => setShowAdd(true)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {systems.map(sys => {
            const sysTopics = topics.filter(t => t.syllabus_id === sys.id)
            const progress = getSystemProgress(sys.id)
            const expanded = expandedSystem === sys.id

            return (
              <ProgressCard key={sys.id} name={sys.name} status={sys.status} progress={progress}
                color={STATUS_COLORS[sys.status] || 'var(--blue)'}
                onClick={() => setExpandedSystem(expanded ? null : sys.id)}>
                <div style={{ fontSize: 12, color: 'var(--mist)', marginTop: 4 }}>
                  {sysTopics.filter(t => t.status === 'Mastered').length}/{sysTopics.length} mastered
                  {expanded ? <ChevronDown size={14} style={{ marginLeft: 6 }} /> : <ChevronRight size={14} style={{ marginLeft: 6 }} />}
                </div>

                {expanded && sysTopics.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sysTopics.map(t => (
                      <div key={t.id} style={{
                        padding: '10px 12px', background: 'var(--input-bg)', borderRadius: 10,
                        border: '1px solid var(--card-border)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{t.name}</span>
                           <select value={t.status}
                            onChange={e => updateTopicMutation.mutate({ id: t.id, updates: { status: e.target.value } })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: STATUS_COLORS[t.status] || 'var(--mist)', outline: 'none' }}>
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--mist)', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>Confidence: <strong>{t.confidence}%</strong></span>
                          <span>Repetitions: <strong>{t.repetitions}</strong></span>
                          {t.last_reviewed && <span>Last: {new Date(t.last_reviewed).toLocaleDateString()}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                           <button className={styles.filterBtnSm}
                            onClick={() => updateTopicMutation.mutate({ id: t.id, updates: { confidence: Math.min(100, (t.confidence || 0) + 10) } })}>
                            + Confidence
                          </button>
                           <button className={styles.filterBtnSm}
                            onClick={() => updateTopicMutation.mutate({ id: t.id, updates: { repetitions: (t.repetitions || 0) + 1, last_reviewed: new Date().toISOString() } })}>
                            + Repetition
                          </button>
                        </div>
                        {t.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic' }}>{t.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {expanded && sysTopics.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--mist)', marginTop: 8, textAlign: 'center' }}>No topics yet. Add topics to track progress.</div>
                )}
              </ProgressCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
