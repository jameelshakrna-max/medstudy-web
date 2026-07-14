import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiGet, apiPost, apiDelete } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { ChevronLeft, Lock, Users } from 'lucide-react'
import StudyHeatmap from '../components/StudyHeatmap'
import PinnedResources from '../components/PinnedResources'
import ReputationBadge from '../components/ReputationBadge'
import FavoriteSubjects from '../components/FavoriteSubjects'
import ProfileHeader from '../components/profile/ProfileHeader'
import ProfileBadges from '../components/profile/ProfileBadges'
import ProfileCommunities from '../components/profile/ProfileCommunities'
import ProfileActivity from '../components/profile/ProfileActivity'
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
      <div className={s.loadingSpinner} /> Loading profile...
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

  return (
    <div className={s.page}>
      <button className={s.backBtn} onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/dashboard')}>
        <ChevronLeft size={16} strokeWidth={1.5} /> Back
      </button>

      <ProfileHeader
        profile={profile}
        userId={resolvedUserId}
        isOwnProfile={isOwnProfile}
        isFollowing={isFollowing}
        followLoading={followLoading}
        user={user}
        onFollowToggle={handleFollowToggle}
        onStartDM={handleStartDM}
      />

      <StudyHeatmap userId={resolvedUserId} />

      {profile.bio && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}>About</h2>
          <p className={s.bio}>{profile.bio}</p>
        </div>
      )}

      {(profile.university || profile.specialty || profile.graduation_year || profile.languages) && (
        <div className={s.section}>
          <h2 className={s.sectionTitle}>Contact Card</h2>
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
          <h2 className={s.sectionTitle}>Reputation</h2>
          <ReputationBadge reputation={profile.reputation} size="lg" />
        </div>
      )}

      <PinnedResources userId={resolvedUserId} isOwnProfile={isOwnProfile} />

      <ProfileBadges
        pinnedBadges={profile.pinned_badges}
        badges={profile.badges}
        achievements={achievements}
      />

      <ProfileCommunities
        communities={profile.communities}
        sharedCommunities={profile.shared_communities}
        showShared={user?.id !== profile.user_id}
        currentUserId={user?.id}
      />

      <ProfileActivity activity={activity} loading={activityLoading} />

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
