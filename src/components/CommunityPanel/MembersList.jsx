import { useState } from 'react'
import { useProfilePanel } from '../../context/ProfilePanelContext'
import { imageUrl } from '../../lib/api'
import { ChevronRight, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import s from './CommunityPanel.module.css'

export default function MembersList({ communityId, members }) {
  const { openProfile } = useProfilePanel()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const filtered = search
    ? members.filter(m => m.user_name?.toLowerCase().includes(search.toLowerCase()))
    : members

  const display = filtered.slice(0, 10)

  return (
    <div className={s.section}>
      <h3 className={s.sectionTitle}>Members</h3>
      <div className={s.memberSearch}>
        <Search size={14} />
        <input
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className={s.memberList}>
        {display.map(m => (
          <div
            key={m.id}
            className={s.memberRow}
            onClick={() => openProfile(m.user_id)}
            style={{ cursor: 'pointer' }}
          >
            <div className={s.memberAvatar}>
              {m.avatar_url ? (
                <img src={imageUrl(m.avatar_url)} alt="" />
              ) : (
                <div className={s.memberAvatarFallback}>{m.user_name?.[0]?.toUpperCase()}</div>
              )}
            </div>
            <div className={s.memberInfo}>
              <span className={s.memberName}>{m.user_name}</span>
            </div>
            <div className={s.memberHours}>{Math.round(m.total_study_hours || 0)}h</div>
          </div>
        ))}
      </div>
      {members.length > 10 && (
        <button className={s.viewAll} onClick={() => navigate(`/communities/${communityId}`)}>
          View all {members.length} members <ChevronRight size={14} />
        </button>
      )}
    </div>
  )
}
