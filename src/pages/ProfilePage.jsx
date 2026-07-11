import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiGet, formatDate } from '../lib/api'
import { Users, Trophy, BookOpen, Clock, Flame, ChevronLeft, Loader2 } from 'lucide-react'
import RoleBadge from '../components/RoleBadge'

const API = import.meta.env.VITE_API_URL || '/api'

export default function ProfilePage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet(`/users/${userId}/profile`)
      .then(d => { setProfile(d); setLoading(false) })
      .catch(() => { setError('User not found'); setLoading(false) })
  }, [userId])

  if (loading) return <div style={{textAlign:'center',padding:60}}><Loader2 size={24} style={{animation:'spin 0.8s linear infinite'}} /> Loading...</div>
  if (error) return <div style={{textAlign:'center',padding:60,color:'var(--red)'}}>{error}</div>
  if (!profile) return null

  return (
    <div style={{maxWidth:640,margin:'0 auto',padding:'24px 16px 60px'}}>
      {/* Back button */}
      <button onClick={() => navigate(-1)} style={{display:'inline-flex',alignItems:'center',gap:6,background:'none',border:'none',color:'var(--mist)',fontSize:14,cursor:'pointer',padding:'6px 12px',borderRadius:8,marginBottom:20,fontFamily:'DM Sans,sans-serif'}}>
        <ChevronLeft size={16} strokeWidth={1.5} /> Back
      </button>

      {/* Profile card */}
      <div style={{background:'var(--card-bg)',border:'1px solid var(--card-border)',borderRadius:20,padding:28,marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
          <div style={{width:64,height:64,borderRadius:20,background:'var(--blueL)',color:'var(--blue)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,overflow:'hidden'}}>
            <Users size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h1 style={{fontSize:22,fontWeight:700,color:'var(--text-primary)',margin:0}}>{profile.username || userId?.slice(0,12)}</h1>
            {profile.title && <p style={{fontSize:13,color:'var(--mist)',marginTop:2}}>{profile.title}</p>}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:12}}>
          <div style={{background:'var(--input-bg)',borderRadius:12,padding:14,textAlign:'center'}}>
            <Clock size={20} strokeWidth={1.5} style={{color:'var(--blue)',marginBottom:4}} />
            <div style={{fontSize:20,fontWeight:800,color:'var(--text-primary)'}}>{Math.round(profile.totalHours)}</div>
            <div style={{fontSize:11,color:'var(--mist)'}}>Study Hours</div>
          </div>
          <div style={{background:'var(--input-bg)',borderRadius:12,padding:14,textAlign:'center'}}>
            <BookOpen size={20} strokeWidth={1.5} style={{color:'var(--emerald)',marginBottom:4}} />
            <div style={{fontSize:20,fontWeight:800,color:'var(--text-primary)'}}>{profile.questionsSolved}</div>
            <div style={{fontSize:11,color:'var(--mist)'}}>Questions Solved</div>
          </div>
          <div style={{background:'var(--input-bg)',borderRadius:12,padding:14,textAlign:'center'}}>
            <Flame size={20} strokeWidth={1.5} style={{color:'var(--amber)',marginBottom:4}} />
            <div style={{fontSize:20,fontWeight:800,color:'var(--text-primary)'}}>{profile.streak}</div>
            <div style={{fontSize:11,color:'var(--mist)'}}>Day Streak</div>
          </div>
          <div style={{background:'var(--input-bg)',borderRadius:12,padding:14,textAlign:'center'}}>
            <Users size={20} strokeWidth={1.5} style={{color:'var(--indigo)',marginBottom:4}} />
            <div style={{fontSize:20,fontWeight:800,color:'var(--text-primary)'}}>{profile.communities?.length || 0}</div>
            <div style={{fontSize:11,color:'var(--mist)'}}>Communities</div>
          </div>
        </div>
      </div>

      {/* Badges section */}
      {profile.badges?.length > 0 && (
        <div style={{background:'var(--card-bg)',border:'1px solid var(--card-border)',borderRadius:20,padding:24,marginBottom:20}}>
          <h2 style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
            <Trophy size={18} strokeWidth={1.5} style={{color:'var(--amber)'}} /> Badges
          </h2>
          <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
            {profile.badges.map((b, i) => (
              <div key={i} style={{background:'var(--input-bg)',borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:10,fontSize:13,color:'var(--text-primary)'}}>
                <span style={{fontSize:24}}>{b.emoji}</span>
                <div>
                  <div style={{fontWeight:600}}>{b.community_name}</div>
                  <div style={{fontSize:11,color:'var(--mist)'}}>{b.title || `#${b.rank} • ${b.year}-${String(b.month).padStart(2,'0')}`}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Communities section */}
      {profile.communities?.length > 0 && (
        <div style={{background:'var(--card-bg)',border:'1px solid var(--card-border)',borderRadius:20,padding:24}}>
          <h2 style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
            <Users size={18} strokeWidth={1.5} /> Communities
          </h2>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {profile.communities.map(c => (
              <Link key={c.id} to={`/communities/${c.id}`} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'var(--input-bg)',borderRadius:12,textDecoration:'none',transition:'background 0.15s'}}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background='var(--input-bg)'}>
                <div style={{width:32,height:32,borderRadius:8,background:'var(--blueL)',color:'var(--blue)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:12,fontWeight:700}}>
                  {c.name?.[0]?.toUpperCase() || 'C'}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)'}}>{c.name}</div>
                  <div style={{display:'flex',gap:6,alignItems:'center',marginTop:2}}>
                    <RoleBadge role={c.role} size="sm" />
                    {c.title && <span style={{fontSize:11,color:'var(--mist)'}}>{c.title}</span>}
                    <span style={{fontSize:11,color:'var(--mist)'}}>{Math.round(c.total_study_hours)}h studied</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
