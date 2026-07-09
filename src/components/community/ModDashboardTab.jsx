import { useState, useEffect } from 'react'
import { Users, UserPlus, Ban, MessageSquare, Activity } from 'lucide-react'
import { apiGet } from '../../lib/api'
import s from '../../pages/CommunityDetail.module.css'

export default function ModDashboardTab({ communityId, onNavigate }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (communityId) {
      apiGet('/communities/' + communityId + '/mod-dashboard')
        .then(d => setStats(d))
        .catch(() => {})
    }
  }, [communityId])

  if (!stats) return <p className={s.hint}>Loading dashboard...</p>

  const cards = [
    { label: 'Total Members', value: stats.totalMembers, icon: Users, color: '#3b82f6' },
    { label: 'Active (7d)', value: stats.activeMembers, icon: Activity, color: '#10b981' },
    { label: 'Messages (24h)', value: stats.recentMessages, icon: MessageSquare, color: '#8b5cf6' },
    { label: 'Pending Requests', value: stats.joinRequests, icon: UserPlus, color: '#f59e0b' },
    { label: 'Bans (7d)', value: stats.recentBans, icon: Ban, color: '#ef4444' },
  ]

  return (
    <div>
      <h2 style={{marginBottom:16,fontSize:18,fontWeight:600}}>Moderator Dashboard</h2>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}}>
        {cards.map(c => (
          <div key={c.label} className={s.settingSection} style={{textAlign:'center',padding:20}}>
            <c.icon size={28} strokeWidth={1.5} color={c.color} />
            <div style={{fontSize:28,fontWeight:700,marginTop:8}}>{c.value ?? '—'}</div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:4}}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:12,marginTop:20,flexWrap:'wrap'}}>
        <button className={s.saveBtn} onClick={() => { console.log('[ModDashboardTab] click settings, onNavigate=', typeof onNavigate); onNavigate?.('settings') }}>
          View Join Requests
        </button>
        <button className={s.saveBtn} onClick={() => { console.log('[ModDashboardTab] click settings, onNavigate=', typeof onNavigate); onNavigate?.('settings') }}>
          Banned Members
        </button>
        <button className={s.saveBtn} onClick={() => { console.log('[ModDashboardTab] click members, onNavigate=', typeof onNavigate); onNavigate?.('members') }}>
          Manage Members
        </button>
      </div>
    </div>
  )
}
