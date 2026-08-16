import { Users, Compass, Trophy, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import CommunityCard from './CommunityCard'
import s from './communityPanels.module.css'

const SHORTCUTS = [
  { to: '/communities/discover', label: 'Discover', desc: 'Browse and join public communities', icon: Compass },
  { to: '/communities/people', label: 'People', desc: 'Find friends and study partners', icon: UserRound },
  { to: '/communities/leaderboard', label: 'Leaderboard', desc: 'See the monthly rankings', icon: Trophy },
]

export default function CommunityOverview({ myCommunities }) {
  const recent = myCommunities.slice(0, 3)

  return (
    <div className={s.overview}>
      <p className={s.overviewIntro}>
        Study together, share resources, and climb the rankings. Manage the communities you belong to,
        discover new ones, and connect with other students.
      </p>

      <section className={s.section}>
        <h2 className={s.sectionTitle}>My Communities</h2>
        <p className={s.overviewCount}>
          {myCommunities.length === 1 ? 'You belong to 1 community.' : `You belong to ${myCommunities.length} communities.`}
        </p>
        {recent.length === 0 ? (
          <div className={s.emptyCompact}>
            <Users size={32} strokeWidth={1} />
            <p>You haven't joined any communities yet.</p>
            <Link className={s.emptyAction} to="/communities/discover">Discover communities</Link>
          </div>
        ) : (
          <div className={s.grid}>
            {recent.map(c => (
              <CommunityCard key={c.id} community={c} />
            ))}
          </div>
        )}
      </section>

      <section className={s.section}>
        <h2 className={s.sectionTitle}>Explore</h2>
        <div className={s.shortcuts}>
          {SHORTCUTS.map(({ to, label, desc, icon: Icon }) => (
            <Link key={to} to={to} className={s.shortcut}>
              <Icon size={18} strokeWidth={1.5} />
              <div>
                <div className={s.shortcutLabel}>{label}</div>
                <div className={s.shortcutDesc}>{desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
