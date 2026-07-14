import { useEffect, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, UserMinus, MessageCircle, Link, Clock, BookOpen, Users, Trophy, Activity, ArrowRight } from 'lucide-react'
import { useSwipeable } from 'react-swipeable'
import { useProfilePanel } from '../context/ProfilePanelContext'
import { useAuth } from '../context/AuthContext'
import { apiGet, apiPost, apiDelete, imageUrl, formatDate } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { ProfilePanelSkeleton } from './profile/Skeleton'
import s from './ProfilePanel.module.css'

const ACTIVITY_ICONS = {
  studied: Clock,
  created_cards: BookOpen,
  joined_community: Users,
  joined_competition: Trophy,
}

export default function ProfilePanel() {
  const { panelState, closeProfile } = useProfilePanel()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const panelRef = useRef(null)
  const previousFocusRef = useRef(null)

  const { open, userId } = panelState
  const [swipeOffset, setSwipeOffset] = useState(0)

  const swipeHandlers = useSwipeable({
    onSwipedDown: (_e) => {
      setSwipeOffset(0)
      closeProfile()
    },
    onSwiping: (_e) => {
      const dy = _e.deltaY
      if (dy > 0) setSwipeOffset(dy)
    },
    onSwipedUp: () => setSwipeOffset(0),
    delta: 10,
    trackTouch: true,
    trackMouse: false,
    preventScrollOnSwipe: true,
  })

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: queryKeys.profile.detail(userId),
    queryFn: () => apiGet(`/users/${userId}/profile`),
    enabled: open && !!userId,
    staleTime: 30_000,
  })

  const { data: activityData = [], isLoading: activityLoading } = useQuery({
    queryKey: queryKeys.profile.activity(userId, 10),
    queryFn: () => apiGet(`/users/${userId}/activity?limit=10`).then(d => Array.isArray(d) ? d : []),
    enabled: open && !!userId,
    staleTime: 30_000,
  })

  const { data: followData } = useQuery({
    queryKey: queryKeys.follow.status(userId),
    queryFn: () => apiGet(`/users/${userId}/follow-status`),
    enabled: open && !!userId && user?.id !== userId,
    staleTime: 30_000,
  })

  const { data: achievements = [] } = useQuery({
    queryKey: queryKeys.profile.achievements(userId),
    queryFn: () => apiGet(`/users/${userId}/achievements`).then(d => Array.isArray(d) ? d : []),
    enabled: open && !!userId,
    staleTime: 30_000,
  })

  const isFollowing = followData?.following || false
  const isOwnProfile = user?.id === userId
  const loading = profileLoading || !profile

  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        await apiDelete(`/users/${userId}/follow`)
      } else {
        await apiPost(`/users/${userId}/follow`)
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.follow.status(userId) })
      const prev = queryClient.getQueryData(queryKeys.follow.status(userId))
      queryClient.setQueryData(queryKeys.follow.status(userId), { following: !isFollowing })

      await queryClient.cancelQueries({ queryKey: queryKeys.profile.detail(userId) })
      const prevProfile = queryClient.getQueryData(queryKeys.profile.detail(userId))
      if (prevProfile?.stats) {
        queryClient.setQueryData(queryKeys.profile.detail(userId), {
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
        queryClient.setQueryData(queryKeys.follow.status(userId), { following: true })
      } else {
        if (context?.prev) queryClient.setQueryData(queryKeys.follow.status(userId), context.prev)
        if (context?.prevProfile) queryClient.setQueryData(queryKeys.profile.detail(userId), context.prevProfile)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.follow.status(userId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail(userId) })
    },
  })

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement
      const timer = setTimeout(() => panelRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') closeProfile()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, closeProfile])

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) closeProfile()
  }, [closeProfile])

  const handleStartDM = async () => {
    if (!userId) return
    try {
      const result = await apiPost(`/users/${userId}/dm`)
      closeProfile()
      navigate(`/messages/${result.conversation_id}`)
    } catch (err) {
      Sentry.captureException(err)
      console.error('Failed to start DM:', err)
    }
  }

  const handleCopyLink = () => {
    const url = profile?.username
      ? `${window.location.origin}/u/${profile.username}`
      : `${window.location.origin}/profile/${userId}`
    navigator.clipboard.writeText(url).catch(() => {})
  }

  const handleViewFull = () => {
    closeProfile()
    if (profile?.username) {
      navigate(`/u/${profile.username}`)
    } else {
      navigate(`/profile/${userId}`)
    }
  }

  if (!open) return null

  const displayName = profile?.display_name || profile?.user_name || 'Student'
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className={s.backdrop} onClick={handleBackdropClick}>
      <div
        ref={panelRef}
        className={s.panel}
        tabIndex={-1}
        role="dialog"
        aria-label="User profile"
        {...swipeHandlers}
        style={swipeOffset > 0 ? { transform: `translateY(${swipeOffset}px)`, transition: 'none', opacity: Math.max(0.3, 1 - swipeOffset / 400) } : undefined}
      >
        {loading ? (
          <ProfilePanelSkeleton />
        ) : profile.hidden ? (
          <div className={s.errorState}>
            <p>This profile is private.</p>
            <button onClick={closeProfile} style={{ marginTop: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
          </div>
        ) : (
          <>
            <div className={s.header}>
              {profile.banner_url ? (
                <img className={s.banner} src={imageUrl(profile.banner_url)} alt="" />
              ) : (
                <div className={s.bannerPlaceholder} />
              )}
              <div className={s.avatarArea}>
                <div className={s.avatar}>
                  {profile.avatar_url ? (
                    <img src={imageUrl(profile.avatar_url)} alt={displayName} />
                  ) : initials}
                </div>
              </div>
            </div>

            <div className={s.info}>
              <h2 className={s.displayName}>{displayName}</h2>
              {profile.username && <p className={s.username}>@{profile.username}</p>}
              {profile.active_title && <div className={s.title}>{profile.active_title}</div>}
              {profile.bio && <p className={s.bio}>{profile.bio}</p>}
            </div>

            {!isOwnProfile && user && (
              <div className={s.actions}>
                <button
                  className={`${s.followBtn} ${isFollowing ? s.following : ''}`}
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending}
                >
                  {followMutation.isPending ? (
                    <span className={s.spinner} />
                  ) : isFollowing ? (
                    <><UserMinus size={14} /> Following</>
                  ) : (
                    <><UserPlus size={14} /> Follow</>
                  )}
                </button>
                <button className={s.msgBtn} onClick={handleStartDM} title="Send message">
                  <MessageCircle size={16} />
                </button>
                <button className={s.linkBtn} onClick={handleCopyLink} title="Copy profile link">
                  <Link size={16} />
                </button>
              </div>
            )}

            <div className={s.stats}>
              <div className={s.stat}>
                <div className={s.statValue}>{Math.round(profile.stats?.study_hours || 0)}</div>
                <div className={s.statLabel}>Hours</div>
              </div>
              <div className={s.stat}>
                <div className={s.statValue}>{profile.stats?.current_streak || 0}</div>
                <div className={s.statLabel}>Streak</div>
              </div>
              <div className={s.stat}>
                <div className={s.statValue}>{profile.stats?.followers_count || 0}</div>
                <div className={s.statLabel}>Followers</div>
              </div>
            </div>

            {achievements.length > 0 && (
              <div className={s.section}>
                <h3 className={s.sectionTitle}>Achievements</h3>
                <div className={s.badgeList}>
                  {achievements.slice(0, 5).map(a => (
                    <div key={a.id} className={s.badge}>
                      <span className={s.badgeEmoji}>{a.icon}</span>
                      <span>{a.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.communities?.length > 0 && (
              <div className={s.section}>
                <h3 className={s.sectionTitle}>Communities</h3>
                <div className={s.communityList}>
                  {profile.communities.slice(0, 3).map(c => (
                    <div
                      key={c.id}
                      className={s.community}
                      onClick={() => { closeProfile(); navigate(`/communities/${c.id}`) }}
                    >
                      <div className={s.communityAvatar}>
                        {c.avatar_url ? <img src={imageUrl(c.avatar_url)} alt="" loading="lazy" /> : (c.name?.[0]?.toUpperCase() || 'C')}
                      </div>
                      <span className={s.communityName}>{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activityData.length > 0 && (
              <div className={s.section}>
                <h3 className={s.sectionTitle}>Recent Activity</h3>
                <div className={s.activityList}>
                  {activityData.slice(0, 5).map(a => {
                    const Icon = ACTIVITY_ICONS[a.type] || Activity
                    return (
                      <div key={a.id} className={s.activity}>
                        <div className={s.activityIcon}><Icon size={12} /></div>
                        <span className={s.activityText}>
                          {a.type === 'studied' && 'Studied a session'}
                          {a.type === 'created_cards' && `Created ${a.metadata?.count || ''} card${a.metadata?.count !== 1 ? 's' : ''}`}
                          {a.type === 'joined_community' && 'Joined a community'}
                          {!['studied', 'created_cards', 'joined_community'].includes(a.type) && a.type.replace(/_/g, ' ')}
                        </span>
                        <span className={s.activityTime}>{formatDate(a.created_at)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <button className={s.viewFull} onClick={handleViewFull}>
              View Full Profile <ArrowRight size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
