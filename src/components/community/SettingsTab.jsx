import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Virtuoso } from 'react-virtuoso'
import { apiGet, apiPost, apiPut, apiDelete, formatDate, imageUrl } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import RoleBadge from '../RoleBadge'
import { X, Plus, Loader2, Check, Copy, FileText, Settings, Link, ScrollText, SlidersHorizontal, Trophy, UserPlus, Ban, Clock, AlertTriangle, Users, UserCog, UserMinus, Star, Search, Camera } from 'lucide-react'
import s from '../../pages/CommunityDetail.module.css'

const API = import.meta.env.VITE_API_URL || '/api'

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'exam_prep', label: 'Exam Prep' },
  { value: 'anatomy', label: 'Anatomy' },
  { value: 'pharmacology', label: 'Pharmacology' },
  { value: 'pathology', label: 'Pathology' },
  { value: 'research', label: 'Research' },
  { value: 'wellness', label: 'Wellness' },
]

function RefreshCw({ size, strokeWidth }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  )
}

const ROLE_ORDER = ['admin', 'moderator', 'mentor', 'scholar', 'member']

const ROLE_LABELS = {
  admin: 'Administrator',
  moderator: 'Moderator',
  mentor: 'Mentor',
  scholar: 'Scholar',
  member: 'Member',
}

export default function SettingsTab({ community, rules, settings, members, announcements, setAnnouncements, joinRequests, bans, isAdmin, isMod, communityId, myId, onUpdate, onRefresh, onRegenerateCode }) {
  const navigate = useNavigate()
  const [actionError, setActionError] = useState('')
  const [editName, setEditName] = useState(community.name)
  const [editDesc, setEditDesc] = useState(community.description || '')
  const [editVisibility, setEditVisibility] = useState(community.visibility)
  const [editJoinType, setEditJoinType] = useState(community.join_type)
  const [editCategory, setEditCategory] = useState(community.category || 'general')
  const [saving, setSaving] = useState(false)
  const [newRule, setNewRule] = useState('')
  const [suggestedRules, setSuggestedRules] = useState([])
  const [showSuggested, setShowSuggested] = useState(false)

  const [auditLog, setAuditLog] = useState([])
  const [communityFiles, setCommunityFiles] = useState([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const [memberSearch, setMemberSearch] = useState('')
  const [editingTitle, setEditingTitle] = useState(null)
  const [titleValue, setTitleValue] = useState('')

  const [avatarUploading, setAvatarUploading] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null)
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState(null)
  const [avatarError, setAvatarError] = useState(false)
  const [bannerError, setBannerError] = useState(false)

  useEffect(() => {
    apiGet('/community/suggested-rules').then(setSuggestedRules).catch(() => {})
  }, [])

  useEffect(() => {
    if (isAdmin) loadAuditLog()
  }, [communityId, isAdmin])

  useEffect(() => {
    if (isAdmin) loadFiles()
  }, [communityId, isAdmin])

  useEffect(() => {
    setAvatarError(false)
    setBannerError(false)
  }, [community.avatar_url, community.banner_url])

  const handleSave = async (overrides = {}) => {
    setSaving(true)
    try {
      await apiPut('/communities/' + communityId, {
        name: (overrides.name ?? editName).trim(),
        description: (overrides.description ?? editDesc).trim(),
        visibility: overrides.visibility ?? editVisibility,
        join_type: overrides.joinType ?? editJoinType,
        category: overrides.category ?? editCategory,
      })
      onUpdate()
    } catch {}
    setSaving(false)
  }

  const handleAddRule = async () => {
    if (!newRule.trim()) return
    try {
      await apiPost('/communities/' + communityId + '/rules', { rule: newRule.trim() })
      setNewRule('')
      onRefresh()
    } catch {}
  }

  const handleRemoveRule = async (ruleId) => {
    try {
      await apiDelete('/communities/' + communityId + '/rules/' + ruleId)
      onRefresh()
    } catch {}
  }

  const handleUpdateSettings = async (field, value) => {
    try {
      await apiPut('/communities/' + communityId + '/settings', { [field]: value })
      onRefresh()
    } catch {}
  }

  const handleApproveRequest = async (reqId, status) => {
    try {
      await apiPut('/communities/' + communityId + '/join-requests/' + reqId, { status })
      onRefresh()
    } catch {}
  }

  const handleRemoveBan = async (banId) => {
    try {
      await apiDelete('/communities/' + communityId + '/bans/' + banId)
      onRefresh()
    } catch {}
  }

  const handleRestoreBan = async (banId) => {
    if (!confirm('Restore this member?')) return
    try {
      await apiPost('/communities/' + communityId + '/bans/' + banId + '/restore', {})
      onRefresh()
    } catch {}
  }

  const loadAuditLog = async () => {
    setLoadingAudit(true)
    try {
      const data = await apiGet('/communities/' + communityId + '/audit-log')
      setAuditLog(data || [])
    } catch {}
    setLoadingAudit(false)
  }

  const loadFiles = async () => {
    setLoadingFiles(true)
    try {
      const data = await apiGet('/communities/' + communityId + '/files')
      setCommunityFiles(Array.isArray(data) ? data : [])
    } catch {}
    setLoadingFiles(false)
  }

  const handleSuggestRule = (item) => {
    if (item.field) {
      if (item.field === 'visibility') {
        handleSave({ visibility: item.value })
        setEditVisibility(item.value)
      }
      if (item.field === 'join_type') {
        handleSave({ joinType: item.value })
        setEditJoinType(item.value)
      }
    } else {
      setNewRule(item.label)
    }
  }

  const handleDeleteCommunity = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      const data = await apiDelete('/communities/' + communityId)
      if (data?.error) { setDeleteError(data.error); setDeleting(false); return }
      navigate('/communities')
    } catch (e) { setDeleteError(e.message || 'Failed to delete community'); setDeleting(false) }
  }

  const handleKick = async (userId) => {
    if (!confirm('Remove this member?')) return
    try { await apiDelete(`/communities/${communityId}/members/${userId}`); onRefresh() } catch {}
  }

  const handleBan = async (userId) => {
    const reason = prompt('Ban reason (optional):')
    try { await apiPost(`/communities/${communityId}/bans`, { user_id: userId, reason: reason || '' }); onRefresh() } catch {}
  }

  const handleUnban = async (banId) => {
    if (!confirm('Unban this member?')) return
    try { await apiDelete(`/communities/${communityId}/bans/${banId}`); onRefresh() } catch {}
  }

  const handleSetTitle = async (userId, title) => {
    try { await apiPut(`/communities/${communityId}/members/${userId}/title`, { title: title || null }); onRefresh() } catch {}
  }

  const handleMute = async (userId) => {
    try { await apiPost(`/communities/${communityId}/mutes`, { user_id: userId }); onRefresh() } catch {}
  }

  const handleUnmute = async (muteId) => {
    try { await apiDelete(`/communities/${communityId}/mutes/${muteId}`); onRefresh() } catch {}
  }

  const handleRoleChange = async (userId, newRole) => {
    try { await apiPut(`/communities/${communityId}/members/${userId}/role`, { role: newRole }); onRefresh() } catch {}
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    setAvatarError(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API}/communities/${communityId}/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      })
      const data = await res.json()
      if (data.avatar_url) setAvatarPreviewUrl(data.avatar_url)
      onRefresh()
    } catch {}
    setAvatarUploading(false)
  }

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerUploading(true)
    setBannerError(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API}/communities/${communityId}/banner`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      })
      const data = await res.json()
      if (data.banner_url) setBannerPreviewUrl(data.banner_url)
      onRefresh()
    } catch {}
    setBannerUploading(false)
  }

  const bannedUserIds = (bans ?? []).map(b => b.user_id)
  const filteredMembers = (members || []).filter(m => {
    if (!memberSearch) return true
    const q = memberSearch.toLowerCase()
    return (m.user_name || '').toLowerCase().includes(q) || (m.title || '').toLowerCase().includes(q)
  })

  const groupedMembers = ROLE_ORDER.reduce((acc, role) => {
    acc[role] = filteredMembers.filter(m => m.role === role)
    return acc
  }, {})

  const flatItems = []
  ROLE_ORDER.forEach(role => {
    const groupMembers = groupedMembers[role]
    if (!groupMembers || groupMembers.length === 0) return
    flatItems.push({ type: 'header', role, count: groupMembers.length })
    groupMembers.forEach(m => flatItems.push({ type: 'member', member: m }))
  })

  return (
    <div className={s.settingsArea}>
      {/* ── Group: Community ── */}
      <div className={s.settingsGroup}>
        <div className={s.settingsGroupLabel}>Community</div>

        {/* ── General card ── */}
        <div className={`${s.settingsCard} ${s.cardAccentBlue} ${s.cardIconBlue} ${s.fadeIn}`} style={{animationDelay:'0s'}}>
          <div className={s.cardHeader}>
            <div className={s.cardIconWrap}><Settings size={16} strokeWidth={1.5} /></div>
            <div className={s.cardInfo}>
              <div className={s.cardTitleRow}>
                <h3 className={s.cardTitle}>General</h3>
                {isMod && (
                  <button className={s.saveBtn} onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
              <p className={s.cardDesc}>Manage your community's name, description, and visibility settings.</p>
            </div>
          </div>
          <div className={s.field}>
            <label>Name</label>
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} disabled={!isMod} />
          </div>
          <div className={s.field}>
            <label>Description</label>
            <textarea rows={3} value={editDesc} onChange={e => setEditDesc(e.target.value)} disabled={!isMod} />
          </div>
          <div className={s.fieldGrid}>
            <div className={s.field}>
              <label>Visibility</label>
              <select value={editVisibility} onChange={e => setEditVisibility(e.target.value)} disabled={!isMod}>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div className={s.field}>
              <label>Join Type</label>
              <select value={editJoinType} onChange={e => setEditJoinType(e.target.value)} disabled={!isMod}>
                <option value="anyone">Anyone</option>
                <option value="approval">Requires Approval</option>
                <option value="code">Invite Code</option>
                <option value="invite_only">Invite Only</option>
              </select>
            </div>
          </div>
          <div className={s.field}>
            <label>Category</label>
            <select value={editCategory} onChange={e => setEditCategory(e.target.value)} disabled={!isMod}>
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          {isMod && (
            <div className={s.fieldGrid} style={{ marginTop: 12 }}>
              <div className={s.field}>
                <label>Community Avatar</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {!avatarError && (avatarPreviewUrl || community.avatar_url) ? (
                    <img key={avatarPreviewUrl || community.avatar_url} src={imageUrl(avatarPreviewUrl || community.avatar_url)} onError={() => setAvatarError(true)} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={14} style={{ opacity: 0.4 }} />
                    </div>
                  )}
                  <label className={s.actionBtn} style={{ cursor: 'pointer' }}>
                    <Camera size={14} />
                    {avatarUploading ? 'Uploading...' : 'Upload'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} disabled={avatarUploading} />
                  </label>
                </div>
              </div>
              <div className={s.field}>
                <label>Community Banner</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {!bannerError && (bannerPreviewUrl || community.banner_url) ? (
                    <img key={bannerPreviewUrl || community.banner_url} src={imageUrl(bannerPreviewUrl || community.banner_url)} onError={() => setBannerError(true)} alt="" style={{ width: 80, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 80, height: 40, borderRadius: 6, background: 'linear-gradient(135deg, var(--bg-secondary), var(--border-color))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={14} style={{ opacity: 0.4 }} />
                    </div>
                  )}
                  <label className={s.actionBtn} style={{ cursor: 'pointer' }}>
                    <Camera size={14} />
                    {bannerUploading ? 'Uploading...' : 'Upload'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBannerUpload} disabled={bannerUploading} />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Invite Code card ── */}
        <div className={`${s.settingsCard} ${s.cardAccentBlue} ${s.cardIconBlue} ${s.fadeIn}`} style={{animationDelay:'0.05s'}}>
          <div className={s.cardHeader}>
            <div className={s.cardIconWrap}><Link size={16} strokeWidth={1.5} /></div>
            <div className={s.cardInfo}>
              <div className={s.cardTitleRow}>
                <h3 className={s.cardTitle}>Invite Code</h3>
              </div>
              <p className={s.cardDesc}>Share this code with others so they can join your community.</p>
            </div>
          </div>
          <div className={s.codeRow}>
            <code className={s.codeDisplay}>{community.invite_code || 'N/A'}</code>
            {isMod && (
              <>
                <button className={s.iconBtn} onClick={onRegenerateCode} title="Regenerate">
                  <RefreshCw size={14} strokeWidth={1.5} />
                </button>
                <button className={s.iconBtn} onClick={() => navigator.clipboard.writeText(community.invite_code || '')} title="Copy code">
                  <Copy size={14} strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>
          <p className={s.hint}>Share this link: {window.location.origin}/communities/join/{community.invite_code}</p>
        </div>

        {/* ── Rules card ── */}
        <div className={`${s.settingsCard} ${s.cardAccentPurple} ${s.cardIconPurple} ${s.fadeIn}`} style={{animationDelay:'0.1s'}}>
          <div className={s.cardHeader}>
            <div className={s.cardIconWrap}><ScrollText size={16} strokeWidth={1.5} /></div>
            <div className={s.cardInfo}>
              <div className={s.cardTitleRow}>
                <h3 className={s.cardTitle}>Rules</h3>
                {isMod && (
                  <button className={s.iconBtnSm} onClick={() => setShowSuggested(!showSuggested)}>
                    <Plus size={14} strokeWidth={1.5} /> Suggested
                  </button>
                )}
              </div>
              <p className={s.cardDesc}>Set expectations for your community members.</p>
            </div>
          </div>
          {showSuggested && (
            <div className={s.suggestedRules}>
              {suggestedRules.map(item => (
                <button key={item.id} className={s.suggestedRule} onClick={() => handleSuggestRule(item)}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {rules.length === 0 ? (
            <div className={s.emptyState}>
              <ScrollText size={32} className={s.emptyIcon} />
              <p className={s.emptyTitle}>No rules yet</p>
              <p className={s.emptyDesc}>Create your first rule to help members understand expectations.</p>
            </div>
          ) : (
            <div className={s.listStack}>
              {rules.map((r, i) => (
                <div key={r.id} className={s.compactRow}>
                  <div className={`${s.rowIcon} ${s.rowIconGray}`}>
                    <span className={s.rowNum}>{i + 1}</span>
                  </div>
                  <div className={s.rowContent}>
                    <div className={s.rowTitle}>{r.rule}</div>
                  </div>
                  {isMod && (
                    <div className={s.rowActions}>
                      <button className={s.removeBtn} onClick={() => handleRemoveRule(r.id)}>
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {isMod && (
            <div className={s.addRow}>
              <input type="text" placeholder="Add a rule..." value={newRule} onChange={e => setNewRule(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddRule()} />
              <button className={s.addBtn} onClick={handleAddRule} disabled={!newRule.trim()}>
                <Plus size={14} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>

        {/* ── Community Settings card (toggles) ── */}
        {isMod && (
          <div className={`${s.settingsCard} ${s.cardAccentBlue} ${s.cardIconBlue} ${s.fadeIn}`} style={{animationDelay:'0.15s'}}>
            <div className={s.cardHeader}>
              <div className={s.cardIconWrap}><SlidersHorizontal size={16} strokeWidth={1.5} /></div>
              <div className={s.cardInfo}>
                <div className={s.cardTitleRow}>
                  <h3 className={s.cardTitle}>Community Settings</h3>
                </div>
                <p className={s.cardDesc}>Configure features and permissions for your community.</p>
              </div>
            </div>
            <div className={s.toggleList}>
              {[
                { key: 'allow_file_uploads', label: 'File Uploads' },
                { key: 'allow_flashcards', label: 'Flashcard Sharing' },
                { key: 'allow_competitions', label: 'Competitions' },
                { key: 'allow_member_invites', label: 'Member Invites' },
                { key: 'allow_announcements', label: 'Announcements' },
              ].map(t => (
                <div key={t.key} className={s.toggleRow}>
                  <span>{t.label}</span>
                  <label className={s.toggle}>
                    <input
                      type="checkbox"
                      checked={settings ? settings[t.key] : true}
                      onChange={e => handleUpdateSettings(t.key, e.target.checked ? 1 : 0)}
                    />
                    <span className={s.toggleSlider} />
                  </label>
                </div>
              ))}
            </div>
            <div className={s.field}>
              <label>Max File Size (MB)</label>
              <input
                type="number"
                value={settings?.max_file_size_mb || 50}
                onChange={e => handleUpdateSettings('max_file_size_mb', Math.max(1, parseInt(e.target.value) || 50))}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Group: Members ── */}
      <div className={s.settingsGroup}>
        <div className={s.settingsGroupLabel}>Members</div>

        {/* ── Members card ── */}
        <div className={`${s.settingsCard} ${s.cardAccentGreen} ${s.cardIconGreen} ${s.fadeIn}`} style={{animationDelay:'0.2s'}}>
          <div className={s.cardHeader}>
            <div className={s.cardIconWrap}><Users size={16} strokeWidth={1.5} /></div>
            <div className={s.cardInfo}>
              <div className={s.cardTitleRow}>
                <h3 className={s.cardTitle}>Members</h3>
                <span className={s.levelBadge}>{(members || []).length}</span>
              </div>
              <p className={s.cardDesc}>View and manage community members.</p>
            </div>
          </div>
          <div className={s.memberSearch}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Search members..."
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
            />
          </div>
          <Virtuoso
            style={{ height: 400 }}
            totalCount={flatItems.length}
            itemContent={(index) => {
              const item = flatItems[index]
              if (item.type === 'header') {
                return (
                  <div className={s.memberSection}>
                    <div className={s.memberSectionTitle}>
                      <span>{ROLE_LABELS[item.role]}s</span>
                      <span className={s.memberCount}>{item.count}</span>
                    </div>
                  </div>
                )
              }
              const m = item.member
              return (
                    <div key={m.id} className={s.memberCard}>
                      <div className={s.memberAvatar}>
                        {m.user_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className={s.memberInfo}>
                        <div className={s.memberName}>{m.user_name}</div>
                        <div className={s.memberMeta}>
                          <RoleBadge role={m.role} />
                          {m.title && <span>{m.title}</span>}
                          {m.total_study_hours > 0 && <span>{m.total_study_hours}h studied</span>}
                          <span>Joined {formatDate(m.joined_at)}</span>
                        </div>
                      </div>
                      {isMod && m.user_id !== myId && (
                        <div className={s.memberActions}>
                          <select
                            className={s.inlineSelect}
                            value={m.role}
                            onChange={e => handleRoleChange(m.user_id, e.target.value)}
                          >
                            {ROLE_ORDER.map(r => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                          {editingTitle === m.id ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input
                                type="text"
                                className={s.fieldInput}
                                value={titleValue}
                                onChange={e => setTitleValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { handleSetTitle(m.user_id, titleValue); setEditingTitle(null) }
                                  if (e.key === 'Escape') setEditingTitle(null)
                                }}
                                autoFocus
                                placeholder="Custom title"
                                style={{ fontSize: 12, padding: '4px 8px', width: 120 }}
                              />
                              <button className={s.actionBtn} onClick={() => { handleSetTitle(m.user_id, titleValue); setEditingTitle(null) }}>
                                <Check size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              className={s.actionBtn}
                              onClick={() => { setEditingTitle(m.id); setTitleValue(m.title || '') }}
                              title="Set title"
                            >
                              <Star size={12} />
                            </button>
                          )}
                          {!bannedUserIds.includes(m.user_id) ? (
                            <>
                              <button className={s.actionBtn} onClick={() => handleKick(m.user_id)} title="Kick">
                                <UserMinus size={12} />
                              </button>
                              <button className={s.actionBtnDanger} onClick={() => handleBan(m.user_id)} title="Ban">
                                <Ban size={12} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
              )
            }}
          />
          {filteredMembers.length === 0 && (
            <div className={s.emptyState}>
              <Users size={32} className={s.emptyIcon} />
              <p className={s.emptyTitle}>No members found</p>
              <p className={s.emptyDesc}>{memberSearch ? 'Try a different search term.' : 'No members in this community yet.'}</p>
            </div>
          )}
        </div>

        {/* ── Join Requests card ── */}
        {isMod && (
          <div className={`${s.settingsCard} ${s.cardAccentAmber} ${s.cardIconAmber} ${s.fadeIn}`} style={{animationDelay:'0.25s'}}>
            <div className={s.cardHeader}>
              <div className={s.cardIconWrap}><UserPlus size={16} strokeWidth={1.5} /></div>
              <div className={s.cardInfo}>
                <div className={s.cardTitleRow}>
                  <h3 className={s.cardTitle}>Join Requests</h3>
                  {joinRequests.length > 0 && <span className={s.levelBadge}>{joinRequests.length}</span>}
                </div>
                <p className={s.cardDesc}>Approve or reject pending membership requests.</p>
              </div>
            </div>
            {joinRequests.length === 0 ? (
              <div className={s.emptyState}>
                <UserPlus size={32} className={s.emptyIcon} />
                <p className={s.emptyTitle}>No pending requests</p>
                <p className={s.emptyDesc}>When members request to join, they'll appear here.</p>
              </div>
            ) : (
              <div className={s.listStack}>
                {joinRequests.map(req => (
                  <div key={req.id} className={s.compactRow}>
                    <div className={`${s.rowIcon} ${s.rowIconAmber}`}>
                      <UserPlus size={14} strokeWidth={1.5} />
                    </div>
                    <div className={s.rowContent}>
                      <div className={s.rowTitle}>{req.user_id?.slice(0, 12)}</div>
                      <div className={s.rowMeta}>{req.created_at?.slice(0, 10)}</div>
                    </div>
                    <div className={s.rowActions}>
                      <button className={s.compactApproveBtn} onClick={() => handleApproveRequest(req.id, 'approved')}>
                        <Check size={12} /> Approve
                      </button>
                      <button className={s.compactRejectBtn} onClick={() => handleApproveRequest(req.id, 'rejected')}>
                        <X size={12} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Banned Members card ── */}
        {isMod && (
          <div className={`${s.settingsCard} ${s.cardAccentRed} ${s.cardIconRed} ${s.fadeIn}`} style={{animationDelay:'0.3s'}}>
            <div className={s.cardHeader}>
              <div className={s.cardIconWrap}><Ban size={16} strokeWidth={1.5} /></div>
              <div className={s.cardInfo}>
                <div className={s.cardTitleRow}>
                  <h3 className={s.cardTitle}>Banned Members</h3>
                  {bans.length > 0 && <span className={s.levelBadge} style={{background:'var(--redL)',color:'var(--red)'}}>{bans.length}</span>}
                </div>
                <p className={s.cardDesc}>Manage restricted members and their ban status.</p>
              </div>
            </div>
            {bans.length === 0 ? (
              <div className={s.emptyState}>
                <Ban size={32} className={s.emptyIcon} />
                <p className={s.emptyTitle}>No banned members</p>
                <p className={s.emptyDesc}>Banned members will be listed here.</p>
              </div>
            ) : (
              <div className={s.listStack}>
                {bans.map(b => (
                  <div key={b.id} className={s.compactRow}>
                    <div className={`${s.rowIcon} ${s.rowIconRed}`}>
                      <Ban size={14} strokeWidth={1.5} />
                    </div>
                    <div className={s.rowContent}>
                      <div className={s.rowTitle}>{b.user_id?.slice(0, 12)}</div>
                      <div className={s.rowMeta}>
                        {b.reason && <span>{b.reason}</span>}
                        {b.expires_at && <span style={{color:'var(--amber)'}}>Expires {formatDate(b.expires_at)}</span>}
                      </div>
                    </div>
                    <div className={s.rowActions}>
                      <button className={s.compactActionBtn} onClick={() => handleRestoreBan(b.id)}>Restore</button>
                      <button className={s.compactActionBtnDanger} onClick={() => handleRemoveBan(b.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Group: Administration ── */}
      {isAdmin && (
        <div className={s.settingsGroup}>
          <div className={s.settingsGroupLabel}>Administration</div>

          {/* ── Audit Log card ── */}
          <div className={`${s.settingsCard} ${s.cardAccentGray} ${s.cardIconGray} ${s.fadeIn}`} style={{animationDelay:'0.35s'}}>
            <div className={s.cardHeader}>
              <div className={s.cardIconWrap}><Clock size={16} strokeWidth={1.5} /></div>
              <div className={s.cardInfo}>
                <div className={s.cardTitleRow}>
                  <h3 className={s.cardTitle}>Role Change History</h3>
                  {auditLog.length > 0 && <span className={s.levelBadge} style={{background:'rgba(255,255,255,0.06)',color:'var(--mist)'}}>{auditLog.length}</span>}
                </div>
                <p className={s.cardDesc}>Track role assignments and permission changes.</p>
              </div>
            </div>
            {loadingAudit ? (
              <div className={s.listStack}>
                {[1,2,3].map(i => (
                  <div key={i} className={`${s.skeleton} ${s.skeletonRow} ${s.skeletonShimmer}`} />
                ))}
              </div>
            ) : auditLog.length === 0 ? (
              <div className={s.emptyState}>
                <Clock size={32} className={s.emptyIcon} />
                <p className={s.emptyTitle}>No changes recorded</p>
                <p className={s.emptyDesc}>Role changes will appear here as moderators assign permissions.</p>
              </div>
            ) : (
              <div className={s.listStack}>
                {auditLog.map(log => (
                  <div key={log.id} className={s.compactRow}>
                    <div className={`${s.rowIcon} ${s.rowIconGray}`}>
                      <Clock size={14} strokeWidth={1.5} />
                    </div>
                    <div className={s.rowContent}>
                      <div className={s.rowTitle}>
                        {log.target_user_id?.slice(0, 8)}
                        <span style={{margin:'0 4px',color:'var(--mist)'}}>&rarr;</span>
                        {log.old_role || '?'} &rarr; {log.new_role}
                      </div>
                      <div className={s.rowMeta}>
                        <span>{log.created_at?.slice(0, 10)}</span>
                        <span>by {log.changed_by_user_id?.slice(0, 8)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Uploaded Files card ── */}
          <div className={`${s.settingsCard} ${s.cardAccentGray} ${s.cardIconGray} ${s.fadeIn}`} style={{animationDelay:'0.4s'}}>
            <div className={s.cardHeader}>
              <div className={s.cardIconWrap}><FileText size={16} strokeWidth={1.5} /></div>
              <div className={s.cardInfo}>
                <div className={s.cardTitleRow}>
                  <h3 className={s.cardTitle}>Uploaded Files</h3>
                  {communityFiles.length > 0 && <span className={s.levelBadge} style={{background:'rgba(255,255,255,0.06)',color:'var(--mist)'}}>{communityFiles.length}</span>}
                </div>
                <p className={s.cardDesc}>Files shared by members in this community.</p>
              </div>
            </div>
            {loadingFiles ? (
              <div className={s.listStack}>
                {[1,2,3].map(i => (
                  <div key={i} className={`${s.skeleton} ${s.skeletonRow} ${s.skeletonShimmer}`} />
                ))}
              </div>
            ) : communityFiles.length === 0 ? (
              <div className={s.emptyState}>
                <FileText size={32} className={s.emptyIcon} />
                <p className={s.emptyTitle}>No files uploaded</p>
                <p className={s.emptyDesc}>Files shared in this community will appear here.</p>
              </div>
            ) : (
              <div className={s.listStack}>
                {communityFiles.map(f => (
                  <div key={f.id} className={s.compactRow}>
                    <div className={`${s.rowIcon} ${s.rowIconGray}`}>
                      <FileText size={14} strokeWidth={1.5} />
                    </div>
                    <div className={s.rowContent}>
                      <div className={s.rowTitle}>{f.file_name}</div>
                      <div className={s.rowMeta}>
                        <span>{(f.file_size / 1024).toFixed(0)} KB</span>
                        {f.user_name && <span>{f.user_name}</span>}
                        {f.created_at && <span>{f.created_at?.slice(0, 10)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Danger Zone ── */}
      {isAdmin && (
        <div className={s.settingsGroup}>
          <div className={`${s.dangerCard} ${s.fadeIn}`} style={{animationDelay:'0.45s'}}>
            <div className={s.dangerHeader}>
              <AlertTriangle size={16} strokeWidth={1.5} style={{color:'var(--red)'}} />
              <h3 className={s.dangerTitle}>Danger Zone</h3>
            </div>
            <p className={s.dangerDesc}>Permanently delete this community and all its data. This action cannot be undone.</p>
            <button className={s.deleteCommunityBtn} onClick={() => setShowDeleteConfirm(true)}>Delete Community</button>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteConfirm && (
        <div className={s.modalOverlay} onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError('') }}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>Delete Community</h3>
              {!deleting && <X size={18} className={s.modalClose} onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError('') }} />}
            </div>
            <div className={s.modalBody}>
              {deleteError && <div className={s.createError}>{deleteError}</div>}
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                This will permanently delete <strong>{community.name}</strong> and all messages, members, and data. Type <strong>{community.name}</strong> to confirm.
              </p>
              <input
                className={s.fieldInput}
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder={community.name}
              />
            </div>
            <div className={s.modalFooter}>
              <button className={s.cancelBtn} onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError('') }} disabled={deleting}>Cancel</button>
              <button className={s.deleteBtn} onClick={handleDeleteCommunity} disabled={deleteConfirmText !== community.name || deleting}>
                {deleting ? 'Deleting...' : 'Delete Community'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
