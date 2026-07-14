import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { queryKeys } from '../lib/queryKeys'
import { ChevronLeft, Lock, Users } from 'lucide-react'
import StudyHeatmap from '../components/StudyHeatmap'
import PinnedResources from '../components/PinnedResources'
import ReputationBadge from '../components/ReputationBadge'
import FavoriteSubjects from '../components/FavoriteSubjects'
import ProfileHeader from '../components/profile/ProfileHeader'
import ProfileBadges from '../components/profile/ProfileBadges'
import ProfileCommunities from '../components/profile/ProfileCommunities'
import s from './ProfilePage.module.css'

export default function ProfilePage() {
  const { userId: paramId, username: paramUsername } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [resolvedUserId, setResolvedUserId] = useState(null)

  const { data: usernameData, isLoading: resolvingUsername } = useQuery({
    queryKey: queryKeys.profile.byUsername(paramUsername),
    queryFn: () => apiGet(`/users/username/${paramUsername}`),
    enabled: !!paramUsername && !paramId,
  })

  useEffect(() => {
    if (paramId) {
      setResolvedUserId(paramId)
    } else if (usernameData?.user_id) {
      setResolvedUserId(usernameData.user_id)
    }
  }, [paramId, usernameData])

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: queryKeys.profile.detail(resolvedUserId),
    queryFn: () => apiGet(`/users/${resolvedUserId}/profile`),
    enabled: !!resolvedUserId,
  })

  const { data: followData } = useQuery({
    queryKey: queryKeys.follow.status(resolvedUserId),
    queryFn: () => apiGet(`/users/${resolvedUserId}/follow-status`),
    enabled: !!resolvedUserId && user?.id !== resolvedUserId,
  })

  const { data: achievements = [] } = useQuery({
    queryKey: queryKeys.profile.achievements(resolvedUserId),
    queryFn: () => apiGet(`/users/${resolvedUserId}/achievements`).then(d => Array.isArray(d) ? d : []),
    enabled: !!resolvedUserId,
  })

  const isFollowing = followData?.following || false
  const isOwnProfile = user?.id === resolvedUserId

  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        await apiDelete(`/users/${resolvedUserId}/follow`)
      } else {
        await apiPost(`/users/${resolvedUserId}/follow`)
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.follow.status(resolvedUserId) })
      const prev = queryClient.getQueryData(queryKeys.follow.status(resolvedUserId))
      queryClient.setQueryData(queryKeys.follow.status(resolvedUserId), { following: !isFollowing })

      await queryClient.cancelQueries({ queryKey: queryKeys.profile.detail(resolvedUserId) })
      const prevProfile = queryClient.getQueryData(queryKeys.profile.detail(resolvedUserId))
      if (prevProfile?.stats) {
        queryClient.setQueryData(queryKeys.profile.detail(resolvedUserId), {
          ...prevProfile,
          stats: {
            ...prevProfile.stats,
            followers_count: Math.max(0, (prevProfile.stats.followers_count || 0) + (isFollowing ? -1 : 1)),
          },
        })
      }

      return { prev, prevProfile }
    },
    onError: (err, _vars, context) => {
      if (err.message === 'Already following') {
        queryClient.setQueryData(queryKeys.follow.status(resolvedUserId), { following: true })
      } else {
        if (context?.prev) queryClient.setQueryData(queryKeys.follow.status(resolvedUserId), context.prev)
        if (context?.prevProfile) queryClient.setQueryData(queryKeys.profile.detail(resolvedUserId), context.prevProfile)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.follow.status(resolvedUserId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail(resolvedUserId) })
    },
  })

  const handleStartDM = async () => {
    try {
      const data = await apiPost(`/users/${resolvedUserId}/dm`)
      navigate(`/messages/${data.conversation_id}`)
    } catch (err) {
      console.error('Failed to start DM:', err)
    }
  }

  const isLoading = profileLoading || resolvingUsername || !resolvedUserId

  if (isLoading) return (
    <div className={s.loading}>
      <div className={s.loadingSpinner} /> Loading profile...
    </div>
  )

  if (profileError) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div style={{ color: 'var(--red)', marginBottom: 12 }}>User not found</div>
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
        followLoading={followMutation.isPending}
        user={user}
        onFollowToggle={() => followMutation.mutate()}
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
