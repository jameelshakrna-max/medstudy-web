import { useState, useEffect } from 'react'
import { Users, UserPlus, Ban, MessageSquare, Activity, Search, UserCog, UserMinus, VolumeX, Volume2, ExternalLink, Check, X, Loader2 } from 'lucide-react'
import { apiGet, apiPut, apiPost, apiDelete } from '../../lib/api'
import AnnouncementsTab from './AnnouncementsTab'
import RoleBadge from '../RoleBadge'
import s from '../../pages/CommunityDetail.module.css'

const ROLE_ORDER = ['administrator', 'moderator', 'mentor', 'scholar', 'member']
const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'administrator', label: 'Administrators' },
  { key: 'moderator', label: 'Moderators' },
  { key: 'mentor', label: 'Mentors' },
  { key: 'scholar', label: 'Scholars' },
  { key: 'member', label: 'Members' },
  { key: 'muted', label: 'Muted' },
  { key: 'banned', label: 'Banned' },
]

export default function ModDashboardTab({ communityId, members, announcements, setAnnouncements, myId, isMod, isAdmin }) {
  const [stats, setStats] = useState(null)
  const [joinReqs, setJoinReqs] = useState([])
  const [filterRole, setFilterRole] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [mutes, setMutes] = useState([])
  const [bannedList, setBannedList] = useState([])
  const [titleEdits, setTitleEdits] = useState({})
  const [expandedMember, setExpandedMember] = useState(null)

  useEffect(() => {
    if (!communityId) return
    apiGet(`/communities/${communityId}/mod-dashboard`).then(d => setStats(d)).catch(() => {})
    fetchJoinRequests()
  }, [communityId])

  useEffect(() => {
    if (filterRole === 'muted' && communityId) {
      apiGet(`/communities/${communityId}/mutes`).then(d => setMutes(Array.isArray(d) ? d : [])).catch(() => {})
    }
    if (filterRole === 'banned' && communityId) {
      apiGet(`/communities/${communityId}/bans`).then(d => setBannedList(Array.isArray(d) ? d : [])).catch(() => {})
    }
  }, [filterRole, communityId])

  const fetchJoinRequests = async () => {
    try { const d = await apiGet(`/communities/${communityId}/join-requests`); setJoinReqs(Array.isArray(d) ? d : []) } catch {}
  }

  const handleApproveRequest = async (reqId, status) => {
    try { await apiPut(`/communities/${communityId}/join-requests/${reqId}`, { status }); fetchJoinRequests() } catch {}
  }

  const handleRoleChange = async (userId, role) => {
    try { await apiPut(`/communities/${communityId}/members/${userId}/role`, { role }) } catch {}
  }

  const handleSetTitle = async (userId, title) => {
    try { await apiPut(`/communities/${communityId}/members/${userId}/title`, { title: title || null }) } catch {}
  }

  const handleKick = async (userId) => {
    if (!confirm('Remove this member?')) return
    try { await apiDelete(`/communities/${communityId}/members/${userId}`) } catch {}
  }

  const handleBan = async (userId) => {
    const reason = prompt('Ban reason (optional):')
    try { await apiPost(`/communities/${communityId}/bans`, { user_id: userId, reason: reason || '' }) } catch {}
  }

  const handleUnban = async (banId) => {
    if (!confirm('Unban this member?')) return
    try { await apiDelete(`/communities/${communityId}/bans/${banId}`) } catch {}
  }

  const handleMute = async (userId) => {
    try { await apiPost(`/communities/${communityId}/mutes`, { user_id: userId }) } catch {}
  }

  const handleUnmute = async (muteId) => {
    try { await apiDelete(`/communities/${communityId}/mutes/${muteId}`) } catch {}
  }

  const getFilteredMembers = () => {
    if (filterRole === 'muted') {
      const muteUserIds = new Set(mutes.map(m => m.user_id || m.userId))
      const list = (members || []).filter(m => muteUserIds.has(m.user_id || m.id))
      if (!searchText) return list
      const q = searchText.toLowerCase()
      return list.filter(m => (m.username || '').toLowerCase().includes(q))
    }
    if (filterRole === 'banned') {
      let list = bannedList.map(b => ({ ...b, _banId: b.id, username: b.username, user_id: b.user_id || b.userId }))
      if (searchText) {
        const q = searchText.toLowerCase()
        list = list.filter(m => (m.username || '').toLowerCase().includes(q))
      }
      return list
    }
    let list = members || []
    if (filterRole !== 'all') {
      list = list.filter(m => (m.role || 'member').toLowerCase() === filterRole)
    }
    if (searchText) {
      const q = searchText.toLowerCase()
      list = list.filter(m => (m.username || '').toLowerCase().includes(q))
    }
    return list
  }

  const getMuteId = (userId) => {
    const m = mutes.find(x => (x.user_id || x.userId) === userId)
    return m?.id
  }

  const isMuted = (userId) => mutes.some(x => (x.user_id || x.userId) === userId)

  const statCards = stats ? [
    { label: 'Total Members', value: stats.totalMembers, icon: Users, color: '#3b82f6' },
    { label: 'Active (7d)', value: stats.activeMembers, icon: Activity, color: '#10b981' },
    { label: 'Messages (24h)', value: stats.recentMessages, icon: MessageSquare, color: '#8b5cf6' },
    { label: 'Pending Requests', value: stats.joinRequests, icon: UserPlus, color: '#f59e0b' },
    { label: 'Bans (7d)', value: stats.recentBans, icon: Ban, color: '#ef4444' },
  ] : []

  const filteredMembers = getFilteredMembers()

  return (
    <div>
      <h2 style={{ marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Moderator Dashboard</h2>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {statCards.map(c => (
          <div key={c.label} className={s.settingSection} style={{ flex: '1 1 140px', textAlign: 'center', padding: 20 }}>
            <c.icon size={28} strokeWidth={1.5} color={c.color} />
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{c.value ?? '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {joinReqs.length > 0 && (
        <div className={s.settingSection} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Pending Join Requests</h3>
          {joinReqs.map(req => (
            <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--card-border)' }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{req.username || req.user_id}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className={s.actionBtn} onClick={() => handleApproveRequest(req.id, 'approved')} title="Approve">
                  <Check size={14} />
                </button>
                <button className={s.actionBtnDanger} onClick={() => handleApproveRequest(req.id, 'rejected')} title="Reject">
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--card-border)', margin: '20px 0' }} />

      <AnnouncementsTab
        announcements={announcements}
        setAnnouncements={setAnnouncements}
        communityId={communityId}
        isMod={isMod}
      />

      <div style={{ borderTop: '1px solid var(--card-border)', margin: '20px 0' }} />

      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Member Management</h3>

      <div className={s.filterBar}>
        {FILTER_TABS.map(f => (
          <button
            key={f.key}
            className={`${s.filterBtn} ${filterRole === f.key ? s.filterActive : ''}`}
            onClick={() => { setFilterRole(f.key); setSearchText('') }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={s.memberSearch}>
        <Search size={14} strokeWidth={1.5} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--mist)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search members..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ width: '100%', padding: '8px 10px 8px 32px', fontSize: 13, borderRadius: 8, border: '1px solid var(--card-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div className={s.memberList}>
        {filteredMembers.map(m => {
          const uid = m.user_id || m.id
          const role = (m.role || 'member').toLowerCase()
          const isExpanded = expandedMember === uid
          return (
            <div key={uid} className={s.memberCard}>
              <div className={s.memberAvatar}>
                {(m.username || '?')[0].toUpperCase()}
              </div>
              <div className={s.memberInfo}>
                <div className={s.memberName}>{m.username}</div>
                <div className={s.memberMeta}>
                  <RoleBadge role={role} />
                  {m.title && <span style={{ color: 'var(--mist)' }}>{m.title}</span>}
                  {m.total_hours != null && <span>{m.total_hours}h</span>}
                  {m.joined_at && <span>{new Date(m.joined_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className={s.memberActions}>
                <div className={s.inlineSelect}>
                  <select
                    value={role}
                    onChange={e => handleRoleChange(uid, e.target.value)}
                    disabled={!isAdmin && role === 'administrator'}
                  >
                    {ROLE_ORDER.map(r => (
                      <option key={r} value={r} disabled={r === 'administrator' && !isAdmin}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {titleEdits[uid] !== undefined ? (
                  <input
                    type="text"
                    value={titleEdits[uid]}
                    onChange={e => setTitleEdits(prev => ({ ...prev, [uid]: e.target.value }))}
                    onBlur={() => { handleSetTitle(uid, titleEdits[uid]); setTitleEdits(prev => { const n = { ...prev }; delete n[uid]; return n }) }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setTitleEdits(prev => { const n = { ...prev }; delete n[uid]; return n }) }}
                    autoFocus
                    style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--blue)', background: 'var(--input-bg)', color: 'var(--text-primary)', width: 100, fontFamily: "'DM Sans', sans-serif" }}
                  />
                ) : (
                  <button className={s.actionBtn} onClick={() => setTitleEdits(prev => ({ ...prev, [uid]: m.title || '' }))} title="Set title">
                    <UserCog size={14} />
                  </button>
                )}

                {filterRole === 'muted' || isMuted(uid) ? (
                  <button className={s.actionBtn} onClick={() => { const mid = getMuteId(uid); if (mid) handleUnmute(mid) }} title="Unmute">
                    <Volume2 size={14} />
                  </button>
                ) : (
                  <button className={s.actionBtnDanger} onClick={() => handleMute(uid)} title="Mute">
                    <VolumeX size={14} />
                  </button>
                )}

                {filterRole === 'banned' ? (
                  <button className={s.actionBtn} onClick={() => handleUnban(m._banId || m.id)} title="Unban">
                    <Ban size={14} />
                  </button>
                ) : (
                  <button className={s.actionBtnDanger} onClick={() => handleBan(uid)} title="Ban">
                    <Ban size={14} />
                  </button>
                )}

                {uid !== myId && (
                  <button className={s.actionBtnDanger} onClick={() => handleKick(uid)} title="Kick">
                    <UserMinus size={14} />
                  </button>
                )}

                <a href={`/profile/${uid}`} className={s.actionBtn} title="View profile" target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          )
        })}
        {filteredMembers.length === 0 && (
          <div className={s.hint} style={{ padding: 20, textAlign: 'center' }}>
            {filterRole === 'muted' ? 'No muted members.' : filterRole === 'banned' ? 'No banned members.' : 'No members found.'}
          </div>
        )}
      </div>
    </div>
  )
}
