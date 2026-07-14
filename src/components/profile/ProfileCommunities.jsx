import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { imageUrl } from '../../lib/api'
import RoleBadge from '../RoleBadge'
import s from '../../pages/ProfilePage.module.css'

export default function ProfileCommunities({ communities, sharedCommunities, showShared, currentUserId }) {
  const hasCommunities = communities?.length > 0
  const hasShared = showShared && sharedCommunities?.length > 0

  if (!hasCommunities && !hasShared) return null

  return (
    <>
      {hasCommunities && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}><Users size={18} /> Communities</h2>
          <div className={s.communityList}>
            {communities.map(c => (
              <Link key={c.id} to={`/communities/${c.id}`} className={s.communityItem}>
                <div className={s.communityAvatar}>
                  {c.avatar_url ? <img src={imageUrl(c.avatar_url)} alt="" loading="lazy" /> : (c.name?.[0]?.toUpperCase() || 'C')}
                </div>
                <div className={s.communityInfo}>
                  <div className={s.communityName}>{c.name}</div>
                  <div className={s.communityMeta}>
                    <RoleBadge role={c.role} size="sm" />
                    {c.title && <span>{c.title}</span>}
                    <span>{Math.round(c.total_study_hours)}h studied</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasShared && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}><Users size={18} /> Shared Communities</h2>
          <div className={s.communityList}>
            {sharedCommunities.map(c => (
              <Link key={c.id} to={`/communities/${c.id}`} className={s.communityItem}>
                <div className={s.communityAvatar}>
                  {c.avatar_url ? <img src={imageUrl(c.avatar_url)} alt="" loading="lazy" /> : (c.name?.[0]?.toUpperCase() || 'C')}
                </div>
                <div className={s.communityInfo}>
                  <div className={s.communityName}>{c.name}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
