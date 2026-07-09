import { useState } from 'react'
import { ROLES } from '../../lib/permissions'
import { apiPut, apiDelete, apiPost } from '../../lib/api'
import RoleBadge from '../RoleBadge'
import { Users, UserCog, UserMinus, Ban, Star, Search } from 'lucide-react'
import s from '../../pages/CommunityDetail.module.css'

const ROLE_LABELS = {
  [ROLES.ADMINISTRATOR]: 'Administrators',
  [ROLES.MODERATOR]: 'Moderators',
  [ROLES.MENTOR]: 'Mentors',
  [ROLES.SCHOLAR]: 'Scholars',
  [ROLES.MEMBER]: 'Members',
}

export default function MembersTab({ members, myId, levels, isAdmin, isMod, communityId, onRefresh }) {
  const [roleChange, setRoleChange] = useState(null)
  const [levelChange, setLevelChange] = useState(null)
  const [searchText, setSearchText] = useState('')

  const handleRoleChange = async (userId, role) => {
    try {
      await apiPut(`/communities/${communityId}/members/${userId}/role`, { role })
      onRefresh()
    } catch {}
    setRoleChange(null)
  }

  const handleLevelChange = async (userId, level_id) => {
    try {
      await apiPut(`/communities/${communityId}/members/${userId}/level`, { level_id })
      onRefresh()
    } catch {}
    setLevelChange(null)
  }

  const handleRemove = async (userId) => {
    if (!confirm('Remove this member?')) return
    try {
      await apiDelete(`/communities/${communityId}/members/${userId}`)
      onRefresh()
    } catch {}
  }

  const handleBan = async (userId) => {
    const reason = prompt('Ban reason (optional):')
    try {
      await apiPost(`/communities/${communityId}/bans`, { user_id: userId, reason: reason || '' })
      onRefresh()
    } catch {}
  }

  const ROLE_ORDER = [ROLES.ADMINISTRATOR, ROLES.MODERATOR, ROLES.MENTOR, ROLES.SCHOLAR, ROLES.MEMBER]
  const filtered = searchText
    ? members.filter(m => m.user_name?.toLowerCase().includes(searchText.toLowerCase()))
    : members
  const grouped = Object.groupBy(filtered, m => m.role)

  return (
    <div className={s.membersSections}>
      <div className={s.memberSearch}>
        <Search size={16} strokeWidth={1.5} />
        <input
          type="text"
          placeholder="Search members..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
      </div>
      {ROLE_ORDER.map(role => {
        const group = grouped[role]
        if (!group || group.length === 0) return null
        const headingId = `role-${role}`
        return (
          <section key={role} className={s.memberSection}>
            <h3 id={headingId} className={s.memberSectionTitle}>
              {ROLE_LABELS[role] || role}
              <span className={s.memberCount}>{group.length}</span>
            </h3>
            <ul aria-labelledby={headingId} role="list" className={s.memberList}>
              {group.map(m => (
                <li key={m.id} className={s.memberCard}>
                  <div className={s.memberAvatar}>
                    <Users size={20} />
                  </div>
                  <div className={s.memberInfo}>
                    <div className={s.memberName}>{m.user_name || m.user_id?.slice(0, 8)}</div>
                    <div className={s.memberMeta}>
                      <RoleBadge role={m.role} size="sm" />
                      <span>{Math.round(m.total_study_hours || 0)}h studied</span>
                    </div>
                  </div>
                  {isMod && m.user_id !== myId && (
                    <div className={s.memberActions}>
                      {isAdmin && (
                        <>
                          <button className={s.actionBtn} title="Change role" onClick={() => setRoleChange(roleChange === m.user_id ? null : m.user_id)}>
                            <UserCog size={14} strokeWidth={1.5} />
                          </button>
                          {roleChange === m.user_id && (
                            <div className={s.inlineSelect}>
                              <select onChange={e => { handleRoleChange(m.user_id, e.target.value); e.target.value = '' }} defaultValue="">
                                <option value="" disabled>Role...</option>
                                <option value={ROLES.MEMBER}>Member</option>
                                <option value={ROLES.SCHOLAR}>Scholar</option>
                                <option value={ROLES.MENTOR}>Mentor</option>
                                <option value={ROLES.MODERATOR}>Moderator</option>
                                <option value={ROLES.ADMINISTRATOR}>Administrator</option>
                              </select>
                            </div>
                          )}
                          <button className={s.actionBtn} title="Assign level" onClick={() => setLevelChange(levelChange === m.user_id ? null : m.user_id)}>
                            <Star size={14} strokeWidth={1.5} />
                          </button>
                          {levelChange === m.user_id && (
                            <div className={s.inlineSelect}>
                              <select onChange={e => { handleLevelChange(m.user_id, e.target.value || null); e.target.value = '' }} defaultValue="">
                                <option value="" disabled>Level...</option>
                                <option value="">None</option>
                                {levels.map(l => <option key={l.id} value={l.id}>{l.level_name}</option>)}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                      <button className={s.actionBtnDanger} title="Remove" onClick={() => handleRemove(m.user_id)}>
                        <UserMinus size={14} strokeWidth={1.5} />
                      </button>
                      {isAdmin && (
                        <button className={s.actionBtnDanger} title="Ban" onClick={() => handleBan(m.user_id)}>
                          <Ban size={14} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
