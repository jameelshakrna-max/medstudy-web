import { useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { UserLink } from '../ui'
import s from './CommunityPanel.module.css'

export default function MembersList({ communityId, members }) {
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
            style={{ cursor: 'pointer' }}
          >
            <UserLink userId={m.user_id} username={m.user_name} avatar={m.avatar_url} size="sm" />
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
