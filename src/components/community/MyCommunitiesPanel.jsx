import { Users, Compass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CommunityCard from './CommunityCard'
import s from './communityPanels.module.css'

export default function MyCommunitiesPanel({ myCommunities }) {
  const navigate = useNavigate()

  if (myCommunities.length === 0) {
    return (
      <div className={s.empty}>
        <Users size={40} strokeWidth={1} />
        <p>You haven't joined any communities yet</p>
        <button className={s.emptyAction} onClick={() => navigate('/communities/discover')}>
          <Compass size={15} />
          Discover communities
        </button>
      </div>
    )
  }

  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>Your Communities</h2>
      <div className={s.grid}>
        {myCommunities.map(c => (
          <CommunityCard key={c.id} community={c} />
        ))}
      </div>
    </section>
  )
}
