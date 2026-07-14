import { X } from 'lucide-react'
import { imageUrl } from '../../lib/api'
import s from './CommunityPanel.module.css'

const CATEGORY_COLORS = {
  general: 'var(--blue)',
  clinical: 'var(--emerald)',
  exam_prep: '#F59E0B',
  anatomy: '#8B5CF6',
  pharmacology: '#EC4899',
  pathology: '#EF4444',
  research: '#06B6D4',
  wellness: '#F97316',
}

export default function Header({ community, onClose }) {
  return (
    <div className={s.header}>
      <div className={s.headerTop}>
        <div className={s.communityAvatar}>
          {community.avatar_url ? (
            <img src={imageUrl(community.avatar_url)} alt="" />
          ) : (
            <div className={s.avatarFallback}>{community.name?.[0]?.toUpperCase() || '?'}</div>
          )}
        </div>
        <button className={s.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <h2 className={s.communityName}>{community.name}</h2>
      <div className={s.communityMeta}>
        <span className={s.categoryBadge} style={{ color: CATEGORY_COLORS[community.category] || 'var(--mist)' }}>
          {community.category?.replace('_', ' ') || 'General'}
        </span>
        <span className={s.metaDot}>·</span>
        <span>{community.member_count || 0} members</span>
        <span className={s.metaDot}>·</span>
        <span>{Math.round(community.total_study_hours || 0)}h studied</span>
      </div>
    </div>
  )
}
