import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Globe, Lock, Clock } from 'lucide-react'
import { imageUrl } from '../../lib/api'
import { CATEGORY_CONFIG } from '../../lib/communityCategories'
import s from './communityPanels.module.css'

export default function CommunityCard({ community, showStudyHours = false }) {
  const navigate = useNavigate()
  const [avatarError, setAvatarError] = useState(false)
  const open = () => navigate('/communities/' + community.id)

  return (
    <div
      className={s.card}
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      <div className={s.cardTop}>
        <div className={s.cardAvatar}>
          {!avatarError && community.avatar_url ? (
            <img key={community.avatar_url} src={imageUrl(community.avatar_url)} onError={() => setAvatarError(true)} alt="" loading="lazy" />
          ) : (
            <Users size={20} />
          )}
        </div>
        <div className={s.cardVisibility}>
          {community.visibility === 'private' ? <Lock size={12} /> : <Globe size={12} />}
        </div>
      </div>
      <h3 className={s.cardName}>{community.name}</h3>
      <p className={s.cardDesc}>{community.description}</p>
      <div className={s.cardMeta}>
        {community.category && community.category !== 'general' && (
          <span className={s.cardCategory} style={{ color: CATEGORY_CONFIG[community.category]?.color, borderColor: CATEGORY_CONFIG[community.category]?.color }}>
            {CATEGORY_CONFIG[community.category]?.label || community.category}
          </span>
        )}
        <span>{community.member_count || 0} members</span>
        {showStudyHours && community.total_study_hours > 0 && (
          <span><Clock size={10} /> {Math.round(community.total_study_hours)}h</span>
        )}
      </div>
    </div>
  )
}
