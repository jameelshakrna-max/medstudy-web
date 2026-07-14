import { Clock, BookOpen, Users, Trophy, Activity, Loader2 } from 'lucide-react'
import { formatDate } from '../../lib/api'
import s from '../../pages/ProfilePage.module.css'

export default function ProfileActivity({ activity, loading }) {
  if (loading) {
    return (
      <div className={s.section}>
        <h2 className={s.sectionTitle}><Activity size={18} /> Recent Activity</h2>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--mist)' }} />
        </div>
      </div>
    )
  }

  if (!activity?.length) return null

  return (
    <div className={s.section}>
      <h2 className={s.sectionTitle}><Activity size={18} /> Recent Activity</h2>
      <div className={s.activityList}>
        {activity.map(a => (
          <div key={a.id} className={s.activityItem}>
            <div className={s.activityIcon}>
              {a.type === 'studied' ? <Clock size={14} /> :
               a.type === 'created_cards' ? <BookOpen size={14} /> :
               a.type === 'joined_community' ? <Users size={14} /> :
               a.type === 'joined_competition' ? <Trophy size={14} /> :
               <Activity size={14} />}
            </div>
            <div className={s.activityInfo}>
              <span className={s.activityText}>
                {a.type === 'studied' && 'Studied a session'}
                {a.type === 'created_cards' && `Created ${a.metadata?.count || ''} flashcard${a.metadata?.count !== 1 ? 's' : ''}`}
                {a.type === 'joined_community' && 'Joined a community'}
                {a.type === 'joined_competition' && 'Joined a competition'}
                {!['studied', 'created_cards', 'joined_community', 'joined_competition'].includes(a.type) && a.type.replace(/_/g, ' ')}
              </span>
              <span className={s.activityTime}>{formatDate(a.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
