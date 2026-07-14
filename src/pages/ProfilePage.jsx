import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiGet, apiPost, apiDelete, formatDate, imageUrl } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { ChevronLeft, MapPin, ExternalLink, Calendar, Clock, BookOpen, Flame, Users, Trophy, Loader2, Pencil, UserPlus, UserMinus, Activity, MessageCircle, GraduationCap, Globe, Lock } from 'lucide-react'
import RoleBadge from '../components/RoleBadge'
import AvatarUpload from '../components/AvatarUpload'
import StudyHeatmap from '../components/StudyHeatmap'
import PinnedResources from '../components/PinnedResources'
import ReputationBadge from '../components/ReputationBadge'
import FavoriteSubjects from '../components/FavoriteSubjects'
import s from './ProfilePage.module.css'

export default function ProfilePage() {
  const { userId: paramId, username: paramUsername } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resolvedUserId, setResolvedUserId] = useState(null)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [achievements, setAchievements] = useState([])

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

  useEffect(() => {
    if (!resolvedUserId) return
    setActivityLoading(true)
    apiGet(`/users/${resolvedUserId}/activity?limit=20`).then(data => {
      setActivity(Array.isArray(data) ? data : [])
    }).catch(() => setActivity([])).finally(() => setActivityLoading(false))
  }, [resolvedUserId])

  const isOwnProfile = user?.id === resolvedUserId

  useEffect(() => {
    if (!resolvedUserId || isOwnProfile) return
    apiGet(`/users/${resolvedUserId}/follow-status`).then(data => {
      setIsFollowing(data?.following || false)
    }).catch(() => setIsFollowing(false))
  }, [resolvedUserId, isOwnProfile])

  useEffect(() => {
    if (!resolvedUserId) return
    apiGet(`/users/${resolvedUserId}/achievements`).then(data => {
      setAchievements(Array.isArray(data) ? data : [])
    }).catch(() => setAchievements([]))
  }, [resolvedUserId])

  const handleFollowToggle = async () => {
    if (followLoading) return
    setFollowLoading(true)
    try {
      if (isFollowing) {
        await apiDelete(`/users/${resolvedUserId}/follow`)
        setIsFollowing(false)
        setProfile(prev => prev ? { ...prev, stats: { ...prev.stats, followers_count: Math.max(0, (prev.stats?.followers_count || 1) - 1) } } : prev)
      } else {
        await apiPost(`/users/${resolvedUserId}/follow`)
        setIsFollowing(true)
        setProfile(prev => prev ? { ...prev, stats: { ...prev.stats, followers_count: (prev.stats?.followers_count || 0) + 1 } } : prev)
      }
    } catch (err) {
      console.error('Follow toggle failed:', err)
    } finally {
      setFollowLoading(false)
    }
  }

  const handleStartDM = async () => {
    try {
      const data = await apiPost(`/users/${resolvedUserId}/dm`)
      navigate(`/messages/${data.conversation_id}`)
    } catch (err) {
      console.error('Failed to start DM:', err)
    }
  }

  if (loading) return (
    <div className={s.loading}>
      <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading profile...
    </div>
  )

  if (error) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</div>
      <button onClick={() => navigate(-1)} style={{ color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Go Back</button>
    </div>
  )

  if (profile?.hidden) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <Lock size={48} strokeWidth={1} style={{ color: 'var(--mist)', marginBottom: 16 }} />
      <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: 'var(--text-primary)', marginBottom: 8 }}>Private Account</h2>
      <p style={{ color: 'var(--mist)', marginBottom: 20 }}>This user has set their profile to private.</p>
      <button onClick={() => navigate(-1)} style={{ color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Go Back</button>
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
          {isOwnProfile ? (
            <Link to="/settings" className={s.editBtn}>
              <Pencil size={14} /> Edit Profile
            </Link>
          ) : user ? (
            <button
              className={`${s.editBtn} ${isFollowing ? s.followingBtn : ''}`}
              onClick={handleFollowToggle}
              disabled={followLoading}
            >
              {followLoading ? (
                <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
              ) : isFollowing ? (
                <><UserMinus size={14} /> Following</>
              ) : (
                <><UserPlus size={14} /> Follow</>
              )}
            </button>
          ) : null}
          {user && !isOwnProfile && (
            <button className={s.editBtn} onClick={handleStartDM} style={{ marginLeft: 8 }}>
              <MessageCircle size={14} /> Message
            </button>
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
          <div className={s.statItem}>
            <div className={s.statValue}>{profile.stats?.followers_count || 0}</div>
            <div className={s.statLabel}>Followers</div>
          </div>
          <div className={s.statItem}>
            <div className={s.statValue}>{profile.stats?.following_count || 0}</div>
            <div className={s.statLabel}>Following</div>
          </div>
        </div>
      </div>

      <StudyHeatmap userId={resolvedUserId} />

      {profile.bio && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}>About</h2>
          <p className={s.bio}>{profile.bio}</p>
        </div>
      )}

      {(profile.university || profile.specialty || profile.graduation_year || profile.languages) && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}><GraduationCap size={18} /> Contact Card</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {profile.university && (
              <div style={{ fontSize: 13 }}>
                <div style={{ color: 'var(--mist)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>University</div>
                <div style={{ color: 'var(--text)' }}>{profile.university}</div>
              </div>
            )}
            {profile.specialty && (
              <div style={{ fontSize: 13 }}>
                <div style={{ color: 'var(--mist)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Specialty</div>
                <div style={{ color: 'var(--text)' }}>{profile.specialty}</div>
              </div>
            )}
            {profile.graduation_year && (
              <div style={{ fontSize: 13 }}>
                <div style={{ color: 'var(--mist)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Graduation Year</div>
                <div style={{ color: 'var(--text)' }}>{profile.graduation_year}</div>
              </div>
            )}
            {profile.languages && (
              <div style={{ fontSize: 13 }}>
                <div style={{ color: 'var(--mist)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Languages</div>
                <div style={{ color: 'var(--text)' }}>{profile.languages}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <FavoriteSubjects subjects={profile.favorite_subjects} />

      {profile.reputation > 0 && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}>⭐ Reputation</h2>
          <ReputationBadge reputation={profile.reputation} size="lg" />
        </div>
      )}

      <PinnedResources userId={resolvedUserId} isOwnProfile={isOwnProfile} />

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

      {achievements.length > 0 && (
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

      {profile.shared_communities?.length > 0 && user?.id !== profile.user_id && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}><Users size={18} /> Shared Communities</h2>
          <div className={s.communityList}>
            {profile.shared_communities.map(c => (
              <Link key={c.id} to={`/communities/${c.id}`} className={s.communityItem}>
                <div className={s.communityAvatar}>
                  {c.avatar_url ? <img src={imageUrl(c.avatar_url)} alt="" /> : (c.name?.[0]?.toUpperCase() || 'C')}
                </div>
                <div className={s.communityInfo}>
                  <div className={s.communityName}>{c.name}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {activity.length > 0 && (
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
      )}

      {!profile.bio && !profile.badges?.length && !profile.communities?.length && activity.length === 0 && (
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
