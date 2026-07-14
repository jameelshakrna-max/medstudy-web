import { Trophy } from 'lucide-react'
import s from '../../pages/ProfilePage.module.css'

export default function ProfileBadges({ pinnedBadges, badges, achievements }) {
  const hasPinned = pinnedBadges?.length > 0
  const hasBadges = badges?.length > 0
  const hasAchievements = achievements?.length > 0

  if (!hasPinned && !hasBadges && !hasAchievements) return null

  return (
    <>
      {hasPinned && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}><Trophy size={18} style={{ color: 'var(--amber)' }} /> Pinned</h2>
          <div className={s.pinnedBadges}>
            {pinnedBadges.map((badge, i) => (
              <div key={i} className={s.pinnedBadge}>
                <span className={s.pinnedBadgeEmoji}>{badge.emoji || '🏆'}</span>
                <div className={s.pinnedBadgeInfo}>
                  <div className={s.pinnedBadgeCommunity}>{badge.community_name || 'Community'}</div>
                  <div className={s.pinnedBadgeTitle}>{badge.title || `#${badge.rank}`}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasBadges && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}><Trophy size={18} style={{ color: 'var(--amber)' }} /> Badges</h2>
          <div className={s.allBadges}>
            {badges.map((b, i) => (
              <div key={i} className={s.badgeChip}>
                <span>{b.emoji}</span>
                <span>{b.community_name}</span>
                <span style={{ color: 'var(--mist)', fontSize: 11 }}>{b.title || `#${b.rank}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasAchievements && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}>🏅 Achievements</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {achievements.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 10,
                background: 'var(--input-bg)', border: '1px solid var(--card-border)',
                fontSize: 13,
              }}>
                <span style={{ fontSize: 20 }}>{a.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.title}</div>
                  <div style={{ color: 'var(--mist)', fontSize: 11 }}>{a.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
