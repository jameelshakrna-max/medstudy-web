import s from './CommunityPanel.module.css'

export default function StatsCard({ community, members }) {
  const activeMembers = new Set(
    (members || [])
      .filter(m => m.total_study_hours > 0)
      .map(m => m.user_id)
  ).size

  return (
    <div className={s.statsRow}>
      <div className={s.statPill}>
        <span className={s.statValue}>{Math.round(community.total_study_hours || 0)}</span>
        <span className={s.statLabel}>hours</span>
      </div>
      <div className={s.statPill}>
        <span className={s.statValue}>{activeMembers}</span>
        <span className={s.statLabel}>active</span>
      </div>
      <div className={s.statPill}>
        <span className={s.statValue}>{community.member_count || 0}</span>
        <span className={s.statLabel}>members</span>
      </div>
    </div>
  )
}
