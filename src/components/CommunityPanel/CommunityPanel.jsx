import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { useCommunityPanel } from '../../context/CommunityPanelContext'
import { useAuth } from '../../context/AuthContext'
import Drawer from '../ui/Drawer/Drawer'
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

  if (!open || !communityId) return null

  const community = fullData?.community
  const members = fullData?.members || []

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) closeCommunity() }} side="right" width={380}>
      <div className={s.panelInner}>
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
    </Drawer>
  )
}
