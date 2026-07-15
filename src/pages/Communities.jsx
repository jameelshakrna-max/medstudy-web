import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Users, Plus, X, Loader2, UserPlus, Hash, Globe, Lock, Layout,
  ChevronDown, BookOpen, Stethoscope, GraduationCap, Brain, Pill, FlaskConical, Heart, Clock
} from 'lucide-react'
import { apiGet, apiPost, imageUrl } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import s from './Communities.module.css'
import communityTemplates from '../data/communityTemplates'
import TemplatePicker from '../components/community/TemplatePicker'
import Modal from '../components/ui/Modal/Modal'

const CATEGORY_CONFIG = {
  general: { label: 'General', icon: BookOpen, color: 'var(--blue)' },
  clinical: { label: 'Clinical', icon: Stethoscope, color: 'var(--emerald)' },
  exam_prep: { label: 'Exam Prep', icon: GraduationCap, color: '#F59E0B' },
  anatomy: { label: 'Anatomy', icon: Brain, color: '#8B5CF6' },
  pharmacology: { label: 'Pharmacology', icon: Pill, color: '#EC4899' },
  pathology: { label: 'Pathology', icon: FlaskConical, color: '#EF4444' },
  research: { label: 'Research', icon: FlaskConical, color: '#06B6D4' },
  wellness: { label: 'Wellness', icon: Heart, color: '#F97316' },
}
const SORT_OPTIONS = [
  { value: 'members', label: 'Most Members' },
  { value: 'created', label: 'Newest' },
  { value: 'activity', label: 'Most Active' },
]

export default function Communities() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createVisibility, setCreateVisibility] = useState('public')
  const [createJoinType, setCreateJoinType] = useState('anyone')
  const [createCategory, setCreateCategory] = useState('general')
  const [avatarErrors, setAvatarErrors] = useState({})
  const [activeCategory, setActiveCategory] = useState('all')
  const [sortBy, setSortBy] = useState('members')

  const { data = {}, isLoading } = useQuery({
    queryKey: queryKeys.communities.list(sortBy, searchQuery, activeCategory),
    queryFn: async () => {
      const params = new URLSearchParams({ sort: sortBy })
      if (searchQuery) params.set('search', searchQuery)
      if (activeCategory !== 'all') params.set('category', activeCategory)
      return apiGet(`/communities?${params}`)
    },
    staleTime: 15_000,
  })

  const myCommunities = data.mine || []
  const publicCommunities = data.communities || []
  const categoryCounts = data.categories || []

  const joinMutation = useMutation({
    mutationFn: (code) => apiPost('/communities/join-by-code', { code }),
    onSuccess: (result) => {
      if (result.community) {
        queryClient.invalidateQueries({ queryKey: queryKeys.communities.all })
        navigate('/communities/' + result.community.id)
      } else if (result.requires_approval) {
        setJoinError('Join request sent for approval')
      } else {
        setJoinError(result.error || 'Failed to join')
      }
    },
    onError: (err) => setJoinError(err.message || 'Failed to join'),
  })

  const createMutation = useMutation({
    mutationFn: (body) => apiPost('/communities', body),
    onSuccess: (result) => {
      if (result.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.communities.all })
        navigate('/communities/' + result.id)
      }
    },
  })

  const createFromTemplateMutation = useMutation({
    mutationFn: (body) => apiPost('/communities/from-template', body),
    onSuccess: (result) => {
      if (result.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.communities.all })
        navigate('/communities/' + result.id)
      }
    },
  })

  const handleJoinByCode = () => {
    if (!joinCode.trim()) return
    setJoinError('')
    joinMutation.mutate(joinCode.trim())
  }

  const handleCreate = () => {
    if (!createName.trim()) return
    createMutation.mutate({
      name: createName.trim(),
      description: createDesc.trim(),
      visibility: createVisibility,
      join_type: createJoinType,
      category: createCategory,
    })
  }

  const handleCreateFromTemplate = () => {
    if (!createName.trim() || !selectedTemplate) return
    createFromTemplateMutation.mutate({
      templateId: selectedTemplate.id,
      name: createName.trim(),
      description: createDesc.trim(),
    })
  }

  const handleSelectTemplate = (tmpl) => {
    setSelectedTemplate(tmpl)
    setShowTemplates(false)
    setCreateVisibility(tmpl.defaults.type === 'private' ? 'private' : 'public')
    setCreateJoinType(tmpl.defaults.settings.require_approval ? 'approval' : 'anyone')
  }

  const creating = createMutation.isPending || createFromTemplateMutation.isPending

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Communities</h1>
        <button className={s.createBtn} onClick={() => setShowCreate(true)}>
          <Plus size={16} strokeWidth={1.5} />
          Create
        </button>
      </div>

      <div className={s.joinRow}>
        <div className={s.joinWrap}>
          <Hash size={16} strokeWidth={1.5} className={s.joinIcon} />
          <input
            className={s.joinInput}
            type="text"
            placeholder="Enter invite code..."
            value={joinCode}
            onChange={e => { setJoinCode(e.target.value); setJoinError('') }}
            onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
          />
          <button className={s.joinBtn} onClick={handleJoinByCode} disabled={!joinCode.trim() || joinMutation.isPending}>
            {joinMutation.isPending ? <Loader2 size={14} className={s.spinner} /> : <UserPlus size={14} strokeWidth={1.5} />}
            Join
          </button>
        </div>
        {joinError && <span className={s.joinError}>{joinError}</span>}
      </div>

      <div className={s.searchWrap}>
        <Search size={16} strokeWidth={1.5} className={s.searchIcon} />
        <input
          className={s.searchInput}
          type="text"
          placeholder="Search public communities..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && <X size={14} className={s.clearBtn} onClick={() => setSearchQuery('')} />}
      </div>

      <div className={s.filterRow}>
        <div className={s.categoryChips}>
          <button
            className={`${s.categoryChip} ${activeCategory === 'all' ? s.categoryChipActive : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All
          </button>
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon
            const count = categoryCounts.find(c => c.category === key)?.count || 0
            return (
              <button
                key={key}
                className={`${s.categoryChip} ${activeCategory === key ? s.categoryChipActive : ''}`}
                onClick={() => setActiveCategory(key)}
                style={activeCategory === key ? { borderColor: cfg.color, color: cfg.color } : {}}
              >
                <Icon size={13} strokeWidth={1.5} />
                {cfg.label}
                {count > 0 && <span className={s.categoryChipCount}>{count}</span>}
              </button>
            )
          })}
        </div>
        <div className={s.sortWrap}>
          <select className={s.sortSelect} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={14} className={s.sortChevron} />
        </div>
      </div>

      {isLoading ? (
        <div className={s.loading}><Loader2 size={24} className={s.spinner} /> Loading...</div>
      ) : (
        <>
          {myCommunities.length > 0 && (
            <section className={s.section}>
              <h2 className={s.sectionTitle}>Your Communities</h2>
              <div className={s.grid}>
                {myCommunities.map(c => (
                  <div key={c.id} className={s.card} onClick={() => navigate('/communities/' + c.id)}>
                    <div className={s.cardTop}>
                      <div className={s.cardAvatar}>
                        {!avatarErrors[c.id] && c.avatar_url ? <img key={c.avatar_url} src={imageUrl(c.avatar_url)} onError={() => setAvatarErrors(p => ({...p, [c.id]: true}))} alt="" loading="lazy" /> : <Users size={20} />}
                      </div>
                      <div className={s.cardVisibility}>
                        {c.visibility === 'private' ? <Lock size={12} /> : <Globe size={12} />}
                      </div>
                    </div>
                    <h3 className={s.cardName}>{c.name}</h3>
                    <p className={s.cardDesc}>{c.description}</p>
                    <div className={s.cardMeta}>
                      {c.category && c.category !== 'general' && (
                        <span className={s.cardCategory} style={{ color: CATEGORY_CONFIG[c.category]?.color, borderColor: CATEGORY_CONFIG[c.category]?.color }}>
                          {CATEGORY_CONFIG[c.category]?.label || c.category}
                        </span>
                      )}
                      <span>{c.member_count || 0} members</span>
                      {sortBy === 'activity' && c.total_study_hours > 0 && (
                        <span><Clock size={10} /> {Math.round(c.total_study_hours)}h</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={s.section}>
            <h2 className={s.sectionTitle}>
              {searchQuery ? 'Search Results' : activeCategory !== 'all' ? CATEGORY_CONFIG[activeCategory]?.label + ' Communities' : 'Discover Communities'}
            </h2>
            {publicCommunities.length === 0 ? (
              <div className={s.empty}>
                <Users size={40} strokeWidth={1} />
                <p>No communities found</p>
                <button className={s.emptyCreate} onClick={() => setShowCreate(true)}>Create the first community</button>
              </div>
            ) : (
              <div className={s.grid}>
                {publicCommunities.map(c => (
                  <div key={c.id} className={s.card} onClick={() => navigate('/communities/' + c.id)}>
                    <div className={s.cardTop}>
                      <div className={s.cardAvatar}>
                        {!avatarErrors[c.id] && c.avatar_url ? <img key={c.avatar_url} src={imageUrl(c.avatar_url)} onError={() => setAvatarErrors(p => ({...p, [c.id]: true}))} alt="" loading="lazy" /> : <Users size={20} />}
                      </div>
                      <div className={s.cardVisibility}>
                        {c.visibility === 'private' ? <Lock size={12} /> : <Globe size={12} />}
                      </div>
                    </div>
                    <h3 className={s.cardName}>{c.name}</h3>
                    <p className={s.cardDesc}>{c.description}</p>
                    <div className={s.cardMeta}>
                      {c.category && c.category !== 'general' && (
                        <span className={s.cardCategory} style={{ color: CATEGORY_CONFIG[c.category]?.color, borderColor: CATEGORY_CONFIG[c.category]?.color }}>
                          {CATEGORY_CONFIG[c.category]?.label || c.category}
                        </span>
                      )}
                      <span>{c.member_count || 0} members</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <Modal open={showCreate} onOpenChange={(v) => { if (!v && !creating) { setShowCreate(false); setShowTemplates(false); setSelectedTemplate(null) } }} size="md">
        {showTemplates ? (
          <div className={s.modalBody}>
            <TemplatePicker
              onSelect={handleSelectTemplate}
              onBack={() => setShowTemplates(false)}
            />
          </div>
        ) : (
          <>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>Create Community</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!selectedTemplate && (
                  <button
                    onClick={() => setShowTemplates(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', background: 'var(--input-bg)',
                      border: '1px solid var(--card-border)', borderRadius: 8,
                      color: 'var(--blue)', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <Layout size={14} strokeWidth={1.5} />
                    Use Template
                  </button>
                )}
                {!creating && <X size={18} className={s.modalClose} onClick={() => { setShowCreate(false); setSelectedTemplate(null) }} />}
              </div>
            </div>
            <div className={s.modalBody}>
              {selectedTemplate && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', background: 'var(--blueL)',
                  border: '1px solid var(--blue)', borderRadius: 12,
                  marginBottom: 16, fontSize: 13, color: 'var(--blue)',
                }}>
                  <Layout size={16} strokeWidth={1.5} />
                  <span>Template: <strong>{selectedTemplate.name}</strong></span>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', padding: 2 }}
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                </div>
              )}
              {selectedTemplate && (
                <div style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Template settings:</div>
                  <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                    <li>{selectedTemplate.defaults.settings.allow_competitions ? 'Competitions enabled' : 'Competitions disabled'}</li>
                    <li>{selectedTemplate.defaults.settings.require_approval ? 'Requires approval to join' : 'Open join'}</li>
                    <li>{selectedTemplate.defaults.settings.allow_file_sharing ? 'File sharing enabled' : 'File sharing disabled'}</li>
                  </ul>
                </div>
              )}
              {selectedTemplate && (
                <div style={{ fontSize: 13, color: 'var(--mist)', marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Pre-defined rules:</div>
                  <ol style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                    {selectedTemplate.defaults.rules.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ol>
                </div>
              )}
              <div className={s.field}>
                <label>Name *</label>
                <input type="text" placeholder="Community name" value={createName} onChange={e => setCreateName(e.target.value)} disabled={creating} />
              </div>
              <div className={s.field}>
                <label>Description</label>
                <textarea rows={3} placeholder="What is this community about?" value={createDesc} onChange={e => setCreateDesc(e.target.value)} disabled={creating} />
              </div>
              {!selectedTemplate && (
                <div className={s.row2}>
                  <div className={s.field}>
                    <label>Visibility</label>
                    <select value={createVisibility} onChange={e => setCreateVisibility(e.target.value)} disabled={creating}>
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                  <div className={s.field}>
                    <label>Join Type</label>
                    <select value={createJoinType} onChange={e => setCreateJoinType(e.target.value)} disabled={creating}>
                      <option value="anyone">Anyone</option>
                      <option value="approval">Requires Approval</option>
                      <option value="code">Invite Code</option>
                      <option value="invite_only">Invite Only</option>
                    </select>
                  </div>
                </div>
              )}
              {!selectedTemplate && (
                <div className={s.field}>
                  <label>Category</label>
                  <select value={createCategory} onChange={e => setCreateCategory(e.target.value)} disabled={creating}>
                    {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className={s.modalFooter}>
              <button className={s.cancelBtn} onClick={() => { setShowCreate(false); setSelectedTemplate(null) }} disabled={creating}>Cancel</button>
              <button className={s.submitBtn} onClick={selectedTemplate ? handleCreateFromTemplate : handleCreate} disabled={!createName.trim() || creating}>
                {creating ? 'Creating...' : selectedTemplate ? 'Create from Template' : 'Create Community'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
