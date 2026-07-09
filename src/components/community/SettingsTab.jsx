import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost, apiPut, apiDelete, formatDate } from '../../lib/api'
import { X, Plus, Loader2, Check, Copy, FileText, Settings, Link, ScrollText, SlidersHorizontal, Trophy, UserPlus, Ban, Clock, AlertTriangle } from 'lucide-react'
import s from '../../pages/CommunityDetail.module.css'

function RefreshCw({ size, strokeWidth }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  )
}

export default function SettingsTab({ community, rules, levels, settings, joinRequests, bans, isAdmin, isMod, communityId, onUpdate, onRefresh, onRegenerateCode }) {
  const navigate = useNavigate()
  const [editName, setEditName] = useState(community.name)
  const [editDesc, setEditDesc] = useState(community.description || '')
  const [editVisibility, setEditVisibility] = useState(community.visibility)
  const [editJoinType, setEditJoinType] = useState(community.join_type)
  const [saving, setSaving] = useState(false)
  const [newRule, setNewRule] = useState('')
  const [suggestedRules, setSuggestedRules] = useState([])
  const [showSuggested, setShowSuggested] = useState(false)

  const [levelForm, setLevelForm] = useState({ level_name: '', level_number: levels.length + 1, min_hours: 0 })
  const [creatingLevel, setCreatingLevel] = useState(false)
  const [auditLog, setAuditLog] = useState([])
  const [communityFiles, setCommunityFiles] = useState([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    apiGet('/community/suggested-rules').then(setSuggestedRules).catch(() => {})
  }, [])

  useEffect(() => {
    if (isAdmin) loadAuditLog()
  }, [communityId, isAdmin])

  useEffect(() => {
    if (isAdmin) loadFiles()
  }, [communityId, isAdmin])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPut('/communities/' + communityId, {
        name: editName.trim(), description: editDesc.trim(),
        visibility: editVisibility, join_type: editJoinType,
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

  const handleCreateLevel = async () => {
    if (!levelForm.level_name.trim()) return
    setCreatingLevel(true)
    try {
      await apiPost('/communities/' + communityId + '/levels', {
        level_name: levelForm.level_name.trim(),
        level_number: levelForm.level_number,
        min_hours: levelForm.min_hours,
      })
      setLevelForm({ level_name: '', level_number: levels.length + 2, min_hours: 0 })
      onRefresh()
    } catch {}
    setCreatingLevel(false)
  }

  const handleRemoveLevel = async (levelId) => {
    try {
      const res = await apiDelete('/communities/' + communityId + '/levels/' + levelId)
      if (res?.error) return alert(res.error)
      onRefresh()
    } catch (e) { alert(e.message) }
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

  const handleSuggestRule = (s) => {
    if (s.field) {
      if (s.field === 'visibility') setEditVisibility(s.value)
      if (s.field === 'join_type') setEditJoinType(s.value)
      handleSave()
    } else {
      setNewRule(s.label)
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
                {isAdmin && (
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
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} disabled={!isAdmin} />
          </div>
          <div className={s.field}>
            <label>Description</label>
            <textarea rows={3} value={editDesc} onChange={e => setEditDesc(e.target.value)} disabled={!isAdmin} />
          </div>
          <div className={s.fieldGrid}>
            <div className={s.field}>
              <label>Visibility</label>
              <select value={editVisibility} onChange={e => setEditVisibility(e.target.value)} disabled={!isAdmin}>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div className={s.field}>
              <label>Join Type</label>
              <select value={editJoinType} onChange={e => setEditJoinType(e.target.value)} disabled={!isAdmin}>
                <option value="anyone">Anyone</option>
                <option value="approval">Requires Approval</option>
                <option value="code">Invite Code</option>
                <option value="invite_only">Invite Only</option>
              </select>
            </div>
          </div>
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
            {isAdmin && (
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
              {suggestedRules.map(s => (
                <button key={s.id} className={s.suggestedRule} onClick={() => handleSuggestRule(s)}>
                  {s.label}
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
        {isAdmin && (
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
      {isAdmin && (
        <div className={s.settingsGroup}>
          <div className={s.settingsGroupLabel}>Members</div>

          {/* ── Member Levels card ── */}
          <div className={`${s.settingsCard} ${s.cardAccentGreen} ${s.cardIconGreen} ${s.fadeIn}`} style={{animationDelay:'0.2s'}}>
            <div className={s.cardHeader}>
              <div className={s.cardIconWrap}><Trophy size={16} strokeWidth={1.5} /></div>
              <div className={s.cardInfo}>
                <div className={s.cardTitleRow}>
                  <h3 className={s.cardTitle}>Member Levels</h3>
                </div>
                <p className={s.cardDesc}>Define study hour requirements for member advancement.</p>
              </div>
            </div>
            {levels.length === 0 ? (
              <div className={s.emptyState}>
                <Trophy size={32} className={s.emptyIcon} />
                <p className={s.emptyTitle}>No levels defined</p>
                <p className={s.emptyDesc}>Create levels to reward members based on study hours.</p>
              </div>
            ) : (
              <div className={s.listStack}>
                {levels.map(l => (
                  <div key={l.id} className={s.compactRow}>
                    <div className={`${s.rowIcon} ${s.rowIconGray}`}>
                      <span className={s.levelBadge}>L{l.level_number}</span>
                    </div>
                    <div className={s.rowContent}>
                      <div className={s.rowTitle}>{l.level_name}</div>
                      <div className={s.rowMeta}>{l.min_hours}h minimum</div>
                    </div>
                    <div className={s.rowActions}>
                      <button className={s.removeBtn} onClick={() => handleRemoveLevel(l.id)}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={s.addRow}>
              <input type="text" placeholder="Level name" value={levelForm.level_name} onChange={e => setLevelForm(p => ({ ...p, level_name: e.target.value }))} />
              <input type="number" placeholder="Min hrs" value={levelForm.min_hours} onChange={e => setLevelForm(p => ({ ...p, min_hours: parseInt(e.target.value) || 0 }))} />
              <button className={s.addBtn} onClick={handleCreateLevel} disabled={!levelForm.level_name.trim() || creatingLevel}>
                {creatingLevel ? <Loader2 size={14} className={s.spinner} /> : <Plus size={14} strokeWidth={1.5} />}
              </button>
            </div>
          </div>

          {/* ── Join Requests card ── */}
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
                      <button className={s.approveBtn} onClick={() => handleApproveRequest(req.id, 'approved')}>
                        <Check size={12} /> Approve
                      </button>
                      <button className={s.rejectBtn} onClick={() => handleApproveRequest(req.id, 'rejected')}>
                        <X size={12} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Banned Members card ── */}
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
                      <button className={s.actionBtn} onClick={() => handleRestoreBan(b.id)}>Restore</button>
                      <button className={s.actionBtnDanger} onClick={() => handleRemoveBan(b.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
