import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Search, Users, Plus, X, Loader2, UserPlus, Hash, Globe, Lock, Layout
} from 'lucide-react'
import s from './Communities.module.css'
import communityTemplates from '../data/communityTemplates'
import TemplatePicker from '../components/community/TemplatePicker'
import { imageUrl } from '../lib/api'

const API = import.meta.env.VITE_API_URL || '/api'

async function apiJson(res) {
  if (!res.ok) {
    const text = await res.text()
    let msg
    try { msg = JSON.parse(text).error || text } catch { msg = text.slice(0, 300) }
    throw new Error(msg || `Request failed (${res.status})`)
  }
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(text.slice(0, 300)) }
}

async function apiGet(path) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + session.access_token }
  })
  return apiJson(res)
}

async function apiPost(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify(body)
  })
  return apiJson(res)
}

function formatDate(iso) {
  if (!iso) return ''
  const normalized = iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('+') ? '' : 'Z')
  const d = new Date(normalized)
  const now = new Date()
  const diff = now - d
  if (diff < 86400000) return 'Today'
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago'
  return d.toLocaleDateString()
}

export default function Communities() {
  const navigate = useNavigate()
  const [myCommunities, setMyCommunities] = useState([])
  const [publicCommunities, setPublicCommunities] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createVisibility, setCreateVisibility] = useState('public')
  const [createJoinType, setCreateJoinType] = useState('anyone')
  const [creating, setCreating] = useState(false)
  const [avatarErrors, setAvatarErrors] = useState({})

  const fetchCommunities = useCallback(async () => {
    try {
      const data = await apiGet(`/communities?search=${encodeURIComponent(searchQuery)}&sort=members`)
      setMyCommunities(data.mine || [])
      setPublicCommunities(data.communities || [])
    } catch {}
    setLoading(false)
  }, [searchQuery])

  useEffect(() => { fetchCommunities() }, [fetchCommunities])

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return
    setJoining(true)
    setJoinError('')
    try {
      const data = await apiPost('/communities/join-by-code', { code: joinCode.trim() })
      if (data.community) navigate('/communities/' + data.community.id)
      else if (data.requires_approval) setJoinError('Join request sent for approval')
      else setJoinError(data.error || 'Failed to join')
    } catch (e) {
      setJoinError(e.message || 'Failed to join')
    }
    setJoining(false)
  }

  const handleCreate = async () => {
    if (!createName.trim()) return
    setCreating(true)
    try {
      const data = await apiPost('/communities', {
        name: createName.trim(),
        description: createDesc.trim(),
        visibility: createVisibility,
        join_type: createJoinType,
      })
      if (data.id) navigate('/communities/' + data.id)
    } catch {}
    setCreating(false)
  }

  const handleCreateFromTemplate = async () => {
    if (!createName.trim() || !selectedTemplate) return
    setCreating(true)
    try {
      const data = await apiPost('/communities/from-template', {
        templateId: selectedTemplate.id,
        name: createName.trim(),
        description: createDesc.trim(),
      })
      if (data.id) navigate('/communities/' + data.id)
    } catch {}
    setCreating(false)
  }

  const handleSelectTemplate = (tmpl) => {
    setSelectedTemplate(tmpl)
    setShowTemplates(false)
    setCreateVisibility(tmpl.defaults.type === 'private' ? 'private' : 'public')
    setCreateJoinType(tmpl.defaults.settings.require_approval ? 'approval' : 'anyone')
  }

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
          <button className={s.joinBtn} onClick={handleJoinByCode} disabled={!joinCode.trim() || joining}>
            {joining ? <Loader2 size={14} className={s.spinner} /> : <UserPlus size={14} strokeWidth={1.5} />}
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

      {loading ? (
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
                        {!avatarErrors[c.id] && c.avatar_url ? <img key={c.avatar_url} src={imageUrl(c.avatar_url)} onError={() => setAvatarErrors(p => ({...p, [c.id]: true}))} alt="" /> : <Users size={20} />}
                      </div>
                      <div className={s.cardVisibility}>
                        {c.visibility === 'private' ? <Lock size={12} /> : <Globe size={12} />}
                      </div>
                    </div>
                    <h3 className={s.cardName}>{c.name}</h3>
                    <p className={s.cardDesc}>{c.description}</p>
                    <div className={s.cardMeta}>
                      <span>{c.member_count || 0} members</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={s.section}>
            <h2 className={s.sectionTitle}>{searchQuery ? 'Search Results' : 'Discover Communities'}</h2>
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
                        {!avatarErrors[c.id] && c.avatar_url ? <img key={c.avatar_url} src={imageUrl(c.avatar_url)} onError={() => setAvatarErrors(p => ({...p, [c.id]: true}))} alt="" /> : <Users size={20} />}
                      </div>
                      <div className={s.cardVisibility}>
                        {c.visibility === 'private' ? <Lock size={12} /> : <Globe size={12} />}
                      </div>
                    </div>
                    <h3 className={s.cardName}>{c.name}</h3>
                    <p className={s.cardDesc}>{c.description}</p>
                    <div className={s.cardMeta}>
                      <span>{c.member_count || 0} members</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {showCreate && (
        <div className={s.modalOverlay} onClick={() => {
          if (!creating) { setShowCreate(false); setShowTemplates(false); setSelectedTemplate(null) }
        }}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
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
                </div>
                <div className={s.modalFooter}>
                  <button className={s.cancelBtn} onClick={() => { setShowCreate(false); setSelectedTemplate(null) }} disabled={creating}>Cancel</button>
                  <button className={s.submitBtn} onClick={selectedTemplate ? handleCreateFromTemplate : handleCreate} disabled={!createName.trim() || creating}>
                    {creating ? 'Creating...' : selectedTemplate ? 'Create from Template' : 'Create Community'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
