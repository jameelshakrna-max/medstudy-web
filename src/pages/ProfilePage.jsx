import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiGet, formatDate, imageUrl } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { ChevronLeft, MapPin, ExternalLink, Calendar, Clock, BookOpen, Flame, Users, Trophy, Loader2, Pencil } from 'lucide-react'
import RoleBadge from '../components/RoleBadge'
import AvatarUpload from '../components/AvatarUpload'
import s from './ProfilePage.module.css'

export default function ProfilePage() {
  const { userId: paramId, username: paramUsername } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resolvedUserId, setResolvedUserId] = useState(null)

  useEffect(() => {
    setLoading(true)
    setProfile(null)
    setError('')

    const loadProfile = async () => {
      try {
        let userId = paramId

        if (paramUsername && !paramId) {
          const usernameData = await apiGet(`/users/username/${paramUsername}`)
          userId = usernameData.user_id
        }

        if (!userId) {
          setError('User not found')
          setLoading(false)
          return
        }

        setResolvedUserId(userId)
        const data = await apiGet(`/users/${userId}/profile`)
        setProfile(data)
      } catch {
        setError('User not found')
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [paramId, paramUsername])

  const isOwnProfile = user?.id === resolvedUserId

  if (loading) return (
    <div className={s.loading}>
      <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading profile...
    </div>
  )

  if (error) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</div>
      <button className={s.backBtn} onClick={() => navigate(-1)}>Go Back</button>
    </div>
  )

  if (!profile) return null

  const displayName = profile.display_name || profile.user_name || 'Student'
  const joinDate = profile.joined_at ? new Date(profile.joined_at) : null

  return (
    <div className={s.page}>
      <button className={s.backBtn} onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/dashboard')}>
        <ChevronLeft size={16} strokeWidth={1.5} /> Back
      </button>

      <div className={s.headerCard}>
        <div className={s.bannerWrap}>
          {profile.banner_url ? (
            <img className={s.bannerImg} src={imageUrl(profile.banner_url)} alt="Profile banner" />
          ) : (
            <div className={s.bannerPlaceholder}>
              <Trophy size={40} strokeWidth={1} style={{ opacity: 0.3 }} />
            </div>
          )}
        </div>

        <div className={s.avatarRow}>
          <div className={s.avatarWrap}>
            <AvatarUpload
              url={profile.avatar_url}
              size="lg"
              userName={displayName}
              userId={resolvedUserId}
              editable={isOwnProfile}
              onChange={() => {}}
            />
          </div>
          <div className={s.profileInfo} style={{ flex: 1 }}>
            <h1 className={s.displayName}>{displayName}</h1>
            {profile.username && <p className={s.usernameText}>@{profile.username}</p>}
            {profile.active_title && (
              <div className={s.activeTitle}>🏅 {profile.active_title}</div>
            )}
          </div>
          {isOwnProfile && (
            <Link to="/settings" className={s.editBtn}>
              <Pencil size={14} /> Edit Profile
            </Link>
          )}
        </div>

        <div className={s.metaRow}>
          {profile.location && (
            <span className={s.metaItem}><MapPin size={14} /> {profile.location}</span>
          )}
          {profile.website && (
            <a className={s.metaItem} href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none' }}>
              <ExternalLink size={14} /> {profile.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          {joinDate && (
            <span className={s.metaItem}><Calendar size={14} /> Joined {joinDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
          )}
        </div>

        <div className={s.statsBar}>
          <div className={s.statItem}>
            <div className={s.statValue}>{Math.round(profile.stats?.study_hours || 0)}</div>
            <div className={s.statLabel}>Study Hours</div>
          </div>
          <div className={s.statItem}>
            <div className={s.statValue}>{profile.stats?.questions_answered || 0}</div>
            <div className={s.statLabel}>Questions</div>
          </div>
          <div className={s.statItem}>
            <div className={s.statValue}>{profile.stats?.current_streak || 0}</div>
            <div className={s.statLabel}>Day Streak</div>
          </div>
          <div className={s.statItem}>
            <div className={s.statValue}>{profile.stats?.communities_count || profile.communities?.length || 0}</div>
            <div className={s.statLabel}>Communities</div>
          </div>
        </div>
      </div>

      {profile.bio && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}>About</h2>
          <p className={s.bio}>{profile.bio}</p>
        </div>
      )}

      {profile.pinned_badges?.length > 0 && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}><Trophy size={18} style={{ color: 'var(--amber)' }} /> Pinned</h2>
          <div className={s.pinnedBadges}>
            {profile.pinned_badges.map((badge, i) => (
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

      {profile.badges?.length > 0 && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}><Trophy size={18} style={{ color: 'var(--amber)' }} /> Badges</h2>
          <div className={s.allBadges}>
            {profile.badges.map((b, i) => (
              <div key={i} className={s.badgeChip}>
                <span>{b.emoji}</span>
                <span>{b.community_name}</span>
                <span style={{ color: 'var(--mist)', fontSize: 11 }}>{b.title || `#${b.rank}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.communities?.length > 0 && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}><Users size={18} /> Communities</h2>
          <div className={s.communityList}>
            {profile.communities.map(c => (
              <Link key={c.id} to={`/communities/${c.id}`} className={s.communityItem}>
                <div className={s.communityAvatar}>
                  {c.avatar_url ? <img src={imageUrl(c.avatar_url)} alt="" /> : (c.name?.[0]?.toUpperCase() || 'C')}
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

      {!profile.bio && !profile.badges?.length && !profile.communities?.length && (
        <div className={s.section}>
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><Users size={32} style={{ color: 'var(--mist)', opacity: 0.5 }} /></div>
            <p>This profile is just getting started.</p>
          </div>
        </div>
      )}
    </div>
  )
}
