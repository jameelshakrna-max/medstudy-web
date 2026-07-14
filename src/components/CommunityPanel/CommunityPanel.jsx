import { useEffect, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { useCommunityPanel } from '../../context/CommunityPanelContext'
import { useAuth } from '../../context/AuthContext'
import Header from './Header'
import JoinButton from './JoinButton'
import MembersList from './MembersList'
import ActivityCard from './ActivityCard'
import StatsCard from './StatsCard'
import s from './CommunityPanel.module.css'

export default function CommunityPanel() {
  const { panelState, closeCommunity } = useCommunityPanel()
  const { user } = useAuth()
  const { open, communityId } = panelState
  const panelRef = useRef(null)
  const previousFocusRef = useRef(null)

  const { data: fullData, isLoading } = useQuery({
    queryKey: queryKeys.communityPanel.full(communityId),
    queryFn: () => apiGet(`/communities/${communityId}/full`),
    enabled: open && !!communityId,
    staleTime: 60_000,
  })

  const { data: heatmap } = useQuery({
    queryKey: queryKeys.communityPanel.heatmap(communityId, new Date().getFullYear()),
    queryFn: () => apiGet(`/communities/${communityId}/stats/heatmap?year=${new Date().getFullYear()}`),
    enabled: open && !!communityId && !!fullData,
    staleTime: 300_000,
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
    const handler = (e) => { if (e.key === 'Escape') closeCommunity() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, closeCommunity])

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) closeCommunity()
  }

  const swipeHandlers = useSwipeable({
    onSwipedDown: () => { if (window.innerWidth <= 480) closeCommunity() },
    delta: 40,
    trackTouch: true,
  })

  if (!open || !communityId) return null

  const community = fullData?.community
  const members = fullData?.members || []

  return (
    <div className={s.backdrop} onClick={handleBackdropClick}>
      <div
        className={s.panel}
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Community details"
        {...swipeHandlers}
      >
        {isLoading ? (
          <div className={s.skeleton}>
            <div className={s.skeletonHeader} />
            <div className={s.skeletonBlock} />
            <div className={s.skeletonBlock} />
            <div className={s.skeletonBlock} />
          </div>
        ) : community ? (
          <>
            <Header community={community} onClose={closeCommunity} />
            <div className={s.content}>
              <JoinButton communityId={communityId} community={community} members={members} />
              <StatsCard community={community} members={members} />
              <ActivityCard communityId={communityId} heatmap={heatmap} />
              <MembersList communityId={communityId} members={members} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
